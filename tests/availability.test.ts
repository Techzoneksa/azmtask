import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { getReservationAvailability, INVENTORY_STATUSES } from "@/server/services/availability.service";
import { createReservation } from "@/server/services/reservation.service";

import { TEST_ACTOR, resetDatabase, seedGuest, seedInventory } from "./helpers";

/**
 * Phase 7 — availability.
 *
 * The rule every test here defends: availability is a property of a date range, not
 * of a room's current status. A room occupied tonight is free next month; a room
 * standing empty is not for sale if it is already promised. Getting this wrong is how
 * a hotel sells the same night twice.
 */

let ctx: Awaited<ReturnType<typeof seedInventory>>;
let guest: Awaited<ReturnType<typeof seedGuest>>;

const AUG_20 = "2026-08-20";
const AUG_22 = "2026-08-22";
const AUG_24 = "2026-08-24";
const SEP_10 = "2026-09-10";
const SEP_12 = "2026-09-12";

async function ask(overrides: Record<string, unknown> = {}) {
  return getReservationAvailability({
    propertyId: ctx.property.id,
    unitTypeId: ctx.unitType.id,
    checkInDate: AUG_20,
    checkOutDate: AUG_22,
    ...overrides,
  });
}

async function book(overrides: Record<string, unknown> = {}) {
  return createReservation(
    {
      propertyId: ctx.property.id,
      guestId: guest.id,
      unitId: ctx.units[0].id,
      unitTypeId: ctx.unitType.id,
      checkInDate: AUG_20,
      checkOutDate: AUG_22,
      adults: 2,
      nightlyRate: "400.00",
      status: "CONFIRMED",
      ...overrides,
    } as never,
    TEST_ACTOR,
  );
}

/*
 * Left clean for whatever runs next. These suites create properties of their own, and
 * the demo-seeded suites reset only the demo property — residue here surfaces there as
 * a reservation-number collision, which is a confusing way to learn about it.
 */
afterAll(resetDatabase);

beforeEach(async () => {
  await resetDatabase();
  ctx = await seedInventory({ units: 3 });
  guest = await seedGuest();
});

describe("the canonical inventory vocabulary", () => {
  it("counts only a confirmed booking and a guest in the bed", () => {
    // One definition, imported everywhere. Two definitions of "sold" is one more than
    // a booking system survives — this used to differ between service and validator.
    expect(INVENTORY_STATUSES).toEqual(["CONFIRMED", "CHECKED_IN"]);
  });
});

describe("date-range availability", () => {
  it("returns every room when nothing is booked", async () => {
    const result = await ask();

    expect(result.totalUnits).toBe(3);
    expect(result.sellableUnits).toBe(3);
    expect(result.remaining).toBe(3);
    expect(result.availableUnitIds).toHaveLength(3);
    expect(result.nights).toBe(2);
  });

  it("removes a room booked over the requested nights", async () => {
    await book();
    const result = await ask();

    expect(result.remaining).toBe(2);
    expect(result.availableUnitIds).not.toContain(ctx.units[0].id);

    const taken = result.units.find((unit) => unit.id === ctx.units[0].id)!;
    expect(taken.available).toBe(false);
    expect(taken.reason).toBe("RESERVED");
    // The refusal names the booking, so the desk knows what it is arguing with.
    expect(taken.heldBy?.reservationNumber).toBeTruthy();
  });

  it("leaves the same room free on other dates", async () => {
    await book();
    // The whole point: a room occupied in August is for sale in September.
    const later = await ask({ checkInDate: SEP_10, checkOutDate: SEP_12 });

    expect(later.remaining).toBe(3);
    expect(later.availableUnitIds).toContain(ctx.units[0].id);
  });

  it("allows a booking that starts the day another ends", async () => {
    await book({ checkInDate: AUG_20, checkOutDate: AUG_22 });
    // Check-out is exclusive: the room is sellable the morning the guest leaves.
    const result = await ask({ checkInDate: AUG_22, checkOutDate: AUG_24 });

    expect(result.availableUnitIds).toContain(ctx.units[0].id);
    expect(result.remaining).toBe(3);
  });

  it("excludes a booking that merely touches the range at its end", async () => {
    await book({ checkInDate: AUG_22, checkOutDate: AUG_24 });
    const result = await ask({ checkInDate: AUG_20, checkOutDate: AUG_22 });

    expect(result.availableUnitIds).toContain(ctx.units[0].id);
  });

  it("catches a booking enclosed by the requested range", async () => {
    await book({ checkInDate: "2026-08-21", checkOutDate: "2026-08-22" });
    const result = await ask({ checkInDate: AUG_20, checkOutDate: AUG_24 });

    expect(result.availableUnitIds).not.toContain(ctx.units[0].id);
  });

  it("catches a booking that encloses the requested range", async () => {
    await book({ checkInDate: AUG_20, checkOutDate: AUG_24 });
    const result = await ask({ checkInDate: "2026-08-21", checkOutDate: AUG_22 });

    expect(result.availableUnitIds).not.toContain(ctx.units[0].id);
  });

  it("refuses a range that ends before it starts", async () => {
    await expect(ask({ checkInDate: AUG_22, checkOutDate: AUG_20 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuses a unit type from another property", async () => {
    const other = await seedInventory({ units: 1, name: "فندق آخر", unitPrefix: "X" });
    await expect(ask({ unitTypeId: other.unitType.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("which statuses take a room off the market", () => {
  const cases: Array<[string, boolean]> = [
    ["CONFIRMED", true],
    ["CHECKED_IN", true],
    ["PENDING", false],
    ["CANCELLED", false],
    ["NO_SHOW", false],
    ["CHECKED_OUT", false],
  ];

  for (const [status, blocks] of cases) {
    it(`${status} ${blocks ? "holds" : "releases"} the room`, async () => {
      const reservation = await book({ status: "CONFIRMED" });
      // Written directly: the service refuses to create most of these outright, and
      // what is under test is how availability reads them once they exist.
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { status: status as never },
      });

      const result = await ask();
      expect(result.availableUnitIds.includes(ctx.units[0].id)).toBe(!blocks);
      expect(result.remaining).toBe(blocks ? 2 : 3);
    });
  }
});

describe("unassigned bookings consume type capacity", () => {
  it("spends capacity without holding any particular room", async () => {
    // The failure mode this exists to prevent: nothing points at a room, so a
    // per-room check finds every room free and the hotel oversells.
    await book({ unitId: undefined });
    const result = await ask();

    expect(result.unassignedConsumed).toBe(1);
    expect(result.assignedConsumed).toBe(0);
    // Every room is still individually free…
    expect(result.availableUnitIds).toHaveLength(3);
    // …but only two of them are actually for sale.
    expect(result.remaining).toBe(2);
  });

  it("does not spend capacity while it is only a pending enquiry", async () => {
    await book({ unitId: undefined, status: "PENDING" });
    const result = await ask();

    expect(result.unassignedConsumed).toBe(0);
    expect(result.remaining).toBe(3);
  });

  it("adds assigned and unassigned together", async () => {
    await book({ unitId: ctx.units[0].id });
    await book({ unitId: undefined });
    const result = await ask();

    expect(result.assignedConsumed).toBe(1);
    expect(result.unassignedConsumed).toBe(1);
    expect(result.remaining).toBe(1);
  });

  it("never reports negative capacity", async () => {
    for (let i = 0; i < 3; i++) await book({ unitId: undefined });
    const result = await ask();

    expect(result.unassignedConsumed).toBe(3);
    expect(result.remaining).toBe(0);
  });

  it("does not count the booking being edited against itself", async () => {
    const reservation = await book({ unitId: undefined });
    const result = await ask({ excludeReservationId: reservation.id });

    expect(result.unassignedConsumed).toBe(0);
    expect(result.remaining).toBe(3);
  });
});

describe("blocks", () => {
  it("removes a room blocked across the requested nights", async () => {
    await prisma.unitBlock.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.units[0].id,
        reason: "RENOVATION",
        startDate: new Date("2026-08-19T00:00:00.000Z"),
        endDate: new Date("2026-08-25T00:00:00.000Z"),
        active: true,
      },
    });

    const result = await ask();
    expect(result.sellableUnits).toBe(2);
    expect(result.remaining).toBe(2);
    expect(result.units.find((u) => u.id === ctx.units[0].id)?.reason).toBe("BLOCKED");
  });

  it("leaves a room free on dates the block does not cover", async () => {
    await prisma.unitBlock.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.units[0].id,
        reason: "DEEP_CLEANING",
        startDate: new Date("2026-08-19T00:00:00.000Z"),
        endDate: new Date("2026-08-20T00:00:00.000Z"),
        active: true,
      },
    });

    // Block ends the 20th, stay starts the 20th — the same half-open rule as bookings.
    const result = await ask();
    expect(result.remaining).toBe(3);
  });

  it("removes a room for every future date when the block has no end", async () => {
    await prisma.unitBlock.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.units[0].id,
        reason: "LONG_TERM_MAINTENANCE",
        startDate: new Date("2026-08-19T00:00:00.000Z"),
        endDate: null,
        active: true,
      },
    });

    // An open block is a decision to withhold the room until someone lifts it — not
    // until a date nobody committed to.
    for (const range of [[AUG_20, AUG_22], [SEP_10, SEP_12], ["2027-01-01", "2027-01-03"]]) {
      const result = await ask({ checkInDate: range[0], checkOutDate: range[1] });
      expect(result.sellableUnits).toBe(2);
    }
  });

  it("ignores a block that has been lifted", async () => {
    await prisma.unitBlock.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.units[0].id,
        reason: "OTHER",
        startDate: new Date("2026-08-19T00:00:00.000Z"),
        endDate: null,
        active: false,
        endedAt: new Date(),
      },
    });

    expect((await ask()).sellableUnits).toBe(3);
  });
});

describe("maintenance and housekeeping", () => {
  it("removes a room that is out of service", async () => {
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { maintenanceStatus: "OUT_OF_SERVICE" },
    });

    const result = await ask();
    expect(result.sellableUnits).toBe(2);
    expect(result.units.find((u) => u.id === ctx.units[0].id)?.reason).toBe("MAINTENANCE");
  });

  it("keeps a room out of service unavailable for far-future dates too", async () => {
    // No repair completion date exists, so the conservative reading is the only
    // honest one: unavailable until someone marks it fixed.
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { maintenanceStatus: "UNDER_MAINTENANCE" },
    });

    expect((await ask({ checkInDate: "2027-06-01", checkOutDate: "2027-06-03" })).sellableUnits).toBe(2);
  });

  it("keeps a dirty room sellable", async () => {
    /*
     * Housekeeping is readiness, not ownership. A room needing a clean has hours to
     * get one before the next guest arrives; treating it as unavailable would stop a
     * hotel selling the room a departing guest is about to vacate.
     */
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { housekeepingStatus: "DIRTY" },
    });

    const result = await ask();
    expect(result.remaining).toBe(3);

    const dirty = result.units.find((u) => u.id === ctx.units[0].id)!;
    expect(dirty.available).toBe(true);
    // Flagged, so the arrivals desk knows it needs preparing — not withheld.
    expect(dirty.needsPreparation).toBe(true);
  });

  it("keeps a room being cleaned right now sellable", async () => {
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { housekeepingStatus: "CLEANING" },
    });

    const result = await ask();
    expect(result.remaining).toBe(3);
    expect(result.units.find((u) => u.id === ctx.units[0].id)?.needsPreparation).toBe(true);
  });
});
