import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { toISODate } from "@/lib/datetime";
import { prisma } from "@/lib/db";

import { resetDatabase } from "./helpers";
import type { Permission } from "@/lib/permissions";
import { getBusinessDate } from "@/server/business-date";
import {
  OCCUPANCY_LABELS,
  allArrivalsOn,
  allDeparturesOn,
  coversNight,
  expectedArrivalsOn,
  remainingDeparturesOn,
} from "@/server/occupancy";
import { getReservationCalendar } from "@/server/services/calendar.service";
import { getDashboardSnapshot } from "@/server/services/dashboard.service";

import { findDemoProperty } from "../prisma/demo/reset";

/**
 * Cross-module reconciliation.
 *
 * The dashboard and the calendar both report occupancy for the same property on the
 * same day and give different numbers. That is correct — they answer different
 * questions — but it stops being correct the moment two of those numbers share a name,
 * because then a manager reading one screen and then the other cannot tell which is
 * wrong and concludes both are.
 *
 * These tests pin the two things that must stay true: every figure means exactly what
 * it is named, and the arithmetic relating the two families holds. If somebody later
 * changes one query, the relationship breaks here rather than in front of a manager.
 */

const run = promisify(execFile);

let propertyId: string;
let today: Date;
let iso: string;

const ALL: Permission[] = [
  "dashboard.view",
  "reservations.view",
  "payments.view",
  "invoices.view",
  "units.view",
  "housekeeping.view",
  "maintenance.view",
  "inventory.view",
  "activity.view",
];

beforeAll(async () => {
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL! };
    /*
   * Truncate first. This suite builds its own world from the real seed commands, and
   * reservation numbers are globally unique — so rows another file left behind make
   * the seed collide, and the suite then passes or fails on file ordering rather than
   * on anything it is testing.
   */
  await resetDatabase();

  await run("npx", ["tsx", "prisma/seed.ts"], { env });
  await run("npx", ["tsx", "prisma/demo-seed.ts"], { env });

  const found = await findDemoProperty(prisma);
  if (!found) throw new Error("تعذّر إنشاء بيانات العرض.");
  propertyId = found;
  today = await getBusinessDate();
  iso = toISODate(today);
}, 300_000);

const dashboard = () => getDashboardSnapshot(ALL, propertyId);
const calendar = () =>
  getReservationCalendar([propertyId], { from: iso, days: 7 }, new Set(ALL));

const count = (where: object) =>
  prisma.reservation.count({ where: { propertyId, ...where } });

// ---------------------------------------------------------------------------

describe("the vocabulary", () => {
  it("gives every occupancy figure a distinct name", () => {
    // The rule this whole module exists for: one name, one measure.
    const labels = Object.values(OCCUPANCY_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("what each dashboard figure counts", () => {
  it("counts occupied as rooms with a guest in them right now", async () => {
    const snapshot = await dashboard();
    const units = snapshot!.units.ok ? snapshot!.units.data : null;

    const occupiedRooms = await prisma.unit.count({
      where: { propertyId, status: "OCCUPIED" },
    });
    expect(units!.occupied).toBe(occupiedRooms);
  });

  it("counts ready as rooms that are empty, clean and working", async () => {
    const snapshot = await dashboard();
    const units = snapshot!.units.ok ? snapshot!.units.data : null;

    const ready = await prisma.unit.count({ where: { propertyId, status: "AVAILABLE" } });
    expect(units!.available).toBe(ready);

    // Not the same as "not sold tonight": rooms awaiting a clean are excluded here.
    const awaitingClean = await prisma.unit.count({
      where: { propertyId, status: "CLEANING" },
    });
    expect(awaitingClean).toBeGreaterThan(0);
  });

  it("counts arrivals as bookings expected but not yet checked in", async () => {
    const snapshot = await dashboard();
    const arrivals = snapshot!.arrivals.ok ? snapshot!.arrivals.data : [];

    expect(arrivals.length).toBe(await count(expectedArrivalsOn(today)));
  });

  it("counts departures as guests still in the building", async () => {
    const snapshot = await dashboard();
    const departures = snapshot!.departures.ok ? snapshot!.departures.data : [];

    expect(departures.length).toBe(await count(remainingDeparturesOn(today)));
    // Explicitly not everyone who leaves today — half of them have already gone.
    expect(departures.length).toBeLessThan(await count(allDeparturesOn(today)));
  });
});

describe("what each calendar figure counts", () => {
  it("counts sold as rooms holding a booking for that night", async () => {
    const { agenda } = await calendar();

    const rooms = await prisma.reservation.findMany({
      where: {
        propertyId,
        unitId: { not: null },
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
        ...coversNight(today),
      },
      select: { unitId: true },
      distinct: ["unitId"],
    });
    expect(agenda.summary.soldOnDate).toBe(rooms.length);
  });

  it("counts arrivals as everyone arriving, each exactly once", async () => {
    const { agenda } = await calendar();

    /*
     * The bug this pins: the day query filters by property, not by unit, so bookings
     * with no room assigned are already in it. Adding the unassigned count on top
     * counted those guests twice and reported eight arrivals where six were expected.
     */
    expect(agenda.summary.allArrivals).toBe(await count(allArrivalsOn(today)));
    expect(agenda.arrivals.map((entry) => entry.id)).toHaveLength(
      new Set(agenda.arrivals.map((entry) => entry.id)).size,
    );
    expect(agenda.summary.unassignedArrivals).toBeLessThanOrEqual(agenda.summary.allArrivals);
  });

  it("counts departures as everyone leaving, gone or not", async () => {
    const { agenda } = await calendar();
    expect(agenda.summary.allDepartures).toBe(await count(allDeparturesOn(today)));
  });

  it("counts sellable as rooms not sold, not blocked and not out of service", async () => {
    const { agenda } = await calendar();
    const { summary } = agenda;

    // Every room falls into exactly one bucket, so the four must sum to the total.
    expect(summary.soldOnDate + summary.sellableOnDate + summary.blocked + summary.maintenance)
      .toBe(summary.units);
  });
});

describe("how the two families relate", () => {
  it("explains the gap between rooms occupied now and rooms sold tonight", async () => {
    const snapshot = await dashboard();
    const { agenda } = await calendar();
    const units = snapshot!.units.ok ? snapshot!.units.data : null;

    /*
     * The arithmetic a manager needs to see the two numbers as consistent:
     *
     *   rooms with a guest in them now
     *     − those whose guest leaves today
     *     + rooms sold tonight to someone arriving
     *   = rooms sold tonight
     *
     * Bookings with no room assigned are excluded from both sides: they hold type
     * capacity, not a room, so they appear in neither room count.
     */
    const leavingToday = await prisma.reservation.count({
      where: { propertyId, unitId: { not: null }, ...remainingDeparturesOn(today) },
    });
    const arrivingIntoARoom = await prisma.reservation.count({
      where: { propertyId, unitId: { not: null }, checkInDate: today, status: "CONFIRMED" },
    });

    expect(units!.occupied - leavingToday + arrivingIntoARoom).toBe(agenda.summary.soldOnDate);
  });

  it("explains the gap between expected and total arrivals", async () => {
    const snapshot = await dashboard();
    const { agenda } = await calendar();
    const expected = snapshot!.arrivals.ok ? snapshot!.arrivals.data.length : -1;

    // The calendar adds those already checked in; the dashboard drops them, because
    // its list is of people still to be received.
    const alreadyIn = await count({ checkInDate: today, status: "CHECKED_IN" });
    const stillPending = await count({ checkInDate: today, status: "PENDING" });

    expect(expected - stillPending + alreadyIn).toBe(agenda.summary.allArrivals);
  });

  it("explains the gap between remaining and total departures", async () => {
    const snapshot = await dashboard();
    const { agenda } = await calendar();
    const remaining = snapshot!.departures.ok ? snapshot!.departures.data.length : -1;

    const alreadyGone = await count({ checkOutDate: today, status: "CHECKED_OUT" });
    expect(remaining + alreadyGone).toBe(agenda.summary.allDepartures);
  });

  it("explains the gap between ready now and sellable tonight", async () => {
    const snapshot = await dashboard();
    const { agenda } = await calendar();
    const units = snapshot!.units.ok ? snapshot!.units.data : null;

    /*
     * A room can be sellable for tonight while not being ready to hand over now: it
     * may be awaiting a clean, or reserved for an arrival that has not walked in.
     * Sellable is therefore always the larger of the two.
     */
    expect(agenda.summary.sellableOnDate).toBeGreaterThanOrEqual(units!.available);
  });

  it("agrees on the figures that genuinely are the same measure", async () => {
    const snapshot = await dashboard();
    const { agenda } = await calendar();
    const units = snapshot!.units.ok ? snapshot!.units.data : null;

    // Blocks and faults are properties of the room, not of a night, so both screens
    // must report them identically — and this is where a future drift would show.
    expect(agenda.summary.blocked).toBe(units!.blocked);
    expect(agenda.summary.maintenance).toBe(units!.maintenance);
    expect(agenda.summary.units).toBe(units!.total);
  });
});

describe("the deterministic demo snapshot", () => {
  /*
   * The seed is deterministic, so these are facts about the scenario rather than
   * guesses. They are pinned because the Stage 8 block fix touched the seed, and the
   * question "did the numbers move?" deserves an answer a test can give rather than a
   * paragraph in a report.
   *
   * They did not: the fix added a `unit_blocks` row explaining a room that was already
   * marked BLOCKED. No unit's status changed, and no reservation changed.
   */
  it("keeps the dashboard figures approved in Stage 4 exactly as they were", async () => {
    const snapshot = await dashboard();
    const units = snapshot!.units.ok ? snapshot!.units.data : null;

    expect(iso).toBe("2026-08-20");
    expect(units!.occupied).toBe(24);
    expect(units!.available).toBe(4);
    expect(units!.maintenance).toBe(2);
    expect(units!.blocked).toBe(1);
    expect(snapshot!.arrivals.ok ? snapshot!.arrivals.data.length : -1).toBe(6);
    expect(snapshot!.departures.ok ? snapshot!.departures.data.length : -1).toBe(5);
  });

  it("reports the calendar's own measures for the same day", async () => {
    const { agenda } = await calendar();

    expect(agenda.summary.soldOnDate).toBe(23);
    // Six, not eight: the double-counted unassigned arrivals are fixed.
    expect(agenda.summary.allArrivals).toBe(6);
    expect(agenda.summary.allDepartures).toBe(10);
    expect(agenda.summary.sellableOnDate).toBe(14);
    expect(agenda.summary.unassignedArrivals).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Stage 9 — one real arrival, seen from every screen
// ---------------------------------------------------------------------------

/**
 * Deliberately last in the file: it changes the data the pinned figures above
 * describe. It also deliberately performs a *real* check-in rather than fabricating
 * one per module — the point is that a single transition moves every screen at once,
 * and six separately-constructed fixtures could all agree while the real path did
 * something else entirely.
 */
describe("a check-in seen from every module", () => {
  it("moves every figure the way its name says it should", async () => {
    const arrival = await prisma.reservation.findFirstOrThrow({
      where: {
        propertyId,
        status: "CONFIRMED",
        checkInDate: today,
        unitId: { not: null },
      },
      select: {
        id: true,
        unitId: true,
        guestId: true,
        checkInDate: true,
        checkOutDate: true,
      },
    });

    /*
     * The guest and the room are made check-in-ready directly. Those rules have their
     * own suite; here they are preconditions, and a demo guest missing a passport
     * number would make this test fail for a reason that has nothing to do with
     * cross-module agreement.
     */
    await prisma.guest.update({
      where: { id: arrival.guestId },
      data: {
        nationality: "سعودي",
        mobile: "0555000111",
        identificationType: "NATIONAL_ID",
        identificationNumber: `19${Date.now().toString().slice(-8)}`,
      },
    });
    await prisma.unit.update({
      where: { id: arrival.unitId! },
      data: { housekeepingStatus: "CLEAN" },
    });

    const before = {
      dashboard: await dashboard(),
      calendar: await calendar(),
    };
    const beforeUnits = before.dashboard!.units.ok ? before.dashboard!.units.data : null;
    const beforeBar = before.calendar.rows
      .flatMap((row) => row.bars)
      .find((bar) => bar.id === arrival.id);

    expect(beforeBar).toBeDefined();
    expect(beforeBar!.status).toBe("CONFIRMED");

    const { checkInReservation } = await import("@/server/services/checkin.service");
    await checkInReservation({ reservationId: arrival.id }, {
      id: null,
      name: "اختبار الربط",
      email: "cross@nokhba-hotel.sa",
      roles: ["admin"],
    });

    const after = {
      dashboard: await dashboard(),
      calendar: await calendar(),
    };
    const afterUnits = after.dashboard!.units.ok ? after.dashboard!.units.data : null;

    // ---- the reservation itself
    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: arrival.id },
      select: { status: true, checkedInAt: true, unitId: true },
    });
    expect(stored.status).toBe("CHECKED_IN");
    expect(stored.checkedInAt).toBeInstanceOf(Date);

    // ---- the unit
    const unit = await prisma.unit.findUniqueOrThrow({
      where: { id: arrival.unitId! },
      select: { status: true },
    });
    expect(unit.status).toBe("OCCUPIED");

    // ---- the dashboard, in the vocabulary Stage 8 fixed
    const beforeExpected = before.dashboard!.arrivals.ok
      ? before.dashboard!.arrivals.data.length
      : -1;
    const afterExpected = after.dashboard!.arrivals.ok
      ? after.dashboard!.arrivals.data.length
      : -1;

    expect(afterExpected).toBe(beforeExpected - 1);
    expect(afterUnits!.occupied).toBe(beforeUnits!.occupied + 1);

    // ---- but the total for the day does not move: the guest still arrived today
    expect(after.calendar.agenda.summary.allArrivals).toBe(
      before.calendar.agenda.summary.allArrivals,
    );

    // ---- the calendar draws the same stay, only differently labelled
    const afterBar = after.calendar.rows
      .flatMap((row) => row.bars)
      .find((bar) => bar.id === arrival.id);

    expect(afterBar).toBeDefined();
    expect(afterBar!.status).toBe("CHECKED_IN");
    // Geometry is a property of the dates, and the dates did not change.
    expect(afterBar!.geometry.startIndex).toBe(beforeBar!.geometry.startIndex);
    expect(afterBar!.geometry.span).toBe(beforeBar!.geometry.span);
    expect(afterBar!.kind).toBe(beforeBar!.kind);

    // ---- the guest profile moves the booking from upcoming to current, once
    const { getGuestDetails } = await import("@/server/services/guest.service");
    const profile = await getGuestDetails(
      arrival.guestId,
      [propertyId],
      new Set(ALL),
    );

    const inCurrent = profile.currentStays.filter((stay) => stay.id === arrival.id);
    const inUpcoming = profile.upcoming.filter((stay) => stay.id === arrival.id);
    expect(inCurrent).toHaveLength(1);
    expect(inUpcoming).toHaveLength(0);

    // ---- the unit page names the guest now in the room
    const { getUnitDetails } = await import("@/server/services/unit.service");
    const detail = await getUnitDetails(propertyId, arrival.unitId!);
    expect(detail.currentStay?.id).toBe(arrival.id);

    // ---- money is untouched by an arrival
    const financial = await prisma.reservation.findUniqueOrThrow({
      where: { id: arrival.id },
      select: { total: true, paidAmount: true, balance: true },
    });
    const payments = await prisma.payment.aggregate({
      where: { reservationId: arrival.id },
      _sum: { amount: true },
    });
    expect(financial.paidAmount.toString()).toBe(
      (payments._sum.amount ?? 0).toString(),
    );
  });
});

// ---------------------------------------------------------------------------
// Stage 10 — one room through the cleaning cycle, seen from every screen
// ---------------------------------------------------------------------------

/**
 * The chain Stage 11's checkout will lean on, exercised end to end through the real
 * services: a departure dirties a room and queues the work, the work moves through
 * assignment and cleaning, and the room comes back as something reception can hand to
 * a guest — without a single manual status write anywhere.
 *
 * Also last in the file, for the same reason as the arrival test above: it changes the
 * data the pinned figures describe.
 */
describe("a cleaning cycle seen from every module", () => {
  it("carries a departed room back to check-in readiness by itself", async () => {
    const { checkOut } = await import("@/server/services/stay.service");
    const {
      completeHousekeepingTask,
      assignHousekeepingTask,
      startHousekeepingTask,
      getHousekeepingSummary,
      inspectUnit,
    } = await import("@/server/services/housekeeping.service");
    const { getUnitDetails } = await import("@/server/services/unit.service");

    const actor = {
      id: null,
      name: "اختبار النظافة",
      email: "hk-cross@nokhba-hotel.sa",
      roles: ["admin"],
    };

    const stay = await prisma.reservation.findFirstOrThrow({
      where: { propertyId, status: "CHECKED_IN", unitId: { not: null } },
      select: { id: true, unitId: true },
    });

    const before = await getHousekeepingSummary([propertyId]);

    // ---- the departure dirties the room and queues the work, in one transaction
    await checkOut(stay.id, actor, { allowOutstandingBalance: true });

    const afterCheckout = await prisma.unit.findUniqueOrThrow({
      where: { id: stay.unitId! },
      select: { status: true, housekeepingStatus: true },
    });
    expect(afterCheckout.housekeepingStatus).toBe("DIRTY");
    expect(afterCheckout.status).toBe("CLEANING");

    const task = await prisma.housekeepingTask.findFirstOrThrow({
      where: {
        unitId: stay.unitId!,
        status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] },
      },
      select: { id: true, source: true, sourceReservationId: true, priority: true },
    });
    // The origin is a reference, not a sentence in a notes field.
    expect(task.source).toBe("CHECKOUT");
    expect(task.sourceReservationId).toBe(stay.id);
    expect(task.priority).toBe("HIGH");

    // ---- the summary moves with it
    const queued = await getHousekeepingSummary([propertyId]);
    expect(queued.dirty).toBe(before.dirty + 1);

    // ---- assignment, start, completion
    const attendant = await prisma.employee.findFirstOrThrow({
      where: { propertyId, department: "HOUSEKEEPING", employmentStatus: "ACTIVE" },
      select: { id: true },
    });

    await assignHousekeepingTask({ taskId: task.id, employeeId: attendant.id }, actor, [propertyId]);
    await startHousekeepingTask(task.id, actor, [propertyId]);

    expect(
      (
        await prisma.unit.findUniqueOrThrow({
          where: { id: stay.unitId! },
          select: { housekeepingStatus: true },
        })
      ).housekeepingStatus,
    ).toBe("CLEANING");

    const completed = await completeHousekeepingTask({ taskId: task.id }, actor, [propertyId]);
    expect(completed.housekeepingStatus).toBe("CLEAN");
    // Derived, not asserted: nobody is in it, nothing blocks it, no fault is open.
    expect(completed.unitStatus).toBe("AVAILABLE");

    // ---- the unit page agrees
    const detail = await getUnitDetails(propertyId, stay.unitId!);
    expect(detail.housekeepingStatus).toBe("CLEAN");
    expect(detail.currentStay).toBeNull();
    expect(detail.housekeeping.some((entry) => entry.id === task.id && !entry.active)).toBe(true);

    // ---- the sign-off is recorded with a name and a time
    const inspected = await inspectUnit(stay.unitId!, actor, [propertyId]);
    expect(inspected.housekeepingStatus).toBe("INSPECTED");

    /*
     * The dirty count comes back to where it started. The clean count does *not* go
     * up: the room was occupied and clean before the guest left, so it was already
     * counted — which is the whole point of the name. Housekeeping counts physical
     * readiness; it does not count what can be sold.
     */
    const finished = await getHousekeepingSummary([propertyId]);
    expect(finished.dirty).toBe(before.dirty);
    expect(finished.cleanRooms).toBe(before.cleanRooms);
  });

  it("keeps a room out of service when a fault outlives the clean", async () => {
    const { createHousekeepingTask, completeHousekeepingTask } = await import(
      "@/server/services/housekeeping.service"
    );

    const actor = {
      id: null,
      name: "اختبار الصيانة",
      email: "mt-cross@nokhba-hotel.sa",
      roles: ["admin"],
    };

    // A room nobody is in, taken out of service and left dirty.
    const unit = await prisma.unit.findFirstOrThrow({
      where: {
        propertyId,
        reservations: { none: { status: "CHECKED_IN" } },
        blocks: { none: { active: true } },
        housekeepingTasks: { none: { status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } } },
      },
      select: { id: true },
    });

    await prisma.unit.update({
      where: { id: unit.id },
      data: { housekeepingStatus: "DIRTY", maintenanceStatus: "OUT_OF_SERVICE" },
    });

    const task = await createHousekeepingTask({ unitId: unit.id } as never, actor, [propertyId]);
    const result = await completeHousekeepingTask({ taskId: task.taskId }, actor, [propertyId]);

    // Housekeeping did its job; the room is still not sellable, and cleaning is not
    // what decides that.
    expect(result.housekeepingStatus).toBe("CLEAN");
    expect(result.unitStatus).toBe("MAINTENANCE");
  });
});
