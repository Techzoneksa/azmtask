import "server-only";

import { z } from "zod";

import { ReservationStatus } from "@/generated/prisma/enums";
import { nightsBetween, toISODate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { maskIdentificationNumber } from "@/lib/guest-identity";
import * as Money from "@/lib/money";
import type { Permission } from "@/lib/permissions";
import { getBusinessDate } from "@/server/business-date";
import {
  evaluateCheckInEligibility,
  evaluateNoShowEligibility,
  isReady,
  missingGuestFields,
  remainingStayStart,
  type CheckInEligibility,
  type GuestRequirement,
  type NoShowEligibility,
} from "@/server/checkin-rules";
import { AppError, withDbErrors } from "@/server/errors";
import { IdSchema, fieldErrors } from "@/server/validation";

import { recordActivity, type ActivityActor } from "./activity.service";
import {
  getReservationAvailability,
  type UnitCandidate,
} from "./availability.service";
import {
  assertInventoryAvailable,
  lockInventory,
  requireScoped,
} from "./reservation.service";
import { syncUnitStatus } from "./unit.service";

/**
 * Check-in — the moment a booking becomes a guest.
 *
 * Everything before this stage describes an intention: a room type was sold, a room
 * may have been named, money may have moved. Check-in is where the hotel asserts that
 * a specific person is physically in a specific room tonight, and from here the room
 * board, the housekeeping queue, the folio and the arrivals list all have to agree.
 *
 * Three ideas shape this module.
 *
 * **Availability and readiness are different questions.** A room can be perfectly
 * available — nobody else has it, it is not blocked, nothing is broken — and still be
 * unfit to hand over because the last guest left an hour ago and it has not been
 * cleaned. Refusing check-in on readiness while calling the reservation "unavailable"
 * would send the desk hunting for a booking conflict that does not exist. So the two
 * refusals are worded differently and lead to different actions: one says pick another
 * room, the other says call housekeeping.
 *
 * **The assignment stored on a booking is history, not permission.** A room named at
 * booking time may since have been blocked, taken out of service, or sold to somebody
 * else by a path this booking never saw. Check-in therefore revalidates the room
 * against the calendar as it stands right now, under the same locks the booking engine
 * takes, rather than trusting that it was valid when it was written.
 *
 * **Assigning a room does not consume inventory.** A confirmed booking with no room
 * has already spent one unit of its type's capacity; naming the room moves that
 * spend from the type to a specific door. Checking capacity again at assignment
 * time would refuse the last booking in a full hotel — the one case where the guest
 * is definitely standing at the desk.
 */

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/*
 * Re-exported so callers have one import for the module and one definition of each
 * rule. The rules themselves live in `@/server/checkin-rules` because pages need them
 * without pulling in a transaction, and because the booking engine's detail view needs
 * them without importing the service that imports the booking engine.
 */
export {
  CHECK_IN_PERMISSION,
  GUEST_REQUIREMENTS,
  READY_HOUSEKEEPING_STATUSES,
  evaluateCheckInEligibility,
  evaluateNoShowEligibility,
  isReady,
  missingGuestFields,
  remainingStayStart,
  type CheckInEligibility,
  type GuestRequirement,
  type NoShowEligibility,
} from "@/server/checkin-rules";

// ---------------------------------------------------------------------------
// The check-in screen's payload
// ---------------------------------------------------------------------------

export type CheckInRoom = {
  id: string;
  unitNumber: string;
  floor: number | null;
  housekeepingStatus: string;
  /** Free of other bookings, not blocked, not out of service, for the nights ahead. */
  available: boolean;
  /** Cleaned and fit to hand over. Independent of `available`. */
  ready: boolean;
  /** Both — the only rooms the desk may actually choose. */
  selectable: boolean;
  reason: string | null;
  reasonLabel: string | null;
  heldByReservationNumber: string | null;
  /** True when this is the room already named on the booking. */
  assigned: boolean;
};

export type CheckInContext = {
  reservationId: string;
  reservationNumber: string;
  propertyId: string;
  propertyName: string;
  status: string;
  businessDate: string;
  stay: {
    unitTypeId: string;
    unitTypeName: string;
    unitId: string | null;
    unitNumber: string | null;
    floor: number | null;
    checkInDate: string;
    checkOutDate: string;
    /** Where availability is checked from — the arrival date, or today if later. */
    stayStartDate: string;
    nights: number;
    remainingNights: number;
    adults: number;
    children: number;
  };
  guest: {
    id: string;
    fullName: string;
    mobile: string | null;
    email: string | null;
    nationality: string | null;
    identificationType: string | null;
    /** Masked unless the caller may read documents — the Stage 6 policy, unchanged. */
    identificationDisplay: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    missing: GuestRequirement[];
  };
  eligibility: CheckInEligibility;
  noShow: NoShowEligibility;
  rooms: CheckInRoom[];
  /** True when the type has rooms but none is both available and ready. */
  noRoomAvailable: boolean;
  /** Null — not zeroed — when the caller may not see money. */
  financial: {
    total: string;
    paidAmount: string;
    balance: string;
    paymentStatus: string;
  } | null;
  requests: { specialRequests: string | null; internalNotes: string | null };
};

/**
 * Everything the check-in screen renders, shaped by what the caller may see.
 *
 * Sections behind a permission are not queried at all rather than fetched and hidden:
 * a payload containing the folio still ships every figure to the browser, whatever the
 * markup does with it afterwards.
 */
export async function getCheckInContext(
  reservationId: string,
  propertyIds: string[],
  permissions: ReadonlySet<Permission>,
): Promise<CheckInContext> {
  const parsed = IdSchema.safeParse(reservationId);
  if (!parsed.success) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

  const canSeeMoney = permissions.has("payments.view");
  const canReadDocuments = permissions.has("guests.edit");

  return withDbErrors("checkin.context", async () => {
    const businessDay = await getBusinessDate();

    const reservation = await prisma.reservation.findUnique({
      where: { id: parsed.data },
      select: {
        id: true,
        reservationNumber: true,
        propertyId: true,
        status: true,
        checkInDate: true,
        checkOutDate: true,
        adults: true,
        children: true,
        specialRequests: true,
        internalNotes: true,
        total: true,
        paidAmount: true,
        balance: true,
        paymentStatus: true,
        property: { select: { name: true } },
        unitType: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true, floor: true } },
        guest: {
          select: {
            id: true,
            fullName: true,
            mobile: true,
            email: true,
            nationality: true,
            identificationType: true,
            identificationNumber: true,
            dateOfBirth: true,
            gender: true,
          },
        },
      },
    });

    if (!reservation || !propertyIds.includes(reservation.propertyId)) {
      throw new AppError("NOT_FOUND", "الحجز غير موجود.");
    }

    const eligibility = evaluateCheckInEligibility({
      status: reservation.status,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      businessDay,
    });

    const stayStart = remainingStayStart(reservation.checkInDate, businessDay);

    /*
     * The room list is only meaningful while the booking could still be checked in.
     * A cancelled booking has no rooms to offer, and asking the availability engine
     * for a window that has already closed would throw on the date check.
     */
    const showRooms =
      eligibility.eligible || eligibility.alreadyCheckedIn
        ? stayStart.getTime() < reservation.checkOutDate.getTime()
        : false;

    const [availability, issuedInvoices] = await Promise.all([
      showRooms
        ? getReservationAvailability({
            propertyId: reservation.propertyId,
            unitTypeId: reservation.unitType.id,
            checkInDate: stayStart,
            checkOutDate: reservation.checkOutDate,
            excludeReservationId: reservation.id,
          })
        : Promise.resolve(null),
      prisma.invoice.count({
        where: {
          reservationId: reservation.id,
          status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] },
        },
      }),
    ]);

    const rooms: CheckInRoom[] = (availability?.units ?? []).map((candidate) =>
      toRoom(candidate, reservation.unit?.id ?? null),
    );

    const noShow = evaluateNoShowEligibility({
      status: reservation.status,
      checkInDate: reservation.checkInDate,
      businessDay,
      issuedInvoices,
    });

    const guest = reservation.guest;

    return {
      reservationId: reservation.id,
      reservationNumber: reservation.reservationNumber,
      propertyId: reservation.propertyId,
      propertyName: reservation.property.name,
      status: reservation.status,
      businessDate: toISODate(businessDay),
      stay: {
        unitTypeId: reservation.unitType.id,
        unitTypeName: reservation.unitType.name,
        unitId: reservation.unit?.id ?? null,
        unitNumber: reservation.unit?.unitNumber ?? null,
        floor: reservation.unit?.floor ?? null,
        checkInDate: toISODate(reservation.checkInDate),
        checkOutDate: toISODate(reservation.checkOutDate),
        stayStartDate: toISODate(stayStart),
        nights: nightsBetween(reservation.checkInDate, reservation.checkOutDate),
        remainingNights: Math.max(
          0,
          nightsBetween(stayStart, reservation.checkOutDate),
        ),
        adults: reservation.adults,
        children: reservation.children,
      },
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
        dateOfBirth: guest.dateOfBirth ? toISODate(guest.dateOfBirth) : null,
        gender: guest.gender,
        missing: missingGuestFields(guest),
      },
      eligibility,
      noShow,
      rooms,
      noRoomAvailable: showRooms && rooms.every((room) => !room.selectable),
      financial: canSeeMoney
        ? {
            total: Money.toAmountString(reservation.total),
            paidAmount: Money.toAmountString(reservation.paidAmount),
            balance: Money.toAmountString(reservation.balance),
            paymentStatus: reservation.paymentStatus,
          }
        : null,
      requests: {
        specialRequests: reservation.specialRequests,
        internalNotes: reservation.internalNotes,
      },
    };
  });
}

function toRoom(candidate: UnitCandidate, assignedUnitId: string | null): CheckInRoom {
  const ready = isReady(candidate.housekeepingStatus);
  return {
    id: candidate.id,
    unitNumber: candidate.unitNumber,
    floor: candidate.floor,
    housekeepingStatus: candidate.housekeepingStatus,
    available: candidate.available,
    ready,
    selectable: candidate.available && ready,
    reason: candidate.reason,
    reasonLabel: candidate.reasonLabel,
    heldByReservationNumber: candidate.heldBy?.reservationNumber ?? null,
    assigned: assignedUnitId !== null && candidate.id === assignedUnitId,
  };
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

export const CheckInSchema = z.object({
  reservationId: IdSchema,
  /** Chosen at the desk. Omitted means "use the room already on the booking". */
  unitId: IdSchema.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type CheckInInput = z.input<typeof CheckInSchema>;

export type CheckInResult = {
  reservationId: string;
  reservationNumber: string;
  status: string;
  unitId: string;
  unitNumber: string;
  checkedInAt: string;
  guestId: string;
  guestName: string;
  lateArrival: boolean;
  /** True when this call found the booking already in house and changed nothing. */
  replayed: boolean;
};

/**
 * Checks a guest in. One transaction, one outcome.
 *
 * ## Lock order
 *
 * Unchanged from Stage 7 and taken through the same helper, because a second ordering
 * anywhere in the system is a deadlock waiting for the two paths to run at once:
 *
 *     unit types (sorted by id) → units (sorted by id)
 *
 * A check-in that reassigns a room touches two units, so both are locked together in
 * id order — the same rule the booking engine already applies to a pair of types when
 * a booking moves between them. Whoever takes the first lock takes them all first; the
 * other waits rather than deadlocking.
 *
 * ## Idempotency
 *
 * Deliberately no second key. The transition is one-way and the lock serialises it:
 * the second of two simultaneous submissions waits, re-reads the booking under the
 * lock, finds it already CHECKED_IN, and returns that state without writing anything
 * or logging a second arrival. A double-clicked button and two receptionists on two
 * machines resolve identically, and no idempotency column can be forgotten by a
 * caller because there is none to pass.
 */
export async function checkInReservation(
  rawInput: CheckInInput,
  actor: ActivityActor,
  propertyIds?: string[],
): Promise<CheckInResult> {
  const parsed = CheckInSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات تسجيل الوصول غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;

  // Resolved once, outside the transaction, and passed everywhere below: eligibility
  // and the derived room status must be decided against the same operating day even
  // if the request happens to straddle midnight.
  const businessDay = await getBusinessDate();

  /*
   * Read outside the transaction, and only to learn which rows to lock.
   *
   * Nothing decided below trusts it. The reason it cannot happen inside is subtle and
   * cost this stage a bug: MySQL fixes a transaction's snapshot at its *first read*,
   * and every ordinary read afterwards sees that frozen world. A plain lookup before
   * the lock would freeze the snapshot before the competing transaction committed, so
   * the reload after the lock would still show the booking un-checked-in and twenty
   * simultaneous submissions would each believe they were the first. Taking the lock
   * as the transaction's first statement means the snapshot is established only once
   * the lock is granted — after the winner has committed — and everything read
   * afterwards sees the world as it actually is.
   */
  const scoped = await requireScoped(prisma, input.reservationId, propertyIds);

  return withDbErrors("reservation.checkIn", () =>
    prisma.$transaction(async (tx) => {
      // Everything this transaction may touch, locked in the canonical order before
      // a single fact is read for a decision.
      await lockInventory(tx, [scoped.unitTypeId], [scoped.unitId, input.unitId ?? null]);

      const reservation = await tx.reservation.findUnique({
        where: { id: scoped.id },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          unitTypeId: true,
          unitId: true,
          status: true,
          checkInDate: true,
          checkOutDate: true,
          checkedInAt: true,
          guest: {
            select: {
              id: true,
              fullName: true,
              mobile: true,
              nationality: true,
              identificationType: true,
              identificationNumber: true,
            },
          },
          unit: { select: { id: true, unitNumber: true } },
        },
      });

      if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

      /*
       * The type could only have changed under an edit that holds this same type lock,
       * so this is all but unreachable — but if it did, the rows locked above are the
       * wrong ones and nothing below would be protected. Refuse rather than proceed
       * with a lock that guards a different room.
       */
      if (reservation.unitTypeId !== scoped.unitTypeId) {
        throw new AppError("CONFLICT", "تغيّر الحجز أثناء تنفيذ العملية. أعد فتح الصفحة وحاول مجددًا.");
      }

      const eligibility = evaluateCheckInEligibility({
        status: reservation.status,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        businessDay,
      });

      // A replay, not a failure: the same command arriving twice produces the same
      // state, no second audit entry and no second room change.
      if (eligibility.alreadyCheckedIn) {
        return {
          reservationId: reservation.id,
          reservationNumber: reservation.reservationNumber,
          status: reservation.status,
          unitId: reservation.unit?.id ?? "",
          unitNumber: reservation.unit?.unitNumber ?? "",
          checkedInAt: (reservation.checkedInAt ?? new Date()).toISOString(),
          guestId: reservation.guest.id,
          guestName: reservation.guest.fullName,
          lateArrival: false,
          replayed: true,
        } satisfies CheckInResult;
      }

      if (!eligibility.eligible) {
        throw new AppError("CONFLICT", eligibility.blockedReason ?? "لا يمكن تسجيل الوصول لهذا الحجز.");
      }

      const missing = missingGuestFields(reservation.guest);
      if (missing.length > 0) {
        throw new AppError(
          "VALIDATION",
          `بيانات النزيل غير مكتملة: ${missing.map((item) => item.label).join("، ")}.`,
          { fields: Object.fromEntries(missing.map((item) => [item.field, "مطلوب قبل تسجيل الوصول"])) },
        );
      }

      const previousUnitId = reservation.unitId;
      const targetUnitId = input.unitId ?? previousUnitId;
      const stayStart = remainingStayStart(reservation.checkInDate, businessDay);

      if (!targetUnitId) {
        // Distinguish "you have not chosen one" from "there is nothing to choose".
        const availability = await getReservationAvailability(
          {
            propertyId: reservation.propertyId,
            unitTypeId: reservation.unitTypeId,
            checkInDate: stayStart,
            checkOutDate: reservation.checkOutDate,
            excludeReservationId: reservation.id,
          },
          tx,
        );

        const ready = availability.units.filter(
          (unit) => unit.available && isReady(unit.housekeepingStatus),
        );

        if (ready.length === 0) {
          throw new AppError(
            "CONFLICT",
            "لا توجد وحدة جاهزة ومتاحة من النوع المحجوز لإتمام تسجيل الوصول.",
          );
        }

        throw new AppError("VALIDATION", "اختر الوحدة التي سينزل فيها الضيف.", {
          fields: { unitId: "اختر وحدة جاهزة" },
        });
      }

      /*
       * The inventory gate the booking engine itself uses — same availability
       * calculation, same locks, same refusal wording. `consumesInventory` is false
       * because this booking already holds a unit of the type's capacity; naming the
       * room moves that hold, it does not add a second one.
       */
      await assertInventoryAvailable(tx, {
        propertyId: reservation.propertyId,
        unitTypeId: reservation.unitTypeId,
        unitId: targetUnitId,
        checkInDate: stayStart,
        checkOutDate: reservation.checkOutDate,
        excludeReservationId: reservation.id,
        consumesInventory: false,
      });

      const unit = await tx.unit.findUnique({
        where: { id: targetUnitId },
        select: { id: true, unitNumber: true, propertyId: true, housekeepingStatus: true },
      });

      if (!unit || unit.propertyId !== reservation.propertyId) {
        throw new AppError("VALIDATION", "الوحدة المحددة لا تتبع منشأة هذا الحجز.", {
          fields: { unitId: "الوحدة لا تتبع هذه المنشأة" },
        });
      }

      /*
       * Readiness, last, and worded as its own problem. The booking is fine and the
       * room is genuinely this booking's — it simply has not been cleaned yet, and
       * the answer is a phone call to housekeeping, not another room.
       */
      if (!isReady(unit.housekeepingStatus)) {
        throw new AppError(
          "CONFLICT",
          `الوحدة ${unit.unitNumber} مخصصة لهذا الحجز لكنها تحتاج إلى تنظيف قبل تسجيل الوصول.`,
          { fields: { unitId: "الوحدة غير جاهزة" } },
        );
      }

      const checkedInAt = new Date();

      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CHECKED_IN,
          unitId: unit.id,
          checkedInAt,
          checkedInById: actor.id,
          ...(input.notes ? { internalNotes: input.notes } : {}),
        },
      });

      /*
       * Derived state, recomputed rather than assumed — and inside this transaction,
       * so a rollback cannot leave a room marked occupied by a guest who was never
       * checked in. The room the booking was moved off is recomputed too: it may now
       * be free, or still reserved for somebody else arriving today.
       */
      await syncUnitStatus(tx, unit.id, businessDay);
      if (previousUnitId && previousUnitId !== unit.id) {
        await syncUnitStatus(tx, previousUnitId, businessDay);
      }

      if (previousUnitId !== unit.id) {
        await recordActivity(
          {
            actor,
            propertyId: reservation.propertyId,
            module: "reservations",
            action: previousUnitId ? "reassign_unit" : "assign_unit",
            entityType: "Reservation",
            entityId: reservation.id,
            description: previousUnitId
              ? `تغيير وحدة الحجز ${reservation.reservationNumber} إلى ${unit.unitNumber} عند تسجيل الوصول`
              : `تخصيص الوحدة ${unit.unitNumber} للحجز ${reservation.reservationNumber} عند تسجيل الوصول`,
            metadata: {
              reservationNumber: reservation.reservationNumber,
              unitId: unit.id,
              unitNumber: unit.unitNumber,
              previousUnitId,
            },
          },
          tx,
        );
      }

      await recordActivity(
        {
          actor,
          propertyId: reservation.propertyId,
          module: "reservations",
          action: "check_in",
          entityType: "Reservation",
          entityId: reservation.id,
          // The guest's name and room, never their document number.
          description: `تسجيل وصول ${reservation.guest.fullName} إلى الوحدة ${unit.unitNumber} — حجز ${reservation.reservationNumber}`,
          metadata: {
            reservationNumber: reservation.reservationNumber,
            unitId: unit.id,
            unitNumber: unit.unitNumber,
            guestId: reservation.guest.id,
            businessDate: toISODate(businessDay),
            lateArrival: eligibility.lateArrival,
          },
        },
        tx,
      );

      return {
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        status: ReservationStatus.CHECKED_IN,
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        checkedInAt: checkedInAt.toISOString(),
        guestId: reservation.guest.id,
        guestName: reservation.guest.fullName,
        lateArrival: eligibility.lateArrival,
        replayed: false,
      } satisfies CheckInResult;
    }),
  );
}

// ---------------------------------------------------------------------------
// No-show
// ---------------------------------------------------------------------------

export const NoShowSchema = z.object({
  reservationId: IdSchema,
  reason: z
    .string()
    .trim()
    .min(3, "اكتب سببًا موجزًا")
    .max(255, "السبب أطول من الحد المسموح"),
});

export type NoShowInput = z.input<typeof NoShowSchema>;

/**
 * Records that a guest never arrived, and releases the room.
 *
 * NO_SHOW is not in the inventory statuses, so the moment the status changes the
 * nights go back on the market — no separate release step, and therefore nothing that
 * can be forgotten.
 *
 * ## What happens to money
 *
 * Nothing. Payments and invoices are left exactly as they are, and this command never
 * writes a charge, a penalty or a refund. A deposit on a booking the guest did not
 * turn up for is a commercial decision — some rates forfeit it, some refund it, some
 * charge the first night — and a system that quietly picked one would be moving a
 * guest's money on a policy nobody configured. The balance stays visible on the
 * booking and on the guest's profile until somebody decides, through the payments
 * screens, what should happen to it.
 *
 * An issued invoice blocks the action outright, exactly as it blocks cancellation: a
 * document describing a stay cannot be left standing over a booking that is being
 * relabelled as never having happened.
 */
export async function markNoShow(
  rawInput: NoShowInput,
  actor: ActivityActor,
  propertyIds?: string[],
) {
  const parsed = NoShowSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات عدم الحضور غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;
  const businessDay = await getBusinessDate();

  // Outside the transaction, for the same reason as check-in above: the lock must be
  // the first statement inside, or the snapshot is frozen before the race resolves.
  const scoped = await requireScoped(prisma, input.reservationId, propertyIds);

  return withDbErrors("reservation.noShow", () =>
    prisma.$transaction(async (tx) => {
      await lockInventory(tx, [scoped.unitTypeId], scoped.unitId);

      const reservation = await tx.reservation.findUnique({
        where: { id: scoped.id },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          unitId: true,
          status: true,
          checkInDate: true,
          paidAmount: true,
          balance: true,
        },
      });

      if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

      if (reservation.status === ReservationStatus.NO_SHOW) {
        // Idempotent, like every other status command here.
        return { reservationId: reservation.id, reservationNumber: reservation.reservationNumber, replayed: true };
      }

      const issuedInvoices = await tx.invoice.count({
        where: {
          reservationId: reservation.id,
          status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] },
        },
      });

      const eligibility = evaluateNoShowEligibility({
        status: reservation.status,
        checkInDate: reservation.checkInDate,
        businessDay,
        issuedInvoices,
      });

      if (!eligibility.eligible) {
        throw new AppError("CONFLICT", eligibility.blockedReason ?? "لا يمكن تسجيل عدم الحضور.");
      }

      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.NO_SHOW,
          noShowAt: new Date(),
          noShowById: actor.id,
          noShowReason: input.reason,
        },
      });

      // The room may now be free, or may still be held for somebody else arriving
      // today — recomputed rather than assumed either way.
      if (reservation.unitId) {
        await syncUnitStatus(tx, reservation.unitId, businessDay);
      }

      await recordActivity(
        {
          actor,
          propertyId: reservation.propertyId,
          module: "reservations",
          action: "no_show",
          entityType: "Reservation",
          entityId: reservation.id,
          description: `تسجيل عدم حضور للحجز ${reservation.reservationNumber}`,
          metadata: {
            reservationNumber: reservation.reservationNumber,
            reason: input.reason,
            unitId: reservation.unitId,
            businessDate: toISODate(businessDay),
            // Recorded, not acted on: the amount somebody still has to decide about.
            outstandingPaidAmount: Money.toAmountString(reservation.paidAmount),
          },
        },
        tx,
      );

      return {
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber,
        replayed: false,
      };
    }),
  );
}
