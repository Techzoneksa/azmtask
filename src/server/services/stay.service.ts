import "server-only";

import {
  HousekeepingStatus,
  HousekeepingTaskStatus,
  HousekeepingTaskType,
  ReservationStatus,
  TaskPriority,
  UnitMaintenanceStatus,
  UnitStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { AppError, withDbErrors } from "@/server/errors";

import { recordActivity, type ActivityActor } from "./activity.service";
import { BLOCKING_STATUSES, lockUnitAndAssertAvailable } from "./reservation.service";

/**
 * The stay lifecycle — check-in and check-out.
 *
 * These are the operations where one user action has to move several tables at
 * once: the reservation's status, the unit's occupancy, its housekeeping state, and
 * the audit trail. Written as separate calls they drift the moment one of them
 * fails; written here, each is a single transaction that either lands completely or
 * not at all.
 *
 * The screens arrive in Stages 9 and 15. This is the transactional core they call,
 * built now so those stages are wiring rather than redesign.
 */

export async function checkIn(
  reservationId: string,
  actor: ActivityActor,
  options: { notes?: string } = {},
) {
  return withDbErrors("stay.checkIn", () =>
    prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          unitId: true,
          status: true,
          checkInDate: true,
          checkOutDate: true,
        },
      });

      if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

      if (reservation.status === ReservationStatus.CHECKED_IN) {
        throw new AppError("CONFLICT", "تم تسجيل دخول هذا الحجز مسبقًا.");
      }
      if (reservation.status === ReservationStatus.CANCELLED) {
        throw new AppError("CONFLICT", "لا يمكن تسجيل دخول حجز ملغي.");
      }
      if (reservation.status === ReservationStatus.CHECKED_OUT) {
        throw new AppError("CONFLICT", "تمت مغادرة هذا الحجز ولا يمكن تسجيل دخوله مرة أخرى.");
      }
      if (!reservation.unitId) {
        throw new AppError(
          "VALIDATION",
          "لا يمكن تسجيل الدخول قبل تحديد الوحدة المخصصة للنزيل.",
          { fields: { unitId: "يجب تحديد الوحدة أولًا" } },
        );
      }

      // Locks the unit and re-verifies that nothing else booked it in the meantime.
      await lockUnitAndAssertAvailable(tx, {
        unitId: reservation.unitId,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        excludeReservationId: reservation.id,
      });

      const unit = await tx.unit.findUnique({
        where: { id: reservation.unitId },
        select: { id: true, unitNumber: true, maintenanceStatus: true, housekeepingStatus: true },
      });

      if (unit?.maintenanceStatus === UnitMaintenanceStatus.OUT_OF_SERVICE) {
        throw new AppError("CONFLICT", "الوحدة خارج الخدمة حاليًا ولا يمكن إشغالها.");
      }

      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.CHECKED_IN,
          checkedInAt: new Date(),
          ...(options.notes ? { internalNotes: options.notes } : {}),
        },
        select: { id: true, reservationNumber: true, status: true, checkedInAt: true },
      });

      await tx.unit.update({
        where: { id: reservation.unitId },
        data: { status: UnitStatus.OCCUPIED },
      });

      await recordActivity(
        {
          actor,
          propertyId: reservation.propertyId,
          module: "reservations",
          action: "check_in",
          entityType: "Reservation",
          entityId: reservation.id,
          description: `تسجيل دخول الحجز ${reservation.reservationNumber} في الوحدة ${unit?.unitNumber ?? "-"}`,
          metadata: { unitId: reservation.unitId, reservationNumber: reservation.reservationNumber },
        },
        tx,
      );

      return updated;
    }),
  );
}

/**
 * Completes a stay. Beyond the status change this releases the room and puts it
 * into the housekeeping queue automatically — the linkage the operations brief
 * calls for, so nobody has to remember to mark the room dirty by hand.
 *
 * An outstanding balance blocks checkout unless the caller explicitly overrides,
 * which is a decision the permission layer gates rather than this service.
 */
export async function checkOut(
  reservationId: string,
  actor: ActivityActor,
  options: { allowOutstandingBalance?: boolean } = {},
) {
  return withDbErrors("stay.checkOut", () =>
    prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          unitId: true,
          status: true,
          balance: true,
        },
      });

      if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");
      if (reservation.status !== ReservationStatus.CHECKED_IN) {
        throw new AppError(
          "CONFLICT",
          "لا يمكن إتمام المغادرة إلا لحجز مسجّل الدخول.",
        );
      }

      if (
        !options.allowOutstandingBalance &&
        reservation.balance.greaterThan(0)
      ) {
        throw new AppError(
          "CONFLICT",
          `يوجد رصيد مستحق قدره ${reservation.balance.toFixed(2)} ريال. سدّد المبلغ أو أكمل المغادرة بصلاحية خاصة.`,
        );
      }

      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.CHECKED_OUT,
          checkedOutAt: new Date(),
        },
        select: { id: true, reservationNumber: true, status: true, checkedOutAt: true },
      });

      if (reservation.unitId) {
        // The room leaves the sold state and enters the cleaning cycle in one step.
        await tx.unit.update({
          where: { id: reservation.unitId },
          data: {
            status: UnitStatus.CLEANING,
            housekeepingStatus: HousekeepingStatus.DIRTY,
          },
        });

        // One open cleaning task per unit — a second checkout should not queue a
        // duplicate for a room already waiting to be cleaned.
        const openTask = await tx.housekeepingTask.count({
          where: {
            unitId: reservation.unitId,
            status: {
              in: [
                HousekeepingTaskStatus.PENDING,
                HousekeepingTaskStatus.ASSIGNED,
                HousekeepingTaskStatus.IN_PROGRESS,
              ],
            },
          },
        });

        if (openTask === 0) {
          await tx.housekeepingTask.create({
            data: {
              propertyId: reservation.propertyId,
              unitId: reservation.unitId,
              taskType: HousekeepingTaskType.CHECKOUT_CLEANING,
              status: HousekeepingTaskStatus.PENDING,
              priority: TaskPriority.HIGH,
              notes: `تنظيف بعد مغادرة الحجز ${reservation.reservationNumber}`,
            },
          });
        }
      }

      await recordActivity(
        {
          actor,
          propertyId: reservation.propertyId,
          module: "reservations",
          action: "check_out",
          entityType: "Reservation",
          entityId: reservation.id,
          description: `إتمام مغادرة الحجز ${reservation.reservationNumber}`,
          metadata: {
            reservationNumber: reservation.reservationNumber,
            outstandingBalance: reservation.balance.toFixed(2),
          },
        },
        tx,
      );

      return updated;
    }),
  );
}

/**
 * Completes a cleaning task and returns the room to the market — the other half of
 * the checkout linkage. A room still under maintenance stays out of service; only
 * an operational room becomes available.
 */
export async function completeHousekeepingTask(
  taskId: string,
  actor: ActivityActor,
) {
  return withDbErrors("stay.completeHousekeeping", () =>
    prisma.$transaction(async (tx) => {
      const task = await tx.housekeepingTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          propertyId: true,
          unitId: true,
          status: true,
          unit: { select: { unitNumber: true, maintenanceStatus: true } },
        },
      });

      if (!task) throw new AppError("NOT_FOUND", "مهمة النظافة غير موجودة.");
      if (task.status === HousekeepingTaskStatus.COMPLETED) return task;
      if (task.status === HousekeepingTaskStatus.CANCELLED) {
        throw new AppError("CONFLICT", "المهمة ملغاة ولا يمكن إكمالها.");
      }

      await tx.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: HousekeepingTaskStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      // A room whose stay has not ended yet was a stay-over clean: it stays occupied.
      const stillOccupied = await tx.reservation.count({
        where: {
          unitId: task.unitId,
          status: ReservationStatus.CHECKED_IN,
        },
      });

      const outOfService =
        task.unit?.maintenanceStatus === UnitMaintenanceStatus.OUT_OF_SERVICE;

      await tx.unit.update({
        where: { id: task.unitId },
        data: {
          housekeepingStatus: HousekeepingStatus.CLEAN,
          status: outOfService
            ? UnitStatus.MAINTENANCE
            : stillOccupied > 0
              ? UnitStatus.OCCUPIED
              : UnitStatus.AVAILABLE,
        },
      });

      await recordActivity(
        {
          actor,
          propertyId: task.propertyId,
          module: "housekeeping",
          action: "complete",
          entityType: "HousekeepingTask",
          entityId: task.id,
          description: `إنهاء تنظيف الوحدة ${task.unit?.unitNumber ?? "-"}`,
        },
        tx,
      );

      return task;
    }),
  );
}

/** Reservations currently holding a unit — used by unit detail and the board. */
export async function activeReservationForUnit(unitId: string) {
  return prisma.reservation.findFirst({
    where: { unitId, status: { in: BLOCKING_STATUSES } },
    orderBy: { checkInDate: "asc" },
    select: {
      id: true,
      reservationNumber: true,
      checkInDate: true,
      checkOutDate: true,
      status: true,
      guest: { select: { id: true, fullName: true } },
    },
  });
}
