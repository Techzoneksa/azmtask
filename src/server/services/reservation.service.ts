import "server-only";

import { z } from "zod";

import {
  PaymentStatus,
  ReservationSource,
  ReservationStatus,
  UnitStatus,
} from "@/generated/prisma/enums";
import type { Db } from "@/lib/db";
import { prisma } from "@/lib/db";
import { businessDate, nightsBetween } from "@/lib/datetime";
import * as Money from "@/lib/money";
import { AppError, withDbErrors } from "@/server/errors";
import {
  BusinessDateSchema,
  IdSchema,
  MoneySchema,
  fieldErrors,
} from "@/server/validation";

import { recordActivity, type ActivityActor } from "./activity.service";
import { nextDocumentNumber } from "./numbering";

/**
 * Reservations.
 *
 * The rule this module exists to guarantee: a unit is never sold twice for the same
 * night. Two half-open date ranges collide when each starts before the other ends —
 *
 *     newCheckIn < existingCheckOut  AND  newCheckOut > existingCheckIn
 *
 * — and only reservations in a blocking status take part. A cancelled booking
 * releases its room; a departed guest's booking does not hold the room they left.
 *
 * Checking availability and then inserting is not enough. Two receptionists
 * confirming the same room in the same second both read "available" and both
 * insert. MySQL has no exclusion constraint to express the overlap declaratively,
 * so the guarantee comes from a pessimistic lock instead: every write path takes
 * `SELECT ... FOR UPDATE` on the unit row before it looks at the calendar, which
 * serialises all reservation writes for that unit behind the database. The second
 * request waits, re-reads, and sees the first one's booking.
 *
 * The complete booking UI arrives in Stage 7. What is here now is the concurrency-
 * safe core it will call.
 */

/**
 * Statuses that hold a room. PENDING is included: an unconfirmed hold still keeps
 * the room off the market until it is explicitly cancelled or expires. CHECKED_OUT,
 * CANCELLED and NO_SHOW release it.
 */
export const BLOCKING_STATUSES: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
];

export type AvailabilityQuery = {
  unitId: string;
  checkInDate: Date;
  checkOutDate: Date;
  /** Ignore this reservation — used when editing an existing booking's dates. */
  excludeReservationId?: string;
};

/**
 * Reservations that would collide with the given range. Read-only: safe for an
 * availability screen, but never sufficient on its own to authorise a booking.
 */
export async function findConflicts(
  query: AvailabilityQuery,
  db: Db = prisma,
) {
  return db.reservation.findMany({
    where: {
      unitId: query.unitId,
      status: { in: BLOCKING_STATUSES },
      checkInDate: { lt: businessDate(query.checkOutDate) },
      checkOutDate: { gt: businessDate(query.checkInDate) },
      ...(query.excludeReservationId
        ? { id: { not: query.excludeReservationId } }
        : {}),
    },
    select: {
      id: true,
      reservationNumber: true,
      checkInDate: true,
      checkOutDate: true,
      status: true,
    },
  });
}

export async function isUnitAvailable(
  query: AvailabilityQuery,
  db: Db = prisma,
): Promise<boolean> {
  const conflicts = await findConflicts(query, db);
  return conflicts.length === 0;
}

/**
 * Takes the unit's row lock, then verifies availability. Must run inside a
 * transaction: the lock lives until that transaction commits, and it is the lock —
 * not the query that follows it — that makes the check safe under concurrency.
 */
export async function lockUnitAndAssertAvailable(
  tx: Db,
  query: AvailabilityQuery,
): Promise<void> {
  const locked = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
    "SELECT `id`, `status` FROM `units` WHERE `id` = ? FOR UPDATE",
    query.unitId,
  );

  if (locked.length === 0) {
    throw new AppError("NOT_FOUND", "الوحدة المحددة غير موجودة.");
  }

  if (locked[0].status === UnitStatus.BLOCKED) {
    throw new AppError("CONFLICT", "الوحدة موقوفة عن الحجز حاليًا.");
  }

  const conflicts = await findConflicts(query, tx);
  if (conflicts.length > 0) {
    const other = conflicts[0];
    throw new AppError(
      "CONFLICT",
      `الوحدة محجوزة بالفعل ضمن هذه الفترة (حجز رقم ${other.reservationNumber}).`,
      { fields: { unitId: "الوحدة غير متاحة في التواريخ المحددة" } },
    );
  }
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

/**
 * Recomputes every derived money field on a reservation from its child rows, which
 * are the canonical source:
 *
 *   subtotal          nightlyRate x nights
 *   additionalCharges SUM(reservation_charges.total)
 *   total             subtotal - discount + tax + additionalCharges
 *   paidAmount        SUM(payments.amount)   (refunds are negative)
 *   balance           total - paidAmount
 *   paymentStatus     derived from balance and paidAmount, never set independently
 *
 * Always called inside the same transaction as the charge or payment that made it
 * necessary, so the cached figures and the rows they summarise cannot disagree.
 */
export async function recalculateTotals(
  tx: Db,
  reservationId: string,
): Promise<void> {
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      nightlyRate: true,
      discount: true,
      tax: true,
      checkInDate: true,
      checkOutDate: true,
      status: true,
    },
  });

  if (!reservation) {
    throw new AppError("NOT_FOUND", "الحجز غير موجود.");
  }

  const [chargeTotals, paymentTotals] = await Promise.all([
    tx.reservationCharge.aggregate({
      where: { reservationId },
      _sum: { total: true },
    }),
    tx.payment.aggregate({
      where: { reservationId },
      _sum: { amount: true },
    }),
  ]);

  const nights = nightsBetween(reservation.checkInDate, reservation.checkOutDate);
  const subtotal = Money.multiply(reservation.nightlyRate, nights);
  const additionalCharges = Money.money(chargeTotals._sum.total);
  const paidAmount = Money.money(paymentTotals._sum.amount);

  const total = Money.add(
    Money.subtract(subtotal, reservation.discount),
    reservation.tax,
    additionalCharges,
  );
  const balance = Money.subtract(total, paidAmount);

  await tx.reservation.update({
    where: { id: reservationId },
    data: {
      subtotal,
      additionalCharges,
      total,
      paidAmount,
      balance,
      paymentStatus: derivePaymentStatus(total, paidAmount, balance),
    },
  });
}

function derivePaymentStatus(
  total: Money.Money,
  paid: Money.Money,
  balance: Money.Money,
): PaymentStatus {
  if (Money.isNegative(paid)) return PaymentStatus.REFUNDED;
  if (Money.isZero(paid)) return PaymentStatus.UNPAID;
  // Overpayment still reads as PAID: the excess is a refund waiting to happen, not
  // an unpaid balance.
  if (balance.lessThanOrEqualTo(0)) return PaymentStatus.PAID;
  if (Money.isPositive(paid) && Money.isPositive(balance)) {
    return PaymentStatus.PARTIALLY_PAID;
  }
  if (Money.isZero(total)) return PaymentStatus.PAID;
  return PaymentStatus.UNPAID;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export const CreateReservationSchema = z
  .object({
    propertyId: IdSchema,
    guestId: IdSchema,
    unitId: IdSchema.optional(),
    unitTypeId: IdSchema,
    source: z.nativeEnum(ReservationSource).default(ReservationSource.DIRECT),
    checkInDate: BusinessDateSchema,
    checkOutDate: BusinessDateSchema,
    adults: z.coerce.number().int().min(1, "عدد البالغين لا يقل عن 1").max(20),
    children: z.coerce.number().int().min(0).max(20).default(0),
    nightlyRate: MoneySchema,
    discount: MoneySchema.optional(),
    tax: MoneySchema.optional(),
    status: z
      .nativeEnum(ReservationStatus)
      .default(ReservationStatus.PENDING)
      .refine(
        (value) =>
          value === ReservationStatus.PENDING ||
          value === ReservationStatus.CONFIRMED,
        { message: "الحجز الجديد يبدأ بحالة مبدئية أو مؤكدة فقط" },
      ),
    specialRequests: z.string().trim().max(2000).optional(),
    internalNotes: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (nightsBetween(value.checkInDate, value.checkOutDate) < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkOutDate"],
        message: "تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول بليلة واحدة على الأقل",
      });
    }
  });

export type CreateReservationInput = z.input<typeof CreateReservationSchema>;

/**
 * Creates a reservation. Everything below happens in one transaction: the unit
 * lock, the availability check, the number allocation, the insert, the derived
 * totals and the audit entry. Either a booking exists complete and consistent, or
 * nothing was written at all.
 */
export async function createReservation(
  rawInput: CreateReservationInput,
  actor: ActivityActor,
) {
  const parsed = CreateReservationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات الحجز غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;

  return withDbErrors("reservation.create", () =>
    prisma.$transaction(async (tx) => {
      if (input.unitId) {
        await lockUnitAndAssertAvailable(tx, {
          unitId: input.unitId,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
        });

        // The unit must belong to the property the reservation is filed under —
        // a foreign key alone cannot express a constraint that spans two tables.
        const unit = await tx.unit.findUnique({
          where: { id: input.unitId },
          select: { propertyId: true },
        });
        if (unit?.propertyId !== input.propertyId) {
          throw new AppError("VALIDATION", "الوحدة المحددة لا تتبع هذه المنشأة.", {
            fields: { unitId: "الوحدة لا تتبع المنشأة المحددة" },
          });
        }
      }

      const reservationNumber = await nextDocumentNumber(
        tx,
        "RES",
        input.propertyId,
        input.checkInDate,
      );

      const nights = nightsBetween(input.checkInDate, input.checkOutDate);
      const subtotal = Money.multiply(input.nightlyRate, nights);
      const discount = Money.money(input.discount);
      const tax = Money.money(input.tax);
      const total = Money.add(Money.subtract(subtotal, discount), tax);

      const reservation = await tx.reservation.create({
        data: {
          reservationNumber,
          propertyId: input.propertyId,
          guestId: input.guestId,
          unitId: input.unitId ?? null,
          unitTypeId: input.unitTypeId,
          source: input.source,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          adults: input.adults,
          children: input.children,
          nightlyRate: Money.money(input.nightlyRate),
          subtotal,
          discount,
          tax,
          additionalCharges: Money.ZERO,
          total,
          paidAmount: Money.ZERO,
          balance: total,
          status: input.status,
          paymentStatus: PaymentStatus.UNPAID,
          specialRequests: input.specialRequests ?? null,
          internalNotes: input.internalNotes ?? null,
          createdById: actor.id,
        },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          guestId: true,
          unitId: true,
          checkInDate: true,
          checkOutDate: true,
          total: true,
          balance: true,
          status: true,
          paymentStatus: true,
        },
      });

      // A confirmed booking for a room that is free today marks it reserved, so the
      // unit board reflects the sale immediately.
      if (input.unitId && input.status === ReservationStatus.CONFIRMED) {
        await tx.unit.updateMany({
          where: { id: input.unitId, status: UnitStatus.AVAILABLE },
          data: { status: UnitStatus.RESERVED },
        });
      }

      await recordActivity(
        {
          actor,
          propertyId: input.propertyId,
          module: "reservations",
          action: "create",
          entityType: "Reservation",
          entityId: reservation.id,
          description: `إنشاء حجز رقم ${reservationNumber} لعدد ${nights} ليلة`,
          metadata: {
            reservationNumber,
            nights,
            unitId: input.unitId ?? null,
            total: Money.toAmountString(total),
          },
        },
        tx,
      );

      return reservation;
    }),
  );
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export async function cancelReservation(
  reservationId: string,
  reason: string | null,
  actor: ActivityActor,
) {
  return withDbErrors("reservation.cancel", () =>
    prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          unitId: true,
          status: true,
        },
      });

      if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

      if (
        reservation.status === ReservationStatus.CHECKED_OUT ||
        reservation.status === ReservationStatus.CHECKED_IN
      ) {
        throw new AppError(
          "CONFLICT",
          "لا يمكن إلغاء حجز تم تسجيل دخوله. أكمل إجراءات المغادرة بدلًا من ذلك.",
        );
      }

      if (reservation.status === ReservationStatus.CANCELLED) {
        // Idempotent: cancelling twice is not an error, it is the same outcome.
        return reservation;
      }

      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: reason?.slice(0, 255) ?? null,
        },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          unitId: true,
          status: true,
        },
      });

      // Release the room only if no other booking still holds it.
      if (reservation.unitId) {
        const stillHeld = await tx.reservation.count({
          where: {
            unitId: reservation.unitId,
            status: { in: BLOCKING_STATUSES },
            id: { not: reservationId },
          },
        });
        if (stillHeld === 0) {
          await tx.unit.updateMany({
            where: { id: reservation.unitId, status: UnitStatus.RESERVED },
            data: { status: UnitStatus.AVAILABLE },
          });
        }
      }

      await recordActivity(
        {
          actor,
          propertyId: reservation.propertyId,
          module: "reservations",
          action: "cancel",
          entityType: "Reservation",
          entityId: reservationId,
          description: `إلغاء الحجز رقم ${reservation.reservationNumber}`,
          metadata: { reason },
        },
        tx,
      );

      return updated;
    }),
  );
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** List projection: only the columns a reservations table renders. */
export const RESERVATION_LIST_SELECT = {
  id: true,
  reservationNumber: true,
  checkInDate: true,
  checkOutDate: true,
  adults: true,
  children: true,
  total: true,
  balance: true,
  status: true,
  paymentStatus: true,
  guest: { select: { id: true, fullName: true, mobile: true } },
  unit: { select: { id: true, unitNumber: true } },
  unitType: { select: { id: true, name: true } },
} as const;

export async function getReservation(id: string) {
  return withDbErrors("reservation.get", async () => {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      select: {
        ...RESERVATION_LIST_SELECT,
        source: true,
        nightlyRate: true,
        subtotal: true,
        discount: true,
        tax: true,
        additionalCharges: true,
        paidAmount: true,
        specialRequests: true,
        internalNotes: true,
        checkedInAt: true,
        checkedOutAt: true,
        createdAt: true,
      },
    });

    if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");
    return reservation;
  });
}
