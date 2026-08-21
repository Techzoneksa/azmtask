import "server-only";

import { HousekeepingStatus, ReservationStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { AppError, withDbErrors } from "@/server/errors";

import { getBusinessDate } from "@/server/business-date";

import { recordActivity, type ActivityActor } from "./activity.service";
import { queueTurnoverClean } from "./housekeeping.service";
import { BLOCKING_STATUSES } from "./reservation.service";
import { syncUnitStatus } from "./unit.service";

/**
 * The stay lifecycle — departure and the housekeeping cycle that follows it.
 *
 * These are the operations where one user action has to move several tables at
 * once: the reservation's status, the unit's occupancy, its housekeeping state, and
 * the audit trail. Written as separate calls they drift the moment one of them
 * fails; written here, each is a single transaction that either lands completely or
 * not at all.
 *
 * Check-in used to live here too, as a placeholder written ahead of its stage. Stage 9
 * replaced it with `checkin.service.ts`, which does what a real arrival needs — guest
 * requirements, room assignment, readiness, unit-type locking, idempotency — and the
 * placeholder was deleted rather than left beside it. Two functions called `checkIn`
 * with different rules is exactly how a system starts disagreeing with itself.
 *
 * Cleaning completion went the same way in Stage 10. The version that lived here wrote
 * `unit.status` from a hand-rolled ternary that knew about maintenance and occupancy
 * but not about blocks — so cleaning a blocked room quietly put it back on the market.
 * The housekeeping service owns that transition now, and reaches the room's operational
 * status through the same derivation everything else uses.
 */

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
        // The room becomes physically dirty; whether it is sellable follows from the
        // records — the guest has gone, so derivation, not this line, decides.
        await tx.unit.update({
          where: { id: reservation.unitId },
          data: { housekeepingStatus: HousekeepingStatus.DIRTY },
        });

        /*
         * The one place a turnover clean is created. Stage 10 moved the dedup rule,
         * the priority and the origin reference into the housekeeping service so a
         * departure and a supervisor raising work by hand cannot drift apart — a
         * second automatic pathway is how a hotel ends up with two tasks for one room
         * and no idea which is real.
         */
        await queueTurnoverClean(tx, {
          propertyId: reservation.propertyId,
          unitId: reservation.unitId,
          reservationId: reservation.id,
          reservationNumber: reservation.reservationNumber,
          actor,
        });

        await syncUnitStatus(tx, reservation.unitId, await getBusinessDate());
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
