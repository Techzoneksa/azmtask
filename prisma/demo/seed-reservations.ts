import { addDays, nightsBetween, toISODate } from "../../src/lib/datetime";

import { DEMO_BUSINESS_DATE, FUTURE_DAYS, HISTORY_DAYS } from "./constants";
import type { Foundation } from "./seed-foundation";
import type { Random } from "./random";

/**
 * The reservation scenario.
 *
 * Built as a per-unit calendar rather than as scattered bookings: for each room we
 * walk forward from the start of history, laying down stays separated by gaps. A
 * room can therefore never be double-booked by construction, not merely by luck —
 * and the same walk produces history, the current night and the forward pipeline in
 * one pass.
 *
 * Each room is given a role first, so the demo business date shows a deliberate
 * operational mix (occupied, arriving, dirty, under maintenance) instead of whatever
 * randomness happened to produce.
 */

export type UnitRole =
  | "occupied"
  | "departing_today"
  | "arriving_today"
  | "dirty"
  | "cleaning"
  | "maintenance"
  | "blocked"
  | "available";

/**
 * The target mix on the demo date. Totals 40 — the full inventory.
 *
 * 19 staying on plus 5 departing today is 24 of 40 rooms sold, 60% occupancy,
 * inside the 55-70% band the brief asks for. That leaves 8 rooms sellable tonight:
 * 4 already committed to arrivals and 4 genuinely free.
 */
export const UNIT_ROLE_PLAN: ReadonlyArray<[UnitRole, number]> = [
  ["occupied", 19],
  ["departing_today", 5],
  ["arriving_today", 4],
  ["dirty", 3],
  ["cleaning", 2],
  ["maintenance", 2],
  ["blocked", 1],
  ["available", 4],
];

export type PlannedStay = {
  unitIndex: number | null;
  guestIndex: number;
  checkIn: Date;
  checkOut: Date;
  status: "CHECKED_OUT" | "CHECKED_IN" | "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "PENDING";
  source: string;
  /** Set for stays that must land in a specific bucket on the demo date. */
  role?: UnitRole;
};

const SOURCE_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["DIRECT", 26],
  ["WEBSITE", 22],
  ["CHANNEL", 20],
  ["PHONE", 14],
  ["WALK_IN", 10],
  ["CORPORATE", 8],
];

/** Assigns each unit its role on the demo date, shuffled so it is not floor-ordered. */
export function assignUnitRoles(random: Random, unitCount: number): UnitRole[] {
  const roles: UnitRole[] = [];
  for (const [role, count] of UNIT_ROLE_PLAN) {
    for (let i = 0; i < count; i++) roles.push(role);
  }

  // The plan is written for a 40-room hotel; pad or trim if the floor plan changes.
  while (roles.length < unitCount) roles.push("available");
  return random.shuffle(roles).slice(0, unitCount);
}

/**
 * Lays down one room's stays across the whole window.
 *
 * The cursor only ever moves forward, so two stays for the same room cannot
 * overlap. Cancelled and no-show bookings are added afterwards, deliberately
 * outside this walk: they do not hold inventory, so they are free to sit on top of
 * dates a real stay also occupies — which is exactly what makes them a useful test
 * of the availability rules.
 */
function buildUnitCalendar(
  random: Random,
  unitIndex: number,
  role: UnitRole,
  guestPool: number[],
): PlannedStay[] {
  const stays: PlannedStay[] = [];
  const nextGuest = () => random.pick(guestPool);

  // --- history: completed stays before the demo date -----------------------
  let cursor = -HISTORY_DAYS;

  // A room that is occupied tonight was probably occupied recently too; an
  // available one has had gaps. Varying the gap by role produces the occupancy
  // curve the dashboard will later chart.
  const gapRange: [number, number] =
    role === "available" || role === "blocked" ? [2, 7] : [0, 4];

  while (cursor < -1) {
    cursor += random.int(gapRange[0], gapRange[1]);
    const nights = random.int(1, 6);
    if (cursor >= -1) break;

    // The stay must finish before tonight's scenario begins.
    const limit = role === "occupied" || role === "departing_today" ? -1 : 0;
    if (cursor + nights > limit) break;

    stays.push({
      unitIndex,
      guestIndex: nextGuest(),
      checkIn: addDays(DEMO_BUSINESS_DATE, cursor),
      checkOut: addDays(DEMO_BUSINESS_DATE, cursor + nights),
      status: "CHECKED_OUT",
      source: random.weighted(SOURCE_WEIGHTS),
    });

    cursor += nights;
  }

  // --- the demo date itself ------------------------------------------------
  let resumeFrom = 0;

  switch (role) {
    case "occupied": {
      // In-house tonight: arrived before today, leaving after today.
      const start = -random.int(1, 4);
      const end = random.int(1, 5);
      stays.push({
        unitIndex,
        guestIndex: nextGuest(),
        checkIn: addDays(DEMO_BUSINESS_DATE, start),
        checkOut: addDays(DEMO_BUSINESS_DATE, end),
        status: "CHECKED_IN",
        source: random.weighted(SOURCE_WEIGHTS),
        role,
      });
      resumeFrom = end;
      break;
    }

    case "departing_today": {
      // In-house, but checking out today — the checkout queue for the demo.
      const start = -random.int(2, 5);
      stays.push({
        unitIndex,
        guestIndex: nextGuest(),
        checkIn: addDays(DEMO_BUSINESS_DATE, start),
        checkOut: DEMO_BUSINESS_DATE,
        status: "CHECKED_IN",
        source: random.weighted(SOURCE_WEIGHTS),
        role,
      });
      resumeFrom = 1;
      break;
    }

    case "arriving_today": {
      // Confirmed, not yet checked in — reception's arrivals list.
      const nights = random.int(1, 5);
      stays.push({
        unitIndex,
        guestIndex: nextGuest(),
        checkIn: DEMO_BUSINESS_DATE,
        checkOut: addDays(DEMO_BUSINESS_DATE, nights),
        status: "CONFIRMED",
        source: random.weighted(SOURCE_WEIGHTS),
        role,
      });
      resumeFrom = nights;
      break;
    }

    case "dirty": {
      // Departed this morning; the room has not been cleaned yet.
      stays.push({
        unitIndex,
        guestIndex: nextGuest(),
        checkIn: addDays(DEMO_BUSINESS_DATE, -random.int(2, 4)),
        checkOut: DEMO_BUSINESS_DATE,
        status: "CHECKED_OUT",
        source: random.weighted(SOURCE_WEIGHTS),
        role,
      });
      resumeFrom = 2;
      break;
    }

    case "cleaning": {
      // Departed yesterday; housekeeping is in the room right now.
      stays.push({
        unitIndex,
        guestIndex: nextGuest(),
        checkIn: addDays(DEMO_BUSINESS_DATE, -random.int(3, 5)),
        checkOut: addDays(DEMO_BUSINESS_DATE, -1),
        status: "CHECKED_OUT",
        source: random.weighted(SOURCE_WEIGHTS),
        role,
      });
      resumeFrom = 1;
      break;
    }

    // Out of order or held back: no stay tonight, and nothing sold into them
    // until they are released.
    case "maintenance":
    case "blocked":
      resumeFrom = random.int(3, 8);
      break;

    case "available":
      resumeFrom = 0;
      break;
  }

  // --- forward pipeline ----------------------------------------------------
  cursor = resumeFrom;
  while (cursor < FUTURE_DAYS) {
    cursor += random.int(1, 8);
    const nights = random.int(1, 5);
    if (cursor + nights > FUTURE_DAYS) break;

    stays.push({
      unitIndex,
      guestIndex: nextGuest(),
      checkIn: addDays(DEMO_BUSINESS_DATE, cursor),
      checkOut: addDays(DEMO_BUSINESS_DATE, cursor + nights),
      // A booking a fortnight out is usually confirmed; a couple are still pending.
      status: cursor > 20 && random.chance(0.15) ? "PENDING" : "CONFIRMED",
      source: random.weighted(SOURCE_WEIGHTS),
    });

    cursor += nights;
  }

  return stays;
}

/**
 * Bookings that never occupied the room. They are generated outside the per-unit
 * walk precisely because they must not reserve inventory — a cancelled booking that
 * still blocked its dates would be a bug the availability tests should catch.
 */
function buildLostBusiness(
  random: Random,
  unitCount: number,
  guestPool: number[],
): PlannedStay[] {
  const stays: PlannedStay[] = [];

  for (let i = 0; i < 9; i++) {
    const offset = random.int(-HISTORY_DAYS + 2, FUTURE_DAYS - 4);
    const nights = random.int(1, 4);
    stays.push({
      unitIndex: random.int(0, unitCount - 1),
      guestIndex: random.pick(guestPool),
      checkIn: addDays(DEMO_BUSINESS_DATE, offset),
      checkOut: addDays(DEMO_BUSINESS_DATE, offset + nights),
      status: "CANCELLED",
      source: random.weighted(SOURCE_WEIGHTS),
    });
  }

  for (let i = 0; i < 4; i++) {
    const offset = random.int(-HISTORY_DAYS + 2, -2);
    stays.push({
      unitIndex: random.int(0, unitCount - 1),
      guestIndex: random.pick(guestPool),
      checkIn: addDays(DEMO_BUSINESS_DATE, offset),
      checkOut: addDays(DEMO_BUSINESS_DATE, offset + random.int(1, 3)),
      status: "NO_SHOW",
      source: random.weighted(SOURCE_WEIGHTS),
    });
  }

  // A pair of enquiries not yet tied to a room, exercising the unassigned path.
  for (let i = 0; i < 2; i++) {
    const offset = random.int(5, FUTURE_DAYS - 5);
    stays.push({
      unitIndex: null,
      guestIndex: random.pick(guestPool),
      checkIn: addDays(DEMO_BUSINESS_DATE, offset),
      checkOut: addDays(DEMO_BUSINESS_DATE, offset + random.int(1, 4)),
      status: "PENDING",
      source: "WEBSITE",
    });
  }

  /*
   * Two arrivals due today whose room has not been picked yet. Real reception work
   * looks like this — the booking is confirmed against a room type and the specific
   * room is chosen at the desk — and it takes today's arrivals list to six without
   * committing more inventory than the mix above allows.
   */
  for (let i = 0; i < 2; i++) {
    stays.push({
      unitIndex: null,
      guestIndex: random.pick(guestPool),
      checkIn: DEMO_BUSINESS_DATE,
      checkOut: addDays(DEMO_BUSINESS_DATE, random.int(1, 4)),
      status: "CONFIRMED",
      source: random.weighted(SOURCE_WEIGHTS),
      role: "arriving_today",
    });
  }

  return stays;
}

export function planReservations(
  random: Random,
  units: Foundation["units"],
  guestCount: number,
): { stays: PlannedStay[]; roles: UnitRole[] } {
  const roles = assignUnitRoles(random, units.length);
  const guestPool = Array.from({ length: guestCount }, (_, i) => i);

  const stays: PlannedStay[] = [];
  units.forEach((_, index) => {
    stays.push(...buildUnitCalendar(random, index, roles[index], guestPool));
  });
  stays.push(...buildLostBusiness(random, units.length, guestPool));

  // Chronological insert order: a payment must never predate its reservation, and
  // the activity log should read as a story rather than a shuffled deck.
  stays.sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());

  return { stays, roles };
}

/** Human-readable summary, used by the seed's console output. */
export function describePlan(stays: PlannedStay[]): string {
  const counts = new Map<string, number>();
  for (const stay of stays) {
    counts.set(stay.status, (counts.get(stay.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, n]) => `${status}=${n}`).join(" ");
}

export { nightsBetween, toISODate };
