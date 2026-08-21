import "server-only";

import { ReservationStatus } from "@/generated/prisma/enums";
import { businessDate } from "@/lib/datetime";
import type { Db } from "@/lib/db";
import { prisma } from "@/lib/db";
import { AppError, withDbErrors } from "@/server/errors";

/**
 * Availability.
 *
 * The one idea this module exists to enforce: **availability is a property of a date
 * range, never of a room's current status.** A room occupied tonight is free next
 * month; a room standing empty right now may already be sold for next week. Any code
 * that answers "can I book this?" by reading `unit.status` is asking the wrong
 * question, and will eventually sell the same night twice.
 *
 * Two half-open intervals overlap when each begins before the other ends:
 *
 *     requestedCheckIn < existingCheckOut  AND  requestedCheckOut > existingCheckIn
 *
 * Check-out is exclusive throughout, so 20→22 and 22→24 do not collide: the room is
 * sellable again on the morning the previous guest leaves.
 *
 * There is exactly one implementation of this calculation. The booking form and the
 * write that saves the booking both call it — a preview computed by one rule and
 * enforced by another is how a system ends up showing a room as free and then
 * refusing to sell it, or worse, selling it twice.
 */

// ---------------------------------------------------------------------------
// The canonical vocabulary
// ---------------------------------------------------------------------------

/**
 * Statuses that consume inventory.
 *
 * A confirmed booking and a guest in the bed both mean the room is not for sale.
 * Everything else does not: a cancelled booking released its room, a departed guest
 * no longer holds the one they left, and a no-show never arrived to claim theirs.
 *
 * PENDING is deliberately absent. An unconfirmed enquiry is not a sale, and letting
 * it hold a room means a phone call nobody followed up on takes a room off the market
 * indefinitely — there is no expiry mechanism to release it. When a hold with a
 * deadline is introduced, PENDING can join this list; until then, a pending booking
 * is a soft hold that is warned about at confirmation time, not inventory.
 */
export const INVENTORY_STATUSES: ReservationStatus[] = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
];

/**
 * A booking that exists and is visible, but does not own a room.
 *
 * Surfaced in the UI so the desk knows an enquiry is outstanding, and re-checked when
 * it is confirmed — the confirmation is where inventory is actually taken.
 */
export const SOFT_HOLD_STATUSES: ReservationStatus[] = [ReservationStatus.PENDING];

/** Why a specific room cannot be sold for a requested range. */
export type UnavailableReason =
  | "RESERVED"
  | "BLOCKED"
  | "MAINTENANCE";

export const REASON_LABELS: Record<UnavailableReason, string> = {
  RESERVED: "محجوزة خلال الفترة",
  BLOCKED: "موقوفة عن البيع",
  MAINTENANCE: "خارج الخدمة للصيانة",
};

export type UnitCandidate = {
  id: string;
  unitNumber: string;
  floor: number | null;
  available: boolean;
  reason: UnavailableReason | null;
  reasonLabel: string | null;
  /** Current housekeeping state — readiness, not availability. See below. */
  housekeepingStatus: string;
  /**
   * True when the stay starts today and the room is not yet clean. It remains
   * bookable: housekeeping is a readiness problem with hours to solve it, not a
   * claim on the room's future. Conflating the two would make a hotel unable to sell
   * a room that a guest is about to vacate and a cleaner is about to service.
   */
  needsPreparation: boolean;
  /** The booking holding it, when one does — so the refusal can name itself. */
  heldBy: { id: string; reservationNumber: string } | null;
};

export type AvailabilityResult = {
  unitTypeId: string;
  unitTypeName: string;
  checkInDate: Date;
  checkOutDate: Date;
  nights: number;
  /** Every room of this type in the property. */
  totalUnits: number;
  /** Rooms of this type that could be sold at all — blocks and faults removed. */
  sellableUnits: number;
  /** Sellable rooms already held by an overlapping booking. */
  assignedConsumed: number;
  /** Confirmed bookings of this type holding no specific room yet. */
  unassignedConsumed: number;
  /** What is genuinely left. Never negative. */
  remaining: number;
  /** Every room of the type, sellable or not, each with its verdict. */
  units: UnitCandidate[];
  /** The ids a caller may legitimately assign. */
  availableUnitIds: string[];
};

export type AvailabilityQuery = {
  propertyId: string;
  unitTypeId: string;
  checkInDate: Date | string;
  checkOutDate: Date | string;
  /** The booking being edited. Its own hold must not count against itself. */
  excludeReservationId?: string;
};

/**
 * What is available for one unit type over one date range.
 *
 * Bounded by the unit type: three queries whose result sets are the size of the
 * type's room list and the bookings overlapping the requested nights, not the size of
 * the reservation table. A hotel with a hundred thousand historical bookings answers
 * this as fast as one with a hundred, because the index takes the type, the status
 * and the two dates together.
 *
 * Pass `tx` when the caller holds a lock — the read must happen inside the same
 * transaction, or it sees a world the lock is not protecting.
 */
export async function getReservationAvailability(
  query: AvailabilityQuery,
  tx: Db = prisma,
): Promise<AvailabilityResult> {
  const checkIn = businessDate(query.checkInDate);
  const checkOut = businessDate(query.checkOutDate);

  if (checkOut.getTime() <= checkIn.getTime()) {
    throw new AppError("VALIDATION", "تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول.", {
      fields: { checkOutDate: "تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول" },
    });
  }

  return withDbErrors("availability.query", async () => {
    const unitType = await tx.unitType.findUnique({
      where: { id: query.unitTypeId },
      select: { id: true, name: true, propertyId: true },
    });

    // An id arriving from a browser is a claim, not a fact. A type belonging to
    // another property would let a caller price and sell another hotel's rooms.
    if (!unitType || unitType.propertyId !== query.propertyId) {
      throw new AppError("VALIDATION", "نوع الوحدة لا يتبع هذه المنشأة.", {
        fields: { unitTypeId: "نوع الوحدة غير صالح لهذه المنشأة" },
      });
    }

    const overlap = {
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    };

    const [units, holds, unassigned, blocks] = await Promise.all([
      tx.unit.findMany({
        where: { propertyId: query.propertyId, unitTypeId: query.unitTypeId },
        orderBy: [{ floor: "asc" }, { unitNumber: "asc" }],
        select: {
          id: true,
          unitNumber: true,
          floor: true,
          housekeepingStatus: true,
          maintenanceStatus: true,
        },
      }),

      // Bookings of any unit in this property that overlap the range and hold a room.
      tx.reservation.findMany({
        where: {
          propertyId: query.propertyId,
          unitId: { not: null },
          status: { in: INVENTORY_STATUSES },
          ...overlap,
          ...(query.excludeReservationId ? { id: { not: query.excludeReservationId } } : {}),
        },
        select: { id: true, unitId: true, reservationNumber: true },
      }),

      /*
       * Confirmed bookings of this type that have not been given a room yet. These
       * are the ones a naive implementation misses: nothing points at a unit, so a
       * per-unit check finds every room free — and the hotel cheerfully sells rooms
       * it has already promised. They consume type capacity without consuming any
       * particular room.
       */
      tx.reservation.count({
        where: {
          propertyId: query.propertyId,
          unitTypeId: query.unitTypeId,
          unitId: null,
          status: { in: INVENTORY_STATUSES },
          ...overlap,
          ...(query.excludeReservationId ? { id: { not: query.excludeReservationId } } : {}),
        },
      }),

      /*
       * Blocks overlapping the range. An open-ended block (endDate null) removes the
       * room from every date after it starts — it is a decision to withhold the room
       * until someone ends it, not until a date nobody committed to.
       */
      tx.unitBlock.findMany({
        where: {
          propertyId: query.propertyId,
          active: true,
          startDate: { lt: checkOut },
          OR: [{ endDate: null }, { endDate: { gt: checkIn } }],
        },
        select: { unitId: true },
      }),
    ]);

    const heldByUnit = new Map(holds.filter((h) => h.unitId).map((h) => [h.unitId!, h]));
    const blockedUnits = new Set(blocks.map((block) => block.unitId));

    const candidates: UnitCandidate[] = units.map((unit) => {
      /*
       * Ordered by how absolute each condition is. A block is a deliberate decision
       * and outranks everything. A fault is a physical fact about the room. A booking
       * is the ordinary case, and is named last so the more unusual reasons surface
       * when they apply.
       */
      const reason: UnavailableReason | null = blockedUnits.has(unit.id)
        ? "BLOCKED"
        : unit.maintenanceStatus !== "OPERATIONAL"
          ? "MAINTENANCE"
          : heldByUnit.has(unit.id)
            ? "RESERVED"
            : null;

      const held = heldByUnit.get(unit.id) ?? null;

      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        floor: unit.floor,
        available: reason === null,
        reason,
        reasonLabel: reason ? REASON_LABELS[reason] : null,
        housekeepingStatus: unit.housekeepingStatus,
        needsPreparation:
          unit.housekeepingStatus === "DIRTY" || unit.housekeepingStatus === "CLEANING",
        heldBy: held ? { id: held.id, reservationNumber: held.reservationNumber } : null,
      };
    });

    /*
     * A room removed by a block or a fault is already out of the sellable count, so
     * subtracting its booking again would double-count it. Capacity is therefore
     * computed from the rooms that are actually free, minus the promises made against
     * the type that no room has been attached to yet.
     */
    const sellable = candidates.filter(
      (unit) => unit.reason !== "BLOCKED" && unit.reason !== "MAINTENANCE",
    );
    const free = sellable.filter((unit) => unit.available);

    return {
      unitTypeId: unitType.id,
      unitTypeName: unitType.name,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      nights: Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000),
      totalUnits: units.length,
      sellableUnits: sellable.length,
      assignedConsumed: sellable.length - free.length,
      unassignedConsumed: unassigned,
      remaining: Math.max(0, free.length - unassigned),
      units: candidates,
      availableUnitIds: free.map((unit) => unit.id),
    };
  });
}

/**
 * Every unit type in the property with its availability for a range.
 *
 * Used by the booking form so reception can see, in one glance, that the double rooms
 * are gone but the suites are not — rather than discovering it one type at a time.
 */
export async function getPropertyAvailability(
  propertyId: string,
  checkInDate: Date | string,
  checkOutDate: Date | string,
  excludeReservationId?: string,
): Promise<AvailabilityResult[]> {
  const types = await prisma.unitType.findMany({
    where: { propertyId, status: "ACTIVE" },
    orderBy: { baseRate: "asc" },
    select: { id: true },
  });

  return Promise.all(
    types.map((type) =>
      getReservationAvailability({
        propertyId,
        unitTypeId: type.id,
        checkInDate,
        checkOutDate,
        excludeReservationId,
      }),
    ),
  );
}
