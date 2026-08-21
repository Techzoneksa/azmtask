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
import { businessDate, nightsBetween, toISODate } from "@/lib/datetime";
import * as Money from "@/lib/money";
import { AppError, withDbErrors } from "@/server/errors";
import {
  BusinessDateSchema,
  IdSchema,
  MoneySchema,
  fieldErrors,
} from "@/server/validation";

import { maskIdentificationNumber } from "@/lib/guest-identity";
import type { Permission } from "@/lib/permissions";
import { getBusinessDate } from "@/server/business-date";
import {
  evaluateCheckInEligibility,
  evaluateNoShowEligibility,
  type CheckInEligibility,
  type NoShowEligibility,
} from "@/server/checkin-rules";
import { getVatRate, priceReservation } from "@/server/pricing";

import { recordActivity, type ActivityActor } from "./activity.service";
import {
  getReservationAvailability,
  INVENTORY_STATUSES,
  type AvailabilityResult,
} from "./availability.service";
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
 * Stage 7 widened that guarantee from a room to a room *type*. A confirmed booking
 * that has not been given a room yet holds no unit row to lock, but it has already
 * spent one unit of the type's capacity — so every write now locks the unit type
 * first, then the room, and checks both. Locking a room alone is what lets a hotel
 * with five rooms accept six bookings.
 */

/**
 * Statuses that hold a room.
 *
 * Re-exported from the availability module, which owns the definition. It used to be
 * declared here as well, with PENDING included — while the demo validator declared it
 * without. Two definitions of "what counts as sold" is one more than a booking system
 * can survive, so there is now exactly one, and everything imports it.
 *
 * @deprecated Prefer importing `INVENTORY_STATUSES` directly.
 */
export const BLOCKING_STATUSES = INVENTORY_STATUSES;

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
// Phase 7 — the booking engine
// ---------------------------------------------------------------------------

/**
 * Takes the locks a booking write needs, in the one order every path uses.
 *
 * **Lock order is UnitType first, then Unit. Always, everywhere, no exception.**
 *
 * The order is the whole point. Two transactions that take the same two locks in
 * opposite orders will eventually each hold what the other needs, and MySQL breaks
 * the tie by killing one of them — a deadlock, surfacing to a receptionist as a
 * failure with no cause they can act on. Taking them in a fixed order makes that
 * impossible: whoever gets the type lock first also gets the room lock first, and the
 * other simply waits.
 *
 * When a booking moves between types — or between rooms, as a check-in that reassigns
 * one does — every row on both sides is locked, each group sorted by id. The same rule
 * applied to a pair, so two receptionists swapping bookings in opposite directions
 * still queue rather than deadlock.
 *
 * The lock is what makes the availability check that follows it meaningful. Without
 * it, two transactions both read "one room left" and both sell it.
 */
export async function lockInventory(
  tx: Db,
  unitTypeIds: string[],
  units?: string | Array<string | null | undefined> | null,
) {
  const orderedTypes = [...new Set(unitTypeIds)].sort();

  for (const unitTypeId of orderedTypes) {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT `id` FROM `unit_types` WHERE `id` = ? FOR UPDATE",
      unitTypeId,
    );
    if (rows.length === 0) {
      throw new AppError("NOT_FOUND", "نوع الوحدة غير موجود.");
    }
  }

  const orderedUnits = [
    ...new Set((typeof units === "string" ? [units] : (units ?? [])).filter(Boolean)),
  ].sort();

  for (const unitId of orderedUnits) {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT `id` FROM `units` WHERE `id` = ? FOR UPDATE",
      unitId,
    );
    if (rows.length === 0) {
      throw new AppError("NOT_FOUND", "الوحدة المحددة غير موجودة.");
    }
  }
}

/**
 * The inventory gate every booking write passes through, holding the locks.
 *
 * Two questions, and both must be answered yes. A specific room must be free — and
 * the type must still have capacity, because confirmed bookings that have not been
 * given a room yet have already spent some of it. Checking only the room is the
 * mistake that oversells: five rooms, five unassigned confirmed bookings, and a sixth
 * booking finds every room "free" because none of the five points at one.
 */
export async function assertInventoryAvailable(
  tx: Db,
  params: {
    propertyId: string;
    unitTypeId: string;
    unitId?: string | null;
    checkInDate: Date;
    checkOutDate: Date;
    excludeReservationId?: string;
    /** A soft hold takes no inventory, so it is not gated on capacity. */
    consumesInventory: boolean;
  },
): Promise<AvailabilityResult> {
  const availability = await getReservationAvailability(
    {
      propertyId: params.propertyId,
      unitTypeId: params.unitTypeId,
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
      excludeReservationId: params.excludeReservationId,
    },
    tx,
  );

  if (params.unitId) {
    const candidate = availability.units.find((unit) => unit.id === params.unitId);

    if (!candidate) {
      throw new AppError("VALIDATION", "الوحدة المحددة لا تتبع نوع الوحدة المختار.", {
        fields: { unitId: "الوحدة لا تطابق نوع الوحدة" },
      });
    }

    if (!candidate.available) {
      // Named, so the desk knows whether to pick another room, lift a block, or
      // chase a repair — three different next actions behind one refusal.
      const detail =
        candidate.reason === "RESERVED" && candidate.heldBy
          ? `الوحدة ${candidate.unitNumber} محجوزة خلال هذه الفترة (حجز ${candidate.heldBy.reservationNumber}).`
          : `الوحدة ${candidate.unitNumber} ${candidate.reasonLabel} خلال هذه الفترة.`;

      throw new AppError("CONFLICT", `${detail} حدّث التوفر واختر وحدة أخرى.`, {
        fields: { unitId: candidate.reasonLabel ?? "الوحدة غير متاحة" },
      });
    }
  }

  if (params.consumesInventory && availability.remaining <= 0) {
    throw new AppError(
      "CONFLICT",
      `لا توجد وحدات متاحة من نوع ${availability.unitTypeName} خلال الفترة المحددة.`,
      { fields: { unitTypeId: "لا توجد سعة متاحة من هذا النوع" } },
    );
  }

  return availability;
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
    /*
     * Tax is deliberately not an input. It is computed from the property's configured
     * rate over the discounted accommodation — a caller that could name its own tax
     * could book a stay with none.
     */
    /** Supplied once per booking form. Makes a repeated submit a replay, not a sale. */
    idempotencyKey: z.string().trim().min(8).max(64).optional(),
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
 * Creates a reservation.
 *
 * One transaction covers the whole thing: the type lock, the room lock, the
 * availability check, the number allocation, the insert, the derived totals and the
 * audit entry. Either a complete, consistent booking exists, or nothing was written.
 *
 * Three guarantees worth naming.
 *
 * **It cannot oversell.** The inventory locks are taken before availability is read,
 * so a second receptionist booking the same night waits, re-reads, and is refused.
 *
 * **It cannot double-book from one form.** A repeated submit carries the same
 * idempotency key, and the unique index turns the second insert into a replay that
 * returns the first booking.
 *
 * **It cannot be priced by the client.** The nightly rate is an input because a hotel
 * negotiates rates; the tax and the total are not, because they follow from it.
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

  /*
   * Answered before the transaction opens, so a genuine replay costs a lookup rather
   * than a lock. It is not the guarantee — the unique index below is — but it keeps
   * the common case of a double-clicked button off the inventory locks entirely.
   */
  if (input.idempotencyKey) {
    const replay = await findByIdempotencyKey(input.idempotencyKey, input.propertyId);
    if (replay) return replay;
  }

  const vatRate = await getVatRate(input.propertyId);

  try {
    const outcome = await withDbErrors("reservation.create", () =>
      prisma.$transaction(async (tx) => {
        const consumesInventory = INVENTORY_STATUSES.includes(input.status);

        // UnitType first, then Unit. The order is fixed everywhere — see lockInventory.
        await lockInventory(tx, [input.unitTypeId], input.unitId);

        /*
         * The replay check has to happen here, after the lock and before availability.
         *
         * A second submission of the same form is not a second booking, so it must
         * never be judged against inventory: the room it names is already taken — by
         * the booking the first submission made — and an availability check would
         * refuse it with a conflict that is technically true and completely wrong.
         *
         * It also has to be a locking read. MySQL's default isolation gives this
         * transaction a snapshot from before the first one committed, so an ordinary
         * SELECT would still see nothing; a locking read always reads the latest
         * committed row, which is the whole reason it can be trusted here.
         */
        if (input.idempotencyKey) {
          const replayed = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            "SELECT `id` FROM `reservations` WHERE `idempotencyKey` = ? FOR UPDATE",
            input.idempotencyKey,
          );
          if (replayed.length > 0) {
            return { replayOf: replayed[0].id } as const;
          }
        }

        await assertInventoryAvailable(tx, {
          propertyId: input.propertyId,
          unitTypeId: input.unitTypeId,
          unitId: input.unitId ?? null,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          consumesInventory,
        });

        const guest = await tx.guest.findUnique({
          where: { id: input.guestId },
          select: { id: true },
        });
        if (!guest) {
          throw new AppError("RELATED_RECORD_MISSING", "النزيل المحدد غير موجود.", {
            fields: { guestId: "اختر نزيلًا صحيحًا" },
          });
        }

        const reservationNumber = await nextDocumentNumber(
          tx,
          "RES",
          input.propertyId,
          input.checkInDate,
        );

        const nights = nightsBetween(input.checkInDate, input.checkOutDate);
        const price = priceReservation({
          nightlyRate: input.nightlyRate,
          nights,
          discount: input.discount,
          vatRate,
          // A new booking has no charge rows yet; they arrive from the outlets.
          additionalCharges: 0,
        });

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
            nightlyRate: price.nightlyRate,
            subtotal: price.subtotal,
            discount: price.discount,
            tax: price.tax,
            additionalCharges: Money.ZERO,
            total: price.total,
            paidAmount: Money.ZERO,
            balance: price.total,
            status: input.status,
            paymentStatus: PaymentStatus.UNPAID,
            specialRequests: input.specialRequests ?? null,
            internalNotes: input.internalNotes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            createdById: actor.id,
          },
          select: RESERVATION_WRITE_SELECT,
        });

        // A confirmed booking for a room free today marks it reserved, so the unit
        // board reflects the sale immediately.
        if (input.unitId && consumesInventory) {
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
              status: input.status,
              assigned: input.unitId != null,
              total: Money.toAmountString(price.total),
            },
          },
          tx,
        );

        return reservation;
      }),
    );

    /*
     * Resolved after the transaction, not inside it: the winner's row is only
     * readable by an ordinary query once this transaction's snapshot is gone.
     */
    if ("replayOf" in outcome) {
      const replay = await findByIdempotencyKey(input.idempotencyKey!, input.propertyId);
      if (replay) return replay;
      throw new AppError("CONFLICT", "تعذّر استرجاع الحجز. أعد المحاولة.");
    }

    return outcome;
  } catch (error) {
    /*
     * The guarantee the pre-check cannot give. Two submissions racing each other both
     * find no existing booking, both insert, and the unique index rejects one. That
     * rejection is the right answer, not an error: the caller wanted one booking and
     * one booking exists, so it is handed back.
     */
    if (input.idempotencyKey && isDuplicateKeyError(error)) {
      const replay = await findByIdempotencyKey(input.idempotencyKey, input.propertyId);
      if (replay) return replay;
    }
    throw error;
  }
}

/** The columns every write path returns. Enough to route to the new booking. */
const RESERVATION_WRITE_SELECT = {
  id: true,
  reservationNumber: true,
  propertyId: true,
  guestId: true,
  unitId: true,
  unitTypeId: true,
  checkInDate: true,
  checkOutDate: true,
  total: true,
  balance: true,
  status: true,
  paymentStatus: true,
} as const;

async function findByIdempotencyKey(key: string, propertyId: string) {
  const existing = await prisma.reservation.findUnique({
    where: { idempotencyKey: key },
    select: RESERVATION_WRITE_SELECT,
  });

  // A key is meaningless outside the property that issued it; refusing to hand a
  // booking across properties keeps a guessed key from becoming a read primitive.
  return existing && existing.propertyId === propertyId ? existing : null;
}

/** True for a unique-constraint violation, whatever layer reported it. */
function isDuplicateKeyError(error: unknown): boolean {
  if (error instanceof AppError) return error.code === "DUPLICATE";
  const code = (error as { code?: string } | null)?.code;
  return code === "P2002" || code === "ER_DUP_ENTRY";
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/**
 * What a reservation may still have done to it, and why not when it may not.
 *
 * Centralised because these rules are asked from three places — the detail page
 * deciding which buttons exist, the edit page deciding whether to render at all, and
 * the service refusing the write. Three copies of "can this be cancelled" is three
 * chances to disagree, and the one that matters is the one nobody can see.
 */
export type ReservationGuards = {
  canEdit: boolean;
  editBlockedReason: string | null;
  canConfirm: boolean;
  confirmBlockedReason: string | null;
  canCancel: boolean;
  cancelBlockedReason: string | null;
};

type GuardFacts = {
  status: ReservationStatus;
  paidAmount: Money.Money;
  issuedInvoices: number;
};

/**
 * Invoice states that represent a document a guest has been handed.
 *
 * DRAFT is excluded: an unissued draft has not left the building, so rewriting the
 * reservation under it costs nobody anything. CANCELLED is excluded for the same
 * reason from the other direction — it already describes nothing.
 */
const ISSUED_INVOICE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID"] as const;

export function evaluateGuards(facts: GuardFacts): ReservationGuards {
  const settled = !Money.isZero(facts.paidAmount);
  const invoiced = facts.issuedInvoices > 0;

  /*
   * A stay that has started is operational state, not booking state. Moving a guest
   * between rooms or shifting the dates under them belongs to the stay workflows, and
   * doing it from a booking form would leave the room board and the folio disagreeing
   * with where the guest actually is.
   */
  const inProgress = facts.status === ReservationStatus.CHECKED_IN;
  const finished =
    facts.status === ReservationStatus.CHECKED_OUT ||
    facts.status === ReservationStatus.CANCELLED ||
    facts.status === ReservationStatus.NO_SHOW;

  const editBlockedReason = inProgress
    ? "الحجز قيد الإقامة — تُدار تغييراته من شاشة الإقامة."
    : finished
      ? "الحجز منتهٍ ولا يقبل التعديل. التصحيحات تحتاج إجراء تسوية."
      : invoiced
        ? "صدرت فاتورة لهذا الحجز. تعديل التواريخ أو السعر سيجعل الفاتورة غير صحيحة."
        : null;

  const confirmBlockedReason =
    facts.status === ReservationStatus.PENDING
      ? null
      : facts.status === ReservationStatus.CONFIRMED
        ? "الحجز مؤكد بالفعل."
        : "لا يمكن تأكيد حجز بهذه الحالة.";

  const cancelBlockedReason = inProgress
    ? "لا يمكن إلغاء حجز تم تسجيل دخوله. أكمل إجراءات المغادرة بدلًا من ذلك."
    : facts.status === ReservationStatus.CHECKED_OUT
      ? "الحجز منتهٍ بالفعل."
      : invoiced
        ? "صدرت فاتورة لهذا الحجز. لا يمكن الإلغاء قبل معالجة الفاتورة."
        : settled
          ? "يوجد مبلغ مسدد على هذا الحجز. عالج المبلغ قبل إلغاء الحجز."
          : null;

  return {
    canEdit: editBlockedReason === null,
    editBlockedReason,
    canConfirm: confirmBlockedReason === null,
    confirmBlockedReason,
    // Cancelling an already-cancelled booking is a no-op, not an offer.
    canCancel: cancelBlockedReason === null && facts.status !== ReservationStatus.CANCELLED,
    cancelBlockedReason,
  };
}

/** Reads the facts the guards need, inside whatever transaction the caller holds. */
async function guardFactsFor(tx: Db, reservationId: string): Promise<GuardFacts & { propertyId: string }> {
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: { status: true, paidAmount: true, propertyId: true },
  });
  if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

  const issuedInvoices = await tx.invoice.count({
    where: { reservationId, status: { in: [...ISSUED_INVOICE_STATUSES] } },
  });

  return {
    status: reservation.status,
    paidAmount: Money.money(reservation.paidAmount),
    issuedInvoices,
    propertyId: reservation.propertyId,
  };
}

/**
 * Confirms a pending booking.
 *
 * The availability shown when the enquiry was taken is not evidence of anything now.
 * A pending booking holds no inventory, so between the enquiry and the confirmation
 * somebody else may have sold the room — and the confirmation is the moment the sale
 * actually happens. So the check runs again here, under the same locks a fresh
 * booking takes, against the calendar as it stands.
 */
export async function confirmReservation(
  reservationId: string,
  propertyIds: string[],
  actor: ActivityActor,
) {
  /*
   * Read before the transaction opens, and only to learn which rows to lock.
   *
   * MySQL fixes a transaction's snapshot at its first read, and every ordinary read
   * afterwards sees that frozen world. A lookup before the lock would freeze the
   * snapshot before a competing confirmation committed, and both callers would then
   * see the booking as still pending — same final status, but two audit entries and
   * two inventory checks for one decision. Taking the lock as the first statement
   * means the snapshot is established only once the lock is granted.
   */
  const scoped = await requireScoped(prisma, reservationId, propertyIds);

  return withDbErrors("reservation.confirm", () =>
    prisma.$transaction(async (tx) => {
      await lockInventory(tx, [scoped.unitTypeId], scoped.unitId);

      // Read under the lock, so this is the booking as it actually stands now.
      const reservation = await requireScoped(tx, reservationId, propertyIds);

      const facts = await guardFactsFor(tx, reservationId);
      const guards = evaluateGuards(facts);
      if (!guards.canConfirm) {
        // Confirming a confirmed booking is the same outcome, not a failure.
        if (reservation.status === ReservationStatus.CONFIRMED) {
          return reservation;
        }
        throw new AppError("CONFLICT", guards.confirmBlockedReason ?? "لا يمكن تأكيد الحجز.");
      }

      if (reservation.unitTypeId !== scoped.unitTypeId) {
        throw new AppError("CONFLICT", "تغيّر الحجز أثناء تنفيذ العملية. أعد المحاولة.");
      }

      await assertInventoryAvailable(tx, {
        propertyId: reservation.propertyId,
        unitTypeId: reservation.unitTypeId,
        unitId: reservation.unitId,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        excludeReservationId: reservationId,
        consumesInventory: true,
      });

      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.CONFIRMED },
        select: RESERVATION_WRITE_SELECT,
      });

      if (reservation.unitId) {
        await tx.unit.updateMany({
          where: { id: reservation.unitId, status: UnitStatus.AVAILABLE },
          data: { status: UnitStatus.RESERVED },
        });
      }

      await recordActivity(
        {
          actor,
          propertyId: reservation.propertyId,
          module: "reservations",
          action: "confirm",
          entityType: "Reservation",
          entityId: reservationId,
          description: `تأكيد الحجز رقم ${reservation.reservationNumber}`,
          metadata: { assigned: reservation.unitId != null },
        },
        tx,
      );

      return updated;
    }),
  );
}

/**
 * Cancels a booking and releases its inventory.
 *
 * Refuses when money or a document is involved. A cancelled booking with a payment on
 * it is a refund nobody recorded; a cancelled booking with an issued invoice is a
 * document that no longer describes anything. Neither can be resolved by cancelling
 * harder, and inventing a refund to make the cancel succeed would put money in the
 * ledger that nobody decided to move. So it stops, and says which of the two it is.
 */
export async function cancelReservation(
  reservationId: string,
  reason: string | null,
  actor: ActivityActor,
  propertyIds?: string[],
) {
  return withDbErrors("reservation.cancel", () =>
    prisma.$transaction(async (tx) => {
      const reservation = await requireScoped(tx, reservationId, propertyIds);

      if (reservation.status === ReservationStatus.CANCELLED) {
        // Idempotent: cancelling twice is not an error, it is the same outcome.
        return reservation;
      }

      const facts = await guardFactsFor(tx, reservationId);
      const guards = evaluateGuards(facts);
      if (!guards.canCancel) {
        throw new AppError("CONFLICT", guards.cancelBlockedReason ?? "لا يمكن إلغاء الحجز.");
      }

      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: actor.id,
          cancelReason: reason?.trim().slice(0, 255) || null,
        },
        select: RESERVATION_WRITE_SELECT,
      });

      // Release the room only if no other booking still holds it.
      if (reservation.unitId) {
        const stillHeld = await tx.reservation.count({
          where: {
            unitId: reservation.unitId,
            status: { in: INVENTORY_STATUSES },
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
          metadata: { reason: reason?.trim().slice(0, 255) || null },
        },
        tx,
      );

      return updated;
    }),
  );
}

/**
 * Loads a reservation, refusing one the caller's properties do not include.
 *
 * An id is not an authorisation. Without this, knowing a reservation id would be
 * enough to read or change another property's booking — and ids leak through logs,
 * links and browser history far more easily than anyone expects.
 */
export async function requireScoped(tx: Db, reservationId: string, propertyIds?: string[]) {
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      reservationNumber: true,
      propertyId: true,
      guestId: true,
      unitId: true,
      unitTypeId: true,
      checkInDate: true,
      checkOutDate: true,
      total: true,
      balance: true,
      status: true,
      paymentStatus: true,
    },
  });

  // A booking outside the caller's scope is reported as missing, not as forbidden:
  // "you may not see this" still confirms it exists.
  if (!reservation || (propertyIds && !propertyIds.includes(reservation.propertyId))) {
    throw new AppError("NOT_FOUND", "الحجز غير موجود.");
  }

  return reservation;
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

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export const UpdateReservationSchema = z
  .object({
    reservationId: IdSchema,
    guestId: IdSchema,
    unitTypeId: IdSchema,
    /** Explicit null clears the assignment; omitting the field is not the same thing. */
    unitId: IdSchema.nullable().optional(),
    source: z.nativeEnum(ReservationSource),
    checkInDate: BusinessDateSchema,
    checkOutDate: BusinessDateSchema,
    adults: z.coerce.number().int().min(1, "عدد البالغين لا يقل عن 1").max(20),
    children: z.coerce.number().int().min(0).max(20).default(0),
    nightlyRate: MoneySchema,
    discount: MoneySchema.optional(),
    specialRequests: z.string().trim().max(2000).nullable().optional(),
    internalNotes: z.string().trim().max(2000).nullable().optional(),
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

export type UpdateReservationInput = z.input<typeof UpdateReservationSchema>;

/** Field changes worth naming in the audit trail. */
const AUDITED_FIELDS = [
  "checkInDate",
  "checkOutDate",
  "unitId",
  "unitTypeId",
  "nightlyRate",
  "discount",
  "adults",
  "children",
  "source",
  "guestId",
] as const;

/**
 * Edits a reservation.
 *
 * Everything that could affect inventory is re-checked against the calendar as it
 * stands, under the same locks a fresh booking takes — moving a booking's dates is
 * selling different nights, and the fact that the old nights were available says
 * nothing about the new ones.
 *
 * Three things are deliberately left alone.
 *
 * **Charge rows.** Editing the stay must never delete what the guest consumed. The
 * total is recomputed to include their sum, which is read from the rows rather than
 * carried forward from the old total.
 *
 * **Payment rows.** They record money that moved. If the new total falls below what
 * has been paid, the edit is refused rather than quietly turned into a refund — a
 * refund is a decision with a payer, an amount and a date, and none of those can be
 * inferred from someone shortening a stay.
 *
 * **Issued invoices.** A document handed to a guest is not rewritten to match a later
 * change of mind. The guards refuse the edit and say so.
 */
export async function updateReservation(
  rawInput: UpdateReservationInput,
  actor: ActivityActor,
  propertyIds?: string[],
) {
  const parsed = UpdateReservationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات الحجز غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;

  return withDbErrors("reservation.update", () =>
    prisma.$transaction(async (tx) => {
      const before = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          guestId: true,
          unitId: true,
          unitTypeId: true,
          source: true,
          checkInDate: true,
          checkOutDate: true,
          adults: true,
          children: true,
          nightlyRate: true,
          discount: true,
          status: true,
          paidAmount: true,
        },
      });

      if (!before || (propertyIds && !propertyIds.includes(before.propertyId))) {
        throw new AppError("NOT_FOUND", "الحجز غير موجود.");
      }

      const facts = await guardFactsFor(tx, input.reservationId);
      const guards = evaluateGuards(facts);
      if (!guards.canEdit) {
        throw new AppError("CONFLICT", guards.editBlockedReason ?? "لا يمكن تعديل الحجز.");
      }

      /*
       * Payments belong to the guest who made them. Moving a booking to a different
       * person would silently reassign their money and their invoice history, so it
       * is allowed only while there is neither.
       */
      if (input.guestId !== before.guestId) {
        const financialRows = await tx.payment.count({
          where: { reservationId: input.reservationId },
        });
        if (financialRows > 0 || facts.issuedInvoices > 0) {
          throw new AppError(
            "CONFLICT",
            "لا يمكن تغيير النزيل على حجز له مدفوعات أو فواتير. المبالغ والفواتير مسجّلة باسم النزيل الحالي.",
            { fields: { guestId: "تغيير النزيل غير ممكن بعد تسجيل مبالغ أو فواتير" } },
          );
        }
      }

      const unitId = input.unitId ?? null;
      const consumesInventory = INVENTORY_STATUSES.includes(before.status);

      /*
       * Both types are locked when a booking moves between them, sorted by id inside
       * lockInventory. Locking only the destination would let two receptionists
       * swapping bookings in opposite directions deadlock against each other.
       */
      await lockInventory(tx, [before.unitTypeId, input.unitTypeId], unitId);

      await assertInventoryAvailable(tx, {
        propertyId: before.propertyId,
        unitTypeId: input.unitTypeId,
        unitId,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        // Its own hold must not count against it, or extending a stay by one night
        // would find the room booked — by itself.
        excludeReservationId: input.reservationId,
        consumesInventory,
      });

      const vatRate = await getVatRate(before.propertyId);
      const nights = nightsBetween(input.checkInDate, input.checkOutDate);

      // Read from the rows, never carried over from the previous total.
      const chargeTotals = await tx.reservationCharge.aggregate({
        where: { reservationId: input.reservationId },
        _sum: { total: true },
      });
      const additionalCharges = Money.money(chargeTotals._sum.total);

      const subtotal = Money.multiply(Money.money(input.nightlyRate), nights);
      const discount = Money.money(input.discount);
      if (discount.greaterThan(subtotal)) {
        throw new AppError("VALIDATION", "الخصم أكبر من قيمة الإقامة.", {
          fields: { discount: "الخصم لا يتجاوز إجمالي الإقامة" },
        });
      }

      const price = priceReservation({
        nightlyRate: input.nightlyRate,
        nights,
        discount,
        vatRate,
        additionalCharges,
      });

      const paidAmount = Money.money(before.paidAmount);
      if (price.total.lessThan(paidAmount)) {
        throw new AppError(
          "CONFLICT",
          `الإجمالي الجديد (${Money.toAmountString(price.total)}) أقل من المبلغ المسدد (${Money.toAmountString(paidAmount)}). يلزم استرجاع الفرق أولًا.`,
          { fields: { nightlyRate: "الإجمالي الجديد أقل من المسدد" } },
        );
      }

      const balance = Money.subtract(price.total, paidAmount);

      const updated = await tx.reservation.update({
        where: { id: input.reservationId },
        data: {
          guestId: input.guestId,
          unitId,
          unitTypeId: input.unitTypeId,
          source: input.source,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          adults: input.adults,
          children: input.children,
          nightlyRate: price.nightlyRate,
          subtotal: price.subtotal,
          discount: price.discount,
          tax: price.tax,
          additionalCharges,
          total: price.total,
          paidAmount,
          balance,
          paymentStatus: derivePaymentStatus(price.total, paidAmount, balance),
          specialRequests: input.specialRequests ?? null,
          internalNotes: input.internalNotes ?? null,
        },
        select: RESERVATION_WRITE_SELECT,
      });

      /*
       * A room released by a reassignment goes back on the board, and the new one
       * comes off it — but only when the booking actually holds inventory, and only
       * when no other booking still wants the old room.
       */
      if (consumesInventory && before.unitId !== unitId) {
        if (before.unitId) {
          const stillHeld = await tx.reservation.count({
            where: {
              unitId: before.unitId,
              status: { in: INVENTORY_STATUSES },
              id: { not: input.reservationId },
            },
          });
          if (stillHeld === 0) {
            await tx.unit.updateMany({
              where: { id: before.unitId, status: UnitStatus.RESERVED },
              data: { status: UnitStatus.AVAILABLE },
            });
          }
        }
        if (unitId) {
          await tx.unit.updateMany({
            where: { id: unitId, status: UnitStatus.AVAILABLE },
            data: { status: UnitStatus.RESERVED },
          });
        }
      }

      /*
       * Which fields moved, and for the safe ones, from what to what. Dates, rates and
       * room numbers are the facts an audit of a booking is actually about. Guest and
       * unit changes record ids rather than names or documents — the identity is
       * resolvable from the id by anyone entitled to resolve it, and copying it here
       * would put it in a second place it can leak from.
       */
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const after: Record<string, unknown> = {
        checkInDate: toISODate(input.checkInDate),
        checkOutDate: toISODate(input.checkOutDate),
        unitId,
        unitTypeId: input.unitTypeId,
        nightlyRate: Money.toAmountString(price.nightlyRate),
        discount: Money.toAmountString(price.discount),
        adults: input.adults,
        children: input.children,
        source: input.source,
        guestId: input.guestId,
      };
      const previous: Record<string, unknown> = {
        checkInDate: toISODate(before.checkInDate),
        checkOutDate: toISODate(before.checkOutDate),
        unitId: before.unitId,
        unitTypeId: before.unitTypeId,
        nightlyRate: Money.toAmountString(before.nightlyRate),
        discount: Money.toAmountString(before.discount),
        adults: before.adults,
        children: before.children,
        source: before.source,
        guestId: before.guestId,
      };

      for (const field of AUDITED_FIELDS) {
        if (previous[field] !== after[field]) {
          changes[field] = { from: previous[field], to: after[field] };
        }
      }

      await recordActivity(
        {
          actor,
          propertyId: before.propertyId,
          module: "reservations",
          action: before.unitId !== unitId ? "assign_unit" : "update",
          entityType: "Reservation",
          entityId: input.reservationId,
          description: `تعديل الحجز رقم ${before.reservationNumber}`,
          metadata: { changes, total: Money.toAmountString(price.total) },
        },
        tx,
      );

      return updated;
    }),
  );
}

// ---------------------------------------------------------------------------
// Phase 7 reads
// ---------------------------------------------------------------------------

export const ReservationFilterSchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.nativeEnum(ReservationStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  source: z.nativeEnum(ReservationSource).optional(),
  unitTypeId: IdSchema.optional(),
  unitId: IdSchema.optional(),
  /** Arrivals on exactly this day. */
  arrival: BusinessDateSchema.optional(),
  /** Departures on exactly this day. */
  departure: BusinessDateSchema.optional(),
  /** Stays overlapping this window — the range filter. */
  from: BusinessDateSchema.optional(),
  to: BusinessDateSchema.optional(),
  unassigned: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ReservationFilters = z.infer<typeof ReservationFilterSchema>;

export type ReservationRow = {
  id: string;
  reservationNumber: string;
  guestId: string;
  guestName: string;
  guestMobile: string | null;
  unitId: string | null;
  unitNumber: string | null;
  unitTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  children: number;
  status: string;
  source: string;
  createdAt: string;
  /** Money is present only for callers holding `payments.view`. */
  paymentStatus?: string;
  total?: string;
  balance?: string;
};

/**
 * How a reservation search term is read.
 *
 * A reservation number, a room number and a phone number are all "just type it in" at
 * the desk, so the term is classified rather than blasted across every column with a
 * leading wildcard — which would use no index at all.
 */
function reservationSearchWhere(raw: string) {
  const term = raw.trim();
  const digits = term.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

  const clauses: Array<Record<string, unknown>> = [
    // Reservation numbers are quoted whole or by their tail; both are prefix-safe
    // against the unique index once the caller types the RES- stem.
    { reservationNumber: { contains: term } },
    { guest: { fullName: { contains: term } } },
  ];

  if (/^\d{3,}$/.test(digits)) {
    // A digit string is a phone or a room number, and both are indexed prefixes.
    clauses.push({ guest: { mobile: { startsWith: digits } } });
    clauses.push({ unit: { unitNumber: { startsWith: digits } } });
  } else {
    clauses.push({ unit: { unitNumber: { startsWith: term } } });
  }

  return { OR: clauses };
}

/**
 * The reservation directory.
 *
 * Two queries per page regardless of page size — a count and a page — with the guest,
 * unit and type joined in the same statement rather than fetched per row. Twenty-five
 * rows costing fifty-one round trips is the shape this deliberately avoids.
 *
 * The projection is narrow on purpose: a directory row needs a guest's name and phone,
 * not their documents or their history.
 */
export async function listReservations(
  propertyIds: string[],
  rawFilters: unknown,
  permissions: ReadonlySet<Permission>,
): Promise<{ rows: ReservationRow[]; total: number; page: number; pageSize: number }> {
  const parsedFilters = ReservationFilterSchema.safeParse(rawFilters);
  if (!parsedFilters.success) {
    throw new AppError("VALIDATION", "معايير البحث غير صالحة.", {
      fields: fieldErrors(parsedFilters.error),
    });
  }
  const filters = parsedFilters.data;
  const canSeeMoney = permissions.has("payments.view");

  return withDbErrors("reservation.list", async () => {
    const conditions: Array<Record<string, unknown>> = [
      { propertyId: { in: propertyIds } },
    ];

    if (filters.q) conditions.push(reservationSearchWhere(filters.q));
    if (filters.status) conditions.push({ status: filters.status });
    if (filters.paymentStatus) conditions.push({ paymentStatus: filters.paymentStatus });
    if (filters.source) conditions.push({ source: filters.source });
    if (filters.unitTypeId) conditions.push({ unitTypeId: filters.unitTypeId });
    if (filters.unitId) conditions.push({ unitId: filters.unitId });
    if (filters.unassigned) conditions.push({ unitId: null });
    if (filters.arrival) conditions.push({ checkInDate: filters.arrival });
    if (filters.departure) conditions.push({ checkOutDate: filters.departure });

    // A window filter selects stays that touch it, not stays contained by it — a
    // guest staying across the whole month is in every week of it.
    if (filters.from) conditions.push({ checkOutDate: { gt: filters.from } });
    if (filters.to) conditions.push({ checkInDate: { lt: filters.to } });

    const where = { AND: conditions };

    const [total, rows] = await Promise.all([
      prisma.reservation.count({ where }),
      prisma.reservation.findMany({
        where,
        orderBy: [{ checkInDate: "desc" }, { id: "desc" }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        select: {
          id: true,
          reservationNumber: true,
          checkInDate: true,
          checkOutDate: true,
          adults: true,
          children: true,
          status: true,
          source: true,
          createdAt: true,
          guest: { select: { id: true, fullName: true, mobile: true } },
          unit: { select: { id: true, unitNumber: true } },
          unitType: { select: { name: true } },
          // Selected only when the caller may see money — not selected and hidden.
          ...(canSeeMoney ? { total: true, balance: true, paymentStatus: true } : {}),
        },
      }),
    ]);

    return {
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      rows: rows.map((row) => ({
        id: row.id,
        reservationNumber: row.reservationNumber,
        guestId: row.guest.id,
        guestName: row.guest.fullName,
        guestMobile: row.guest.mobile,
        unitId: row.unit?.id ?? null,
        unitNumber: row.unit?.unitNumber ?? null,
        unitTypeName: row.unitType.name,
        checkInDate: toISODate(row.checkInDate),
        checkOutDate: toISODate(row.checkOutDate),
        nights: nightsBetween(row.checkInDate, row.checkOutDate),
        adults: row.adults,
        children: row.children,
        status: row.status,
        source: row.source,
        createdAt: row.createdAt.toISOString(),
        ...(canSeeMoney && "total" in row
          ? {
              total: Money.toAmountString(row.total as Money.Money),
              balance: Money.toAmountString(row.balance as Money.Money),
              paymentStatus: row.paymentStatus as string,
            }
          : {}),
      })),
    };
  });
}

export type ReservationDetail = {
  id: string;
  reservationNumber: string;
  propertyId: string;
  propertyName: string;
  status: string;
  source: string;
  createdAt: string;
  createdBy: string | null;
  guest: {
    id: string;
    fullName: string;
    mobile: string | null;
    email: string | null;
    nationality: string | null;
    identificationType: string | null;
    /** Masked unless the caller may read documents — see the Phase 6 policy. */
    identificationDisplay: string | null;
  };
  stay: {
    unitTypeId: string;
    unitTypeName: string;
    unitId: string | null;
    unitNumber: string | null;
    floor: number | null;
    checkInDate: string;
    checkOutDate: string;
    nights: number;
    adults: number;
    children: number;
    checkedInAt: string | null;
    checkedInBy: string | null;
    checkedOutAt: string | null;
  };
  /** Whether an arrival may be recorded now, and why not when it may not. */
  checkIn: CheckInEligibility;
  noShow: NoShowEligibility & { at: string | null; reason: string | null; by: string | null };
  /** Null — not zeroed — when the caller has no financial permission. */
  financial: {
    nightlyRate: string;
    subtotal: string;
    discount: string;
    tax: string;
    additionalCharges: string;
    total: string;
    paidAmount: string;
    balance: string;
    paymentStatus: string;
    vatRate: string;
  } | null;
  charges: Array<{
    id: string;
    description: string;
    category: string;
    quantity: string;
    unitPrice: string;
    tax: string;
    total: string;
    chargedAt: string;
  }> | null;
  payments: Array<{
    id: string;
    paymentNumber: string;
    paymentDate: string;
    method: string;
    amount: string;
    isRefund: boolean;
    reference: string | null;
  }> | null;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    issueDate: string;
    total: string;
    paid: string;
    balance: string;
    status: string;
  }> | null;
  requests: { specialRequests: string | null; internalNotes: string | null };
  cancellation: { at: string; reason: string | null; by: string | null } | null;
  activity: Array<{
    id: string;
    action: string;
    description: string;
    userName: string;
    createdAt: string;
  }> | null;
  guards: ReservationGuards;
};

/**
 * One reservation, in full, shaped by what the caller may see.
 *
 * Sections behind a permission are not queried at all. Fetching a folio and then
 * declining to render it still ships every figure in the payload.
 */
export async function getReservationDetail(
  reservationId: string,
  propertyIds: string[],
  permissions: ReadonlySet<Permission>,
): Promise<ReservationDetail> {
  const id = IdSchema.safeParse(reservationId);
  if (!id.success) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

  const canSeeMoney = permissions.has("payments.view");
  const canSeeInvoices = permissions.has("invoices.view");
  const canSeeActivity = permissions.has("activity.view");
  const canReadDocuments = permissions.has("guests.edit");

  return withDbErrors("reservation.detail", async () => {
    const reservation = await prisma.reservation.findUnique({
      where: { id: id.data },
      select: {
        id: true,
        reservationNumber: true,
        propertyId: true,
        status: true,
        source: true,
        createdAt: true,
        checkInDate: true,
        checkOutDate: true,
        adults: true,
        children: true,
        checkedInAt: true,
        checkedOutAt: true,
        cancelledAt: true,
        cancelReason: true,
        noShowAt: true,
        noShowReason: true,
        specialRequests: true,
        internalNotes: true,
        nightlyRate: true,
        subtotal: true,
        discount: true,
        tax: true,
        additionalCharges: true,
        total: true,
        paidAmount: true,
        balance: true,
        paymentStatus: true,
        property: { select: { name: true } },
        createdBy: { select: { name: true } },
        cancelledBy: { select: { name: true } },
        checkedInBy: { select: { name: true } },
        noShowBy: { select: { name: true } },
        guest: {
          select: {
            id: true,
            fullName: true,
            mobile: true,
            email: true,
            nationality: true,
            identificationType: true,
            identificationNumber: true,
          },
        },
        unit: { select: { id: true, unitNumber: true, floor: true } },
        unitType: { select: { id: true, name: true } },
      },
    });

    if (!reservation || !propertyIds.includes(reservation.propertyId)) {
      throw new AppError("NOT_FOUND", "الحجز غير موجود.");
    }

    const [charges, payments, invoices, activity, issuedInvoices, vatRate, businessDay] =
      await Promise.all([
        canSeeMoney
          ? prisma.reservationCharge.findMany({
              where: { reservationId: reservation.id },
              orderBy: { chargedAt: "desc" },
              select: {
                id: true,
                description: true,
                category: true,
                quantity: true,
                unitPrice: true,
                tax: true,
                total: true,
                chargedAt: true,
              },
            })
          : Promise.resolve(null),
        canSeeMoney
          ? prisma.payment.findMany({
              where: { reservationId: reservation.id },
              orderBy: { paymentDate: "desc" },
              select: {
                id: true,
                paymentNumber: true,
                paymentDate: true,
                method: true,
                amount: true,
                reference: true,
              },
            })
          : Promise.resolve(null),
        canSeeInvoices
          ? prisma.invoice.findMany({
              where: { reservationId: reservation.id },
              orderBy: { issueDate: "desc" },
              select: {
                id: true,
                invoiceNumber: true,
                issueDate: true,
                total: true,
                paid: true,
                balance: true,
                status: true,
              },
            })
          : Promise.resolve(null),
        canSeeActivity
          ? prisma.activityLog.findMany({
              where: { entityType: "Reservation", entityId: reservation.id },
              orderBy: { createdAt: "desc" },
              take: 20,
              select: {
                id: true,
                action: true,
                description: true,
                userName: true,
                createdAt: true,
              },
            })
          : Promise.resolve(null),
        prisma.invoice.count({
          where: {
            reservationId: reservation.id,
            status: { in: [...ISSUED_INVOICE_STATUSES] },
          },
        }),
        getVatRate(reservation.propertyId),
        getBusinessDate(),
      ]);

    const guest = reservation.guest;

    return {
      id: reservation.id,
      reservationNumber: reservation.reservationNumber,
      propertyId: reservation.propertyId,
      propertyName: reservation.property.name,
      status: reservation.status,
      source: reservation.source,
      createdAt: reservation.createdAt.toISOString(),
      createdBy: reservation.createdBy?.name ?? null,
      guest: {
        id: guest.id,
        fullName: guest.fullName,
        mobile: guest.mobile,
        email: guest.email,
        nationality: guest.nationality,
        identificationType: guest.identificationType,
        identificationDisplay: canReadDocuments
          ? guest.identificationNumber
          : maskIdentificationNumber(guest.identificationNumber),
      },
      stay: {
        unitTypeId: reservation.unitType.id,
        unitTypeName: reservation.unitType.name,
        unitId: reservation.unit?.id ?? null,
        unitNumber: reservation.unit?.unitNumber ?? null,
        floor: reservation.unit?.floor ?? null,
        checkInDate: toISODate(reservation.checkInDate),
        checkOutDate: toISODate(reservation.checkOutDate),
        nights: nightsBetween(reservation.checkInDate, reservation.checkOutDate),
        adults: reservation.adults,
        children: reservation.children,
        checkedInAt: reservation.checkedInAt?.toISOString() ?? null,
        checkedInBy: reservation.checkedInBy?.name ?? null,
        checkedOutAt: reservation.checkedOutAt?.toISOString() ?? null,
      },
      /*
       * Computed here rather than in the page, from the same pure rules the check-in
       * transaction applies. The detail screen decides whether to offer the action;
       * a screen that decided for itself would eventually show a button the service
       * refuses.
       */
      checkIn: evaluateCheckInEligibility({
        status: reservation.status,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        businessDay,
      }),
      noShow: {
        ...evaluateNoShowEligibility({
          status: reservation.status,
          checkInDate: reservation.checkInDate,
          businessDay,
          issuedInvoices,
        }),
        at: reservation.noShowAt?.toISOString() ?? null,
        reason: reservation.noShowReason,
        by: reservation.noShowBy?.name ?? null,
      },
      financial: canSeeMoney
        ? {
            nightlyRate: Money.toAmountString(reservation.nightlyRate),
            subtotal: Money.toAmountString(reservation.subtotal),
            discount: Money.toAmountString(reservation.discount),
            tax: Money.toAmountString(reservation.tax),
            additionalCharges: Money.toAmountString(reservation.additionalCharges),
            total: Money.toAmountString(reservation.total),
            paidAmount: Money.toAmountString(reservation.paidAmount),
            balance: Money.toAmountString(reservation.balance),
            paymentStatus: reservation.paymentStatus,
            vatRate: Money.toAmountString(vatRate),
          }
        : null,
      charges:
        charges?.map((charge) => ({
          id: charge.id,
          description: charge.description,
          category: charge.category,
          quantity: Money.toAmountString(charge.quantity),
          unitPrice: Money.toAmountString(charge.unitPrice),
          tax: Money.toAmountString(charge.tax),
          total: Money.toAmountString(charge.total),
          chargedAt: charge.chargedAt.toISOString(),
        })) ?? null,
      payments:
        payments?.map((payment) => ({
          id: payment.id,
          paymentNumber: payment.paymentNumber,
          paymentDate: payment.paymentDate.toISOString(),
          method: payment.method,
          amount: Money.toAmountString(payment.amount),
          isRefund: payment.amount.isNegative(),
          reference: payment.reference,
        })) ?? null,
      invoices:
        invoices?.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: toISODate(invoice.issueDate),
          total: Money.toAmountString(invoice.total),
          paid: Money.toAmountString(invoice.paid),
          balance: Money.toAmountString(invoice.balance),
          status: invoice.status,
        })) ?? null,
      requests: {
        specialRequests: reservation.specialRequests,
        internalNotes: reservation.internalNotes,
      },
      cancellation: reservation.cancelledAt
        ? {
            at: reservation.cancelledAt.toISOString(),
            reason: reservation.cancelReason,
            by: reservation.cancelledBy?.name ?? null,
          }
        : null,
      activity:
        activity?.map((entry) => ({
          id: entry.id,
          action: entry.action,
          description: entry.description,
          userName: entry.userName,
          createdAt: entry.createdAt.toISOString(),
        })) ?? null,
      guards: evaluateGuards({
        status: reservation.status,
        paidAmount: Money.money(reservation.paidAmount),
        issuedInvoices,
      }),
    };
  });
}
