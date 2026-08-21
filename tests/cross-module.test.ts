import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { toISODate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
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
