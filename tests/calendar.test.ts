import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { businessDate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import type { Permission } from "@/lib/permissions";
import {
  ALLOWED_DAYS,
  DEFAULT_DAYS,
  barGeometry,
  getReservationCalendar,
} from "@/server/services/calendar.service";
import { createReservation } from "@/server/services/reservation.service";

import { TEST_ACTOR, resetDatabase, seedGuest, seedInventory, setVatRate } from "./helpers";

/**
 * Phase 8 — the reservation calendar.
 *
 * The calendar is a view of the Stage 7 engine, so what is tested here is whether the
 * view tells the truth: that a bar covers exactly the nights the booking holds, that a
 * cancelled booking never paints a room as sold, that a confirmed booking without a
 * room does not vanish, and that none of it costs a query per room.
 */

const d = (iso: string) => businessDate(iso);

const perms = (...list: Permission[]) => new Set<Permission>(list);
const FULL = perms("reservations.view", "payments.view");
const NO_MONEY = perms("reservations.view");

// ---------------------------------------------------------------------------

describe("bar geometry", () => {
  const WINDOW = d("2026-08-20");

  it("gives a one-night stay exactly one column", () => {
    // 20 → 21 holds the night of the 20th and nothing else.
    expect(barGeometry(d("2026-08-20"), d("2026-08-21"), WINDOW, 14)).toEqual({
      startIndex: 0,
      span: 1,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it("gives a two-night stay exactly two columns", () => {
    expect(barGeometry(d("2026-08-20"), d("2026-08-22"), WINDOW, 14)).toMatchObject({
      startIndex: 0,
      span: 2,
    });
  });

  it("places a stay that starts later at the right column", () => {
    expect(barGeometry(d("2026-08-23"), d("2026-08-26"), WINDOW, 14)).toMatchObject({
      startIndex: 3,
      span: 3,
    });
  });

  it("clips a stay that began before the window", () => {
    // 18 → 22 against a window opening on the 20th: two visible nights, marked as
    // continuing off the left edge.
    expect(barGeometry(d("2026-08-18"), d("2026-08-22"), WINDOW, 5)).toEqual({
      startIndex: 0,
      span: 2,
      clippedStart: true,
      clippedEnd: false,
    });
  });

  it("clips a stay that runs past the window", () => {
    expect(barGeometry(d("2026-08-23"), d("2026-08-30"), WINDOW, 5)).toEqual({
      startIndex: 3,
      span: 2,
      clippedStart: false,
      clippedEnd: true,
    });
  });

  it("clips a stay that spans the whole window on both sides", () => {
    expect(barGeometry(d("2026-08-01"), d("2026-09-30"), WINDOW, 5)).toEqual({
      startIndex: 0,
      span: 5,
      clippedStart: true,
      clippedEnd: true,
    });
  });

  it("excludes a stay that checks out on the morning the window opens", () => {
    // Checkout is exclusive: the room was free that day, so nothing is drawn.
    expect(barGeometry(d("2026-08-15"), d("2026-08-20"), WINDOW, 5)).toBeNull();
  });

  it("excludes a stay that checks in on the day after the window closes", () => {
    expect(barGeometry(d("2026-08-25"), d("2026-08-28"), WINDOW, 5)).toBeNull();
  });

  it("makes adjacent stays touch without overlapping", () => {
    // A: 20 → 22, B: 22 → 24. The room is sold on the 22nd to B, not to both.
    const a = barGeometry(d("2026-08-20"), d("2026-08-22"), WINDOW, 14)!;
    const b = barGeometry(d("2026-08-22"), d("2026-08-24"), WINDOW, 14)!;

    expect(a.startIndex + a.span).toBe(b.startIndex);
    expect(b.startIndex).toBe(2);
  });

  it("runs an open-ended interval to the end of the window without marking it clipped", () => {
    // A block with no end date is withheld until someone lifts it, not until a date.
    expect(barGeometry(d("2026-08-22"), null, WINDOW, 7)).toEqual({
      startIndex: 2,
      span: 5,
      clippedStart: false,
      clippedEnd: false,
    });
  });
});

// ---------------------------------------------------------------------------

let ctx: Awaited<ReturnType<typeof seedInventory>>;
let guest: Awaited<ReturnType<typeof seedGuest>>;
let today: string;

/** The demo's fixed operating date, which the calendar reads from settings. */
const BUSINESS_DATE = "2026-08-20";

async function book(overrides: Record<string, unknown> = {}) {
  return createReservation(
    {
      propertyId: ctx.property.id,
      guestId: guest.id,
      unitId: ctx.units[0].id,
      unitTypeId: ctx.unitType.id,
      checkInDate: BUSINESS_DATE,
      checkOutDate: "2026-08-22",
      adults: 2,
      nightlyRate: "400.00",
      status: "CONFIRMED",
      ...overrides,
    } as never,
    TEST_ACTOR,
  );
}

const calendar = (filters: Record<string, unknown> = {}, permissions = FULL) =>
  getReservationCalendar([ctx.property.id], { from: BUSINESS_DATE, days: 7, ...filters }, permissions);

afterAll(resetDatabase);

beforeEach(async () => {
  await resetDatabase();
  ctx = await seedInventory({ units: 3 });
  guest = await seedGuest();
  await setVatRate(ctx.property.id, "15");

  // Publish the operating date the same way the demo seed does.
  await prisma.systemSetting.create({
    data: { propertyId: ctx.property.id, key: "demo.businessDate", value: BUSINESS_DATE },
  });
  today = BUSINESS_DATE;
});

describe("the window", () => {
  it("uses the property's operating date, not the wall clock", async () => {
    const snapshot = await calendar();

    expect(snapshot.businessDate).toBe(BUSINESS_DATE);
    expect(snapshot.columns.find((column) => column.isBusinessDate)?.iso).toBe(BUSINESS_DATE);
  });

  it("renders exactly the requested number of columns", async () => {
    for (const days of ALLOWED_DAYS) {
      const snapshot = await getReservationCalendar(
        [ctx.property.id],
        { from: BUSINESS_DATE, days },
        FULL,
      );
      expect(snapshot.columns).toHaveLength(days);
      expect(snapshot.days).toBe(days);
    }
  });

  it("clamps an unsupported range rather than obeying it", async () => {
    // days=5000 is a mistake or a probe; both get a working window.
    const snapshot = await getReservationCalendar(
      [ctx.property.id],
      { from: BUSINESS_DATE, days: 5000 },
      FULL,
    );
    expect(snapshot.days).toBe(DEFAULT_DAYS);
    expect(snapshot.columns).toHaveLength(DEFAULT_DAYS);
  });

  it("rejects an unparseable start date", async () => {
    await expect(
      getReservationCalendar([ctx.property.id], { from: "not-a-date", days: 7 }, FULL),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("marks the Saudi weekend", async () => {
    const snapshot = await getReservationCalendar(
      [ctx.property.id],
      { from: "2026-08-20", days: 7 },
      FULL,
    );
    const weekend = snapshot.columns.filter((column) => column.isWeekend).map((c) => c.iso);
    // 21 August 2026 is a Friday; 22 is a Saturday.
    expect(weekend).toContain("2026-08-21");
    expect(weekend).toContain("2026-08-22");
  });
});

describe("which bookings appear", () => {
  it("draws a confirmed booking as committed inventory", async () => {
    const reservation = await book();
    const snapshot = await calendar();

    const row = snapshot.rows.find((r) => r.unitId === ctx.units[0].id)!;
    expect(row.bars).toHaveLength(1);
    expect(row.bars[0].id).toBe(reservation.id);
    expect(row.bars[0].kind).toBe("committed");
    expect(row.bars[0].geometry).toMatchObject({ startIndex: 0, span: 2 });
  });

  it("draws a guest in the room as committed too", async () => {
    const reservation = await book();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CHECKED_IN" },
    });

    const snapshot = await calendar();
    expect(snapshot.rows[0].bars[0].kind).toBe("committed");
  });

  it("never paints a cancelled booking across a room", async () => {
    // The most expensive thing this screen could get wrong: showing a room as sold
    // when it is on sale.
    const reservation = await book();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CANCELLED" },
    });

    const snapshot = await calendar();
    expect(snapshot.rows.flatMap((row) => row.bars)).toHaveLength(0);
  });

  it("never paints a no-show across a room", async () => {
    const reservation = await book();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "NO_SHOW" },
    });

    expect((await calendar()).rows.flatMap((row) => row.bars)).toHaveLength(0);
  });

  it("hides a pending enquiry unless it is asked for", async () => {
    await book({ status: "PENDING" });

    expect((await calendar()).rows.flatMap((row) => row.bars)).toHaveLength(0);

    const withTentative = await calendar({ includeTentative: true });
    const bars = withTentative.rows.flatMap((row) => row.bars);
    expect(bars).toHaveLength(1);
    // Drawn, but never as a room commitment.
    expect(bars[0].kind).toBe("tentative");
  });

  it("shows a completed stay over the nights it actually occupied", async () => {
    const reservation = await book();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CHECKED_OUT" },
    });

    const bars = (await calendar()).rows.flatMap((row) => row.bars);
    expect(bars).toHaveLength(1);
    expect(bars[0].kind).toBe("historical");
  });
});

describe("query intersection", () => {
  it("excludes a booking that ends exactly when the window starts", async () => {
    await book({ checkInDate: "2026-08-17", checkOutDate: BUSINESS_DATE });
    expect((await calendar()).rows.flatMap((row) => row.bars)).toHaveLength(0);
  });

  it("excludes a booking that starts exactly when the window ends", async () => {
    // A 7-day window from the 20th covers up to and including the 26th.
    await book({ checkInDate: "2026-08-27", checkOutDate: "2026-08-29" });
    expect((await calendar()).rows.flatMap((row) => row.bars)).toHaveLength(0);
  });

  it("includes a booking that merely overlaps the edge", async () => {
    await book({ checkInDate: "2026-08-18", checkOutDate: "2026-08-21" });
    const bars = (await calendar()).rows.flatMap((row) => row.bars);
    expect(bars).toHaveLength(1);
    expect(bars[0].geometry.clippedStart).toBe(true);
  });

  it("includes a booking that contains the whole window", async () => {
    await book({ checkInDate: "2026-07-01", checkOutDate: "2026-10-01" });
    const bars = (await calendar()).rows.flatMap((row) => row.bars);
    expect(bars[0].geometry).toMatchObject({ startIndex: 0, span: 7, clippedStart: true, clippedEnd: true });
  });
});

describe("bookings with no room yet", () => {
  it("keeps a confirmed booking without a room visible", async () => {
    // These have no row to sit on, so a calendar built only from unit rows drops
    // them silently — and the desk never learns a guest is arriving.
    const reservation = await book({ unitId: undefined });
    const snapshot = await calendar();

    expect(snapshot.rows.flatMap((row) => row.bars)).toHaveLength(0);
    expect(snapshot.unassigned).toHaveLength(1);
    expect(snapshot.unassigned[0].id).toBe(reservation.id);
    expect(snapshot.unassigned[0].unitTypeName).toBe(ctx.unitType.name);
    expect(snapshot.unassigned[0].nights).toBe(2);
  });

  it("marks one arriving today as the action item it is", async () => {
    await book({ unitId: undefined, checkInDate: BUSINESS_DATE, checkOutDate: "2026-08-22" });
    await book({ unitId: undefined, checkInDate: "2026-08-24", checkOutDate: "2026-08-26" });

    const snapshot = await calendar();
    expect(snapshot.unassigned.filter((row) => row.arrivesToday)).toHaveLength(1);
    expect(snapshot.agenda.summary.unassignedArrivals).toBe(1);
  });

  it("leaves a pending booking without a room out of the section", async () => {
    // It holds no inventory, so it is not an unassigned commitment.
    await book({ unitId: undefined, status: "PENDING" });
    expect((await calendar()).unassigned).toHaveLength(0);
  });

  it("drops one that no longer holds inventory", async () => {
    const reservation = await book({ unitId: undefined });
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CANCELLED" },
    });
    expect((await calendar()).unassigned).toHaveLength(0);
  });
});

describe("blocks", () => {
  const block = (data: Record<string, unknown>) =>
    prisma.unitBlock.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.units[0].id,
        reason: "RENOVATION",
        active: true,
        startDate: d("2026-08-21"),
        endDate: d("2026-08-23"),
        ...data,
      } as never,
    });

  it("draws a finite block over exactly its dates", async () => {
    await block({});
    const row = (await calendar()).rows.find((r) => r.unitId === ctx.units[0].id)!;

    expect(row.blocks).toHaveLength(1);
    expect(row.blocks[0].geometry).toMatchObject({ startIndex: 1, span: 2 });
    expect(row.blocks[0].reason).toBe("RENOVATION");
  });

  it("runs an open-ended block to the end of the window", async () => {
    await block({ endDate: null, reason: "LONG_TERM_MAINTENANCE" });
    const row = (await calendar()).rows.find((r) => r.unitId === ctx.units[0].id)!;

    expect(row.blocks[0].geometry).toMatchObject({ startIndex: 1, span: 6 });
    expect(row.blocks[0].endDate).toBeNull();
  });

  it("ignores a block that finished before the window opened", async () => {
    await block({ startDate: d("2026-08-10"), endDate: d("2026-08-15") });
    expect((await calendar()).rows.flatMap((row) => row.blocks)).toHaveLength(0);
  });

  it("clips a block that started before the window", async () => {
    await block({ startDate: d("2026-08-15"), endDate: d("2026-08-22") });
    const row = (await calendar()).rows.find((r) => r.unitId === ctx.units[0].id)!;

    expect(row.blocks[0].geometry).toMatchObject({ startIndex: 0, span: 2, clippedStart: true });
  });

  it("ignores a block that has been lifted", async () => {
    await block({ active: false, endedAt: new Date() });
    expect((await calendar()).rows.flatMap((row) => row.blocks)).toHaveLength(0);
  });
});

describe("maintenance and readiness", () => {
  it("marks a room out of service without inventing dates for it", async () => {
    /*
     * Maintenance carries no reliable end date, so the calendar states the room's
     * present condition and says nothing about which historical nights it covered —
     * the data cannot establish that, and drawing a bar would be fiction.
     */
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { maintenanceStatus: "OUT_OF_SERVICE" },
    });

    const row = (await calendar()).rows.find((r) => r.unitId === ctx.units[0].id)!;
    expect(row.outOfService).toBe(true);
    expect(row.blocks).toHaveLength(0);
  });

  it("flags a dirty room as needing preparation without taking it off the calendar", async () => {
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { housekeepingStatus: "DIRTY" },
    });
    await book({ checkInDate: "2026-08-24", checkOutDate: "2026-08-26" });

    const snapshot = await calendar();
    const row = snapshot.rows.find((r) => r.unitId === ctx.units[0].id)!;

    // Readiness today; the future booking is untouched by it.
    expect(row.needsPreparationToday).toBe(true);
    expect(row.outOfService).toBe(false);
    expect(row.bars).toHaveLength(1);
  });
});

describe("the day summary", () => {
  it("counts what is actually happening, from the rows already fetched", async () => {
    // In house over today.
    const staying = await book({ unitId: ctx.units[0].id, checkInDate: "2026-08-19", checkOutDate: "2026-08-23" });
    await prisma.reservation.update({ where: { id: staying.id }, data: { status: "CHECKED_IN" } });
    // Arriving today.
    await book({ unitId: ctx.units[1].id, checkInDate: BUSINESS_DATE, checkOutDate: "2026-08-22" });
    // Departing today.
    await book({ unitId: ctx.units[2].id, checkInDate: "2026-08-18", checkOutDate: BUSINESS_DATE });

    const { agenda } = await calendar();
    const { summary } = agenda;

    expect(summary.date).toBe(today);
    expect(summary.units).toBe(3);
    expect(summary.soldOnDate).toBe(2);
    expect(summary.allArrivals).toBe(1);
    expect(summary.allDepartures).toBe(1);
    // Unit 3's guest left this morning, so the room is back on sale.
    expect(summary.sellableOnDate).toBe(1);
  });

  it("never counts a room twice when it is both blocked and out of service", async () => {
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { maintenanceStatus: "OUT_OF_SERVICE" },
    });
    await prisma.unitBlock.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.units[0].id,
        reason: "RENOVATION",
        startDate: d("2026-08-19"),
        endDate: null,
        active: true,
      },
    });

    const { agenda } = await calendar();
    const { summary } = agenda;
    // Three rooms, one unsellable for two reasons, two genuinely free.
    expect(summary.sellableOnDate).toBe(2);
    expect(summary.blocked).toBe(1);
    expect(summary.maintenance).toBe(1);
  });
});

describe("filters", () => {
  it("filters to a floor, and to that floor's bookings", async () => {
    await prisma.unit.update({ where: { id: ctx.units[0].id }, data: { floor: 2 } });
    await book({ unitId: ctx.units[0].id });
    await book({ unitId: ctx.units[1].id });

    const snapshot = await calendar({ floor: 2 });
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].unitId).toBe(ctx.units[0].id);
    // A booking on another floor must not leak in as a stray bar.
    expect(snapshot.rows.flatMap((row) => row.bars)).toHaveLength(1);
  });

  it("filters to a unit type", async () => {
    const suite = await prisma.unitType.create({
      data: { propertyId: ctx.property.id, name: "جناح", capacity: 4, baseRate: "900.00" },
    });
    await prisma.unit.create({
      data: { propertyId: ctx.property.id, unitTypeId: suite.id, unitNumber: "S1" },
    });

    const snapshot = await calendar({ unitTypeId: suite.id });
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].unitNumber).toBe("S1");
  });

  it("offers the floors and types actually present", async () => {
    await prisma.unit.update({ where: { id: ctx.units[0].id }, data: { floor: 3 } });
    const snapshot = await calendar();

    expect(snapshot.floors).toContain(3);
    expect(snapshot.unitTypes.map((type) => type.id)).toContain(ctx.unitType.id);
  });
});

describe("property scope", () => {
  let other: Awaited<ReturnType<typeof seedInventory>>;

  beforeEach(async () => {
    other = await seedInventory({ units: 3, name: "منشأة باء", unitPrefix: "B" });
    await setVatRate(other.property.id, "15");

    const otherGuest = await seedGuest({ fullName: "نزيل باء", mobile: "0567778888" });
    await createReservation(
      {
        propertyId: other.property.id,
        guestId: otherGuest.id,
        unitId: other.units[0].id,
        unitTypeId: other.unitType.id,
        checkInDate: BUSINESS_DATE,
        checkOutDate: "2026-08-22",
        adults: 1,
        nightlyRate: "700.00",
        status: "CONFIRMED",
      } as never,
      TEST_ACTOR,
    );
    await prisma.unitBlock.create({
      data: {
        propertyId: other.property.id,
        unitId: other.units[1].id,
        reason: "RENOVATION",
        startDate: d("2026-08-20"),
        endDate: null,
        active: true,
      },
    });
  });

  it("shows only the caller's own rooms, bookings and blocks", async () => {
    const snapshot = await calendar();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.rows).toHaveLength(3);
    expect(snapshot.rows.every((row) => row.unitNumber.startsWith("R"))).toBe(true);
    expect(serialized).not.toContain("B101");
    expect(serialized).not.toContain("نزيل باء");
    expect(serialized).not.toContain("منشأة باء");
  });

  it("ignores another property's unit type supplied in the query", async () => {
    // An id from a URL is a claim, not a grant.
    const snapshot = await calendar({ unitTypeId: other.unitType.id });
    expect(snapshot.rows).toHaveLength(0);
    expect(JSON.stringify(snapshot)).not.toContain("B101");
  });

  it("does not leak another property's unassigned bookings", async () => {
    const otherGuest = await seedGuest({ fullName: "بلا وحدة في باء", mobile: "0569990000" });
    await createReservation(
      {
        propertyId: other.property.id,
        guestId: otherGuest.id,
        unitTypeId: other.unitType.id,
        checkInDate: BUSINESS_DATE,
        checkOutDate: "2026-08-22",
        adults: 1,
        nightlyRate: "700.00",
        status: "CONFIRMED",
      } as never,
      TEST_ACTOR,
    );

    const snapshot = await calendar();
    expect(snapshot.unassigned).toHaveLength(0);
    expect(JSON.stringify(snapshot)).not.toContain("بلا وحدة في باء");
  });
});

describe("payload security", () => {
  it("omits payment state for a caller without payments.view", async () => {
    await book();
    await book({ unitId: undefined });

    const snapshot = await calendar({}, NO_MONEY);

    for (const bar of snapshot.rows.flatMap((row) => row.bars)) {
      expect(bar).not.toHaveProperty("paymentStatus");
    }
    for (const row of snapshot.unassigned) {
      expect(row).not.toHaveProperty("paymentStatus");
    }
    expect(JSON.stringify(snapshot)).not.toContain("paymentStatus");
  });

  it("includes it for a caller who may see money", async () => {
    await book();
    const snapshot = await calendar({}, FULL);
    expect(snapshot.rows.flatMap((row) => row.bars)[0].paymentStatus).toBe("UNPAID");
  });

  it("never carries a rate or a total onto the board", async () => {
    // A calendar is an operational board. Amounts on every bar would be noise, and
    // shipping them anyway would put the folio in a payload that does not need it.
    await book();
    const serialized = JSON.stringify(await calendar({}, FULL));

    expect(serialized).not.toContain("nightlyRate");
    expect(serialized).not.toContain('"total"');
    expect(serialized).not.toContain("400.00");
  });
});

describe("query design", () => {
  it("costs the same number of queries whatever the room count", async () => {
    /*
     * The claim that matters at 500 rooms: the statement count is a property of the
     * window, not of the hotel. A per-room implementation would issue three queries
     * per row and this difference would be in the hundreds.
     */
    const count = async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ Value: string }>>(
        "SHOW GLOBAL STATUS LIKE 'Questions'",
      );
      return Number(rows[0].Value);
    };
    const measure = async () => {
      const before = await count();
      await calendar();
      return (await count()) - before;
    };

    await measure();
    const withThree = await measure();

    // Grow the hotel more than tenfold, then measure again.
    for (let index = 0; index < 37; index++) {
      await prisma.unit.create({
        data: {
          propertyId: ctx.property.id,
          unitTypeId: ctx.unitType.id,
          unitNumber: `R${200 + index}`,
          floor: 2,
        },
      });
    }
    const withForty = await measure();

    expect(withForty).toBeLessThanOrEqual(withThree + 2);
    // Eight logical statements — six for the window, two for the day agenda — plus
    // the counter's own reads and a little pool housekeeping. The number that matters
    // is that it does not move when the hotel grows from three rooms to forty.
    expect(withForty).toBeLessThanOrEqual(20);
  });
});
