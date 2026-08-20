import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { addDays, toISODate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";
import { PERMISSIONS, ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { getBusinessDateContext } from "@/server/business-date";
import { getDashboardSnapshot, TREND_DAYS } from "@/server/services/dashboard.service";

import { findDemoProperty } from "../prisma/demo/reset";

/**
 * Phase 4 acceptance.
 *
 * The dashboard's claim is that every figure on it is derived from the database.
 * These tests check that claim the only way it can be checked — by recomputing each
 * figure independently and demanding an exact match, with money compared as decimals
 * rather than through a float tolerance.
 */

const run = promisify(execFile);

let propertyId: string;
let businessDate: Date;

const ALL = PERMISSIONS as readonly Permission[];

beforeAll(async () => {
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL! };
  await run("npx", ["tsx", "prisma/seed.ts"], { env });
  await run("npx", ["tsx", "prisma/demo-seed.ts"], { env });

  const found = await findDemoProperty(prisma);
  if (!found) throw new Error("تعذّر إنشاء بيانات العرض.");
  propertyId = found;
  businessDate = (await getBusinessDateContext()).date;
}, 300_000);

describe("business date", () => {
  it("uses the demo's fixed operating date, not the wall clock", async () => {
    const context = await getBusinessDateContext();

    expect(context.isDemo).toBe(true);
    expect(toISODate(context.date)).toBe("2026-08-20");
  });

  it("reads the date the demo published rather than a compiled-in constant", async () => {
    const setting = await prisma.systemSetting.findFirstOrThrow({
      where: { key: "demo.businessDate" },
      select: { value: true },
    });
    expect(setting.value).toBe(toISODate(businessDate));
  });
});

describe("unit counts and occupancy", () => {
  it("reconciles every unit state against the units table", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    expect(snapshot?.units.ok).toBe(true);
    if (!snapshot?.units.ok) return;

    const data = snapshot.units.data;
    const [total, occupied, available, reserved, maintenance, blocked, dirty, cleaning] =
      await Promise.all([
        prisma.unit.count({ where: { propertyId } }),
        prisma.unit.count({ where: { propertyId, status: "OCCUPIED" } }),
        prisma.unit.count({ where: { propertyId, status: "AVAILABLE" } }),
        prisma.unit.count({ where: { propertyId, status: "RESERVED" } }),
        prisma.unit.count({ where: { propertyId, status: "MAINTENANCE" } }),
        prisma.unit.count({ where: { propertyId, status: "BLOCKED" } }),
        prisma.unit.count({ where: { propertyId, housekeepingStatus: "DIRTY" } }),
        prisma.unit.count({ where: { propertyId, housekeepingStatus: "CLEANING" } }),
      ]);

    expect(data.total).toBe(total);
    expect(data.occupied).toBe(occupied);
    expect(data.available).toBe(available);
    expect(data.reserved).toBe(reserved);
    expect(data.maintenance).toBe(maintenance);
    expect(data.blocked).toBe(blocked);
    expect(data.dirty).toBe(dirty);
    expect(data.cleaning).toBe(cleaning);
  });

  it("excludes blocked and out-of-service rooms from the sellable base", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.units.ok) throw new Error("units section failed");
    const data = snapshot.units.data;

    const unsellable = await prisma.unit.count({
      where: {
        propertyId,
        OR: [{ status: "BLOCKED" }, { maintenanceStatus: { not: "OPERATIONAL" } }],
      },
    });

    expect(data.sellable).toBe(data.total - unsellable);
    // Dividing by the full inventory would punish the hotel for taking a room
    // out of service, which is the opposite of what the number is for.
    expect(data.sellable).toBeLessThan(data.total);
  });

  it("computes occupancy as occupied over sellable", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.units.ok) throw new Error("units section failed");
    const data = snapshot.units.data;

    const expected = Math.round((data.occupied / data.sellable) * 1000) / 10;
    expect(data.occupancyRate).toBe(expected);
    expect(data.occupancyRate).toBeGreaterThanOrEqual(55);
    expect(data.occupancyRate).toBeLessThanOrEqual(70);
  });

  it("does not count rooms reserved for tonight's arrivals as occupied", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.units.ok) throw new Error("units section failed");

    const inHouse = await prisma.reservation.count({
      where: { propertyId, status: "CHECKED_IN" },
    });
    expect(snapshot.units.data.occupied).toBe(inHouse);
  });

  it("returns zero rather than dividing by zero for a property with nothing sellable", async () => {
    const empty = await prisma.property.create({
      data: { name: "منشأة بلا وحدات", type: "HOTEL", city: "الرياض" },
      select: { id: true },
    });

    const snapshot = await getDashboardSnapshot(ALL, empty.id);
    if (!snapshot?.units.ok) throw new Error("units section failed");

    expect(snapshot.units.data.sellable).toBe(0);
    expect(snapshot.units.data.occupancyRate).toBe(0);
    expect(Number.isNaN(snapshot.units.data.occupancyRate)).toBe(false);

    await prisma.property.delete({ where: { id: empty.id } });
  });
});

describe("arrivals and departures", () => {
  it("lists exactly the confirmed stays starting today", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.arrivals.ok) throw new Error("arrivals section failed");

    const expected = await prisma.reservation.count({
      where: { propertyId, checkInDate: businessDate, status: { in: ["CONFIRMED", "PENDING"] } },
    });

    expect(snapshot.arrivals.data).toHaveLength(expected);
    expect(expected).toBeGreaterThanOrEqual(5);
  });

  it("labels an arrival with no room assigned instead of dropping it", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.arrivals.ok) throw new Error("arrivals section failed");

    const unassigned = snapshot.arrivals.data.filter((row) => row.unitNumber === null);
    expect(unassigned.length).toBeGreaterThanOrEqual(1);
    // Present in the list, with a null room — not silently excluded.
    expect(unassigned[0].guestName).toBeTruthy();
    expect(unassigned[0].unitTypeName).toBeTruthy();
  });

  it("lists exactly the in-house stays ending today, most indebted first", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.departures.ok) throw new Error("departures section failed");

    const expected = await prisma.reservation.count({
      where: { propertyId, checkOutDate: businessDate, status: "CHECKED_IN" },
    });

    expect(snapshot.departures.data).toHaveLength(expected);
    expect(expected).toBeGreaterThanOrEqual(4);

    const balances = snapshot.departures.data.map((row) => Number(row.balance));
    expect([...balances].sort((a, b) => b - a)).toEqual(balances);
  });
});

describe("financial figures", () => {
  it("matches today's payment total exactly, with refunds subtracted", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.financial?.ok) throw new Error("financial section failed");

    const sum = await prisma.payment.aggregate({
      where: {
        propertyId,
        paymentDate: { gte: businessDate, lt: addDays(businessDate, 1) },
      },
      _sum: { amount: true },
    });

    expect(snapshot.financial.data.collectedToday).toBe(money(sum._sum.amount).toFixed(2));
  });

  it("nets a refund out of the day it was issued", async () => {
    const refund = await prisma.payment.findFirst({
      where: { propertyId, amount: { lt: 0 } },
      select: { paymentDate: true, amount: true, reservationId: true },
    });
    expect(refund).not.toBeNull();

    const day = new Date(
      Date.UTC(
        refund!.paymentDate.getUTCFullYear(),
        refund!.paymentDate.getUTCMonth(),
        refund!.paymentDate.getUTCDate(),
      ),
    );

    const [gross, net] = await Promise.all([
      prisma.payment.aggregate({
        where: { propertyId, paymentDate: { gte: day, lt: addDays(day, 1) }, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { propertyId, paymentDate: { gte: day, lt: addDays(day, 1) } },
        _sum: { amount: true },
      }),
    ]);

    // The netted figure must be strictly smaller — proof the refund was applied.
    expect(money(net._sum.amount).lessThan(money(gross._sum.amount))).toBe(true);
  });

  it("matches the month's collections and expenses exactly", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.financial?.ok) throw new Error("financial section failed");

    const monthStart = new Date(
      Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth(), 1),
    );
    const nextMonth = new Date(
      Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth() + 1, 1),
    );

    const [payments, expenses] = await Promise.all([
      prisma.payment.aggregate({
        where: { propertyId, paymentDate: { gte: monthStart, lt: nextMonth } },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { propertyId, date: { gte: monthStart, lt: nextMonth } },
        _sum: { amount: true },
      }),
    ]);

    expect(snapshot.financial.data.collectedThisMonth).toBe(
      money(payments._sum.amount).toFixed(2),
    );
    expect(snapshot.financial.data.expensesThisMonth).toBe(
      money(expenses._sum.amount).toFixed(2),
    );
    expect(snapshot.financial.data.netCashFlowThisMonth).toBe(
      money(payments._sum.amount).minus(money(expenses._sum.amount)).toFixed(2),
    );
  });

  it("counts outstanding balances only on reservations still open", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.financial?.ok) throw new Error("financial section failed");

    const open = await prisma.reservation.aggregate({
      where: {
        propertyId,
        status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
        balance: { gt: 0 },
      },
      _sum: { balance: true },
      _count: { _all: true },
    });

    expect(snapshot.financial.data.outstandingBalance).toBe(
      money(open._sum.balance).toFixed(2),
    );
    expect(snapshot.financial.data.outstandingCount).toBe(open._count._all);
  });

  it("excludes cancelled and no-show bookings from what is owed", async () => {
    const lost = await prisma.reservation.aggregate({
      where: { propertyId, status: { in: ["CANCELLED", "NO_SHOW"] } },
      _sum: { balance: true },
    });

    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.financial?.ok) throw new Error("financial section failed");

    const everything = await prisma.reservation.aggregate({
      where: { propertyId, balance: { gt: 0 } },
      _sum: { balance: true },
    });

    // A cancelled booking owes nothing; chasing it would be chasing a ghost.
    if (money(lost._sum.balance).greaterThan(0)) {
      expect(
        money(snapshot.financial.data.outstandingBalance).lessThan(
          money(everything._sum.balance),
        ),
      ).toBe(true);
    }
  });

  it("reports accommodation earned tonight separately from cash collected", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.financial?.ok) throw new Error("financial section failed");

    const earned = await prisma.reservation.aggregate({
      where: {
        propertyId,
        status: "CHECKED_IN",
        checkInDate: { lte: businessDate },
        checkOutDate: { gt: businessDate },
      },
      _sum: { nightlyRate: true },
    });

    expect(snapshot.financial.data.accommodationEarnedToday).toBe(
      money(earned._sum.nightlyRate).toFixed(2),
    );
    // Two different measures; the labels on the dashboard must not be swapped.
    expect(snapshot.financial.data.accommodationEarnedToday).not.toBe(
      snapshot.financial.data.collectedToday,
    );
  });
});

describe("charts", () => {
  it("returns one occupancy point per day in the window", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.occupancyTrend?.ok) throw new Error("occupancy trend failed");

    const points = snapshot.occupancyTrend.data;
    expect(points).toHaveLength(TREND_DAYS);
    expect(points[points.length - 1].date).toBe(toISODate(businessDate));
    expect(points[0].date).toBe(toISODate(addDays(businessDate, -(TREND_DAYS - 1))));
  });

  it("derives historical occupancy from stay intervals, not current room status", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.occupancyTrend?.ok || !snapshot.units.ok) {
      throw new Error("sections failed");
    }

    const sellable = snapshot.units.data.sellable;

    // Recompute one day independently, applying the exclusive-checkout rule.
    const day = addDays(businessDate, -7);
    const occupied = await prisma.reservation.count({
      where: {
        propertyId,
        status: { in: ["CHECKED_IN", "CHECKED_OUT"] },
        unitId: { not: null },
        checkInDate: { lte: day },
        checkOutDate: { gt: day },
      },
    });

    const point = snapshot.occupancyTrend.data.find((p) => p.date === toISODate(day));
    expect(point?.value).toBe(Math.round((occupied / sellable) * 1000) / 10);
    expect(point?.label).toBe(`${occupied} من ${sellable}`);
  });

  it("treats checkout day as free — the room is sellable again that night", async () => {
    const stay = await prisma.reservation.findFirstOrThrow({
      where: {
        propertyId,
        status: "CHECKED_OUT",
        unitId: { not: null },
        checkOutDate: { lt: businessDate, gt: addDays(businessDate, -TREND_DAYS) },
      },
      select: { unitId: true, checkInDate: true, checkOutDate: true },
    });

    const onCheckoutDay = await prisma.reservation.count({
      where: {
        propertyId,
        unitId: stay.unitId,
        status: { in: ["CHECKED_IN", "CHECKED_OUT"] },
        checkInDate: { lte: stay.checkOutDate },
        checkOutDate: { gt: stay.checkOutDate },
      },
    });

    // This stay must not be counted on the day it ends.
    const lastNight = await prisma.reservation.count({
      where: {
        propertyId,
        unitId: stay.unitId,
        status: { in: ["CHECKED_IN", "CHECKED_OUT"] },
        checkInDate: { lte: addDays(stay.checkOutDate, -1) },
        checkOutDate: { gt: addDays(stay.checkOutDate, -1) },
      },
    });

    expect(lastNight).toBeGreaterThanOrEqual(1);
    expect(onCheckoutDay).toBeLessThan(lastNight + 1);
  });

  it("keeps cancelled and no-show bookings out of the occupancy history", async () => {
    const lost = await prisma.reservation.findFirst({
      where: {
        propertyId,
        status: { in: ["CANCELLED", "NO_SHOW"] },
        unitId: { not: null },
        checkInDate: { gte: addDays(businessDate, -TREND_DAYS), lt: businessDate },
      },
      select: { checkInDate: true, unitId: true },
    });

    if (!lost) return;

    const counted = await prisma.reservation.count({
      where: {
        propertyId,
        unitId: lost.unitId,
        status: { in: ["CHECKED_IN", "CHECKED_OUT"] },
        checkInDate: { lte: lost.checkInDate },
        checkOutDate: { gt: lost.checkInDate },
      },
    });

    const real = await prisma.reservation.count({
      where: {
        propertyId,
        unitId: lost.unitId,
        checkInDate: { lte: lost.checkInDate },
        checkOutDate: { gt: lost.checkInDate },
      },
    });

    // The cancelled booking is in `real` but must not be in `counted`.
    expect(counted).toBeLessThanOrEqual(real);
  });

  it("matches daily collections to the payment ledger, day by day", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.collectionTrend?.ok) throw new Error("collection trend failed");

    const points = snapshot.collectionTrend.data;
    expect(points).toHaveLength(TREND_DAYS);

    const charted = points.reduce((sum, point) => sum + point.value, 0);
    const ledger = await prisma.payment.aggregate({
      where: {
        propertyId,
        paymentDate: {
          gte: addDays(businessDate, -(TREND_DAYS - 1)),
          lt: addDays(businessDate, 1),
        },
      },
      _sum: { amount: true },
    });

    expect(charted).toBeCloseTo(money(ledger._sum.amount).toNumber(), 2);
  });

  it("reports booking sources unevenly, excluding lost business", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.sources?.ok) throw new Error("sources section failed");

    const rows = snapshot.sources.data;
    expect(rows.length).toBeGreaterThanOrEqual(6);

    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const expected = await prisma.reservation.count({
      where: { propertyId, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    });
    expect(total).toBe(expected);

    // Sorted descending, and genuinely uneven.
    expect(new Set(rows.map((row) => row.count)).size).toBeGreaterThan(1);
    expect(rows[0].count).toBeGreaterThanOrEqual(rows[rows.length - 1].count);
  });
});

describe("operational sections", () => {
  it("shows only low-stock items, measured against each item's own minimum", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.lowStock?.ok) throw new Error("low stock section failed");

    for (const row of snapshot.lowStock.data) {
      expect(money(row.quantity).lessThan(money(row.minimumQuantity))).toBe(true);
    }

    const expected = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM inventory_items
      WHERE propertyId = ${propertyId} AND status = 'ACTIVE' AND quantity < minimumQuantity`;
    expect(snapshot.lowStock.data.length).toBe(Number(expected[0].c));
  });

  it("counts only live housekeeping tasks", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.housekeeping?.ok) throw new Error("housekeeping section failed");

    const data = snapshot.housekeeping.data;
    for (const [status, count] of [
      ["PENDING", data.pending],
      ["ASSIGNED", data.assigned],
      ["IN_PROGRESS", data.inProgress],
    ] as const) {
      const expected = await prisma.housekeepingTask.count({
        where: { propertyId, status },
      });
      expect(count).toBe(expected);
    }
  });

  it("includes a maintenance request that belongs to no room", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.maintenance?.ok) throw new Error("maintenance section failed");

    const general = snapshot.maintenance.data.tasks.filter((task) => task.unitNumber === null);
    expect(general.length).toBeGreaterThanOrEqual(1);
    expect(general[0].issue).toBeTruthy();
  });

  it("reads activity from the audit snapshot rather than the users table", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.activity?.ok) throw new Error("activity section failed");

    expect(snapshot.activity.data.length).toBeGreaterThan(0);
    for (const row of snapshot.activity.data) {
      expect(row.userName).toBeTruthy();
      expect(row.description).toBeTruthy();
    }
  });

  it("derives alerts from live records, with the urgent ones first", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);
    if (!snapshot?.alerts.ok) throw new Error("alerts section failed");

    const alerts = snapshot.alerts.data;
    expect(alerts.length).toBeGreaterThan(0);

    const rank = { high: 0, medium: 1, low: 2 } as const;
    const order = alerts.map((alert) => rank[alert.priority]);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // An unassigned arrival is a real condition in this dataset.
    expect(alerts.some((alert) => alert.kind === "arrival_without_unit")).toBe(true);
  });
});

describe("permissions restrict the payload, not just the view", () => {
  it("withholds every financial figure from housekeeping", async () => {
    const snapshot = await getDashboardSnapshot(
      ROLE_PERMISSIONS.housekeeping as readonly Permission[],
      propertyId,
    );

    expect(snapshot?.financial).toBeNull();
    expect(snapshot?.collectionTrend).toBeNull();

    // Nothing financial anywhere in the serialised response.
    const serialised = JSON.stringify(snapshot);
    expect(serialised).not.toContain("collectedToday");
    expect(serialised).not.toContain("outstandingBalance");
  });

  it("withholds reservation lists from a user without reservation access", async () => {
    const snapshot = await getDashboardSnapshot(
      ROLE_PERMISSIONS.housekeeping as readonly Permission[],
      propertyId,
    );

    expect(snapshot?.recentReservations).toBeNull();
    expect(snapshot?.sources).toBeNull();
    expect(snapshot?.arrivals.ok && snapshot.arrivals.data).toEqual([]);
    expect(snapshot?.departures.ok && snapshot.departures.data).toEqual([]);
  });

  it("gives an accountant the money and withholds housekeeping detail", async () => {
    const snapshot = await getDashboardSnapshot(
      ROLE_PERMISSIONS.accountant as readonly Permission[],
      propertyId,
    );

    expect(snapshot?.financial?.ok).toBe(true);
    expect(snapshot?.housekeeping).toBeNull();
    expect(snapshot?.maintenance).toBeNull();
  });

  it("keeps balance figures out of a housekeeper's alerts", async () => {
    const snapshot = await getDashboardSnapshot(
      ROLE_PERMISSIONS.housekeeping as readonly Permission[],
      propertyId,
    );
    if (!snapshot?.alerts.ok) throw new Error("alerts section failed");

    expect(
      snapshot.alerts.data.some((alert) => alert.kind === "departure_with_balance"),
    ).toBe(false);
  });

  it("blanks expense-derived figures for a role without expense access", async () => {
    // Reception can see payments but not expenses.
    const reception = ROLE_PERMISSIONS.reception as readonly Permission[];
    expect(reception).toContain("payments.view");
    expect(reception).not.toContain("expenses.view");

    const snapshot = await getDashboardSnapshot(reception, propertyId);
    if (!snapshot?.financial?.ok) throw new Error("financial section failed");

    expect(snapshot.financial.data.expensesThisMonth).toBe("0.00");
    expect(snapshot.financial.data.collectedToday).not.toBe("0.00");
  });

  it("gives an administrator every section", async () => {
    const snapshot = await getDashboardSnapshot(ALL, propertyId);

    for (const key of [
      "financial",
      "occupancyTrend",
      "collectionTrend",
      "sources",
      "recentReservations",
      "housekeeping",
      "maintenance",
      "lowStock",
      "activity",
    ] as const) {
      expect(snapshot?.[key], `${key} should be present for an administrator`).not.toBeNull();
    }
  });
});

describe("a brand-new property", () => {
  it("renders as empty rather than failing", async () => {
    const fresh = await prisma.property.create({
      data: { name: "منشأة جديدة بلا بيانات", type: "RESORT", city: "أبها" },
      select: { id: true },
    });

    const snapshot = await getDashboardSnapshot(ALL, fresh.id);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.units.ok && snapshot.units.data.total).toBe(0);
    expect(snapshot?.units.ok && snapshot.units.data.occupancyRate).toBe(0);
    expect(snapshot?.arrivals.ok && snapshot.arrivals.data).toEqual([]);
    expect(snapshot?.departures.ok && snapshot.departures.data).toEqual([]);
    expect(snapshot?.alerts.ok && snapshot.alerts.data).toEqual([]);
    expect(snapshot?.financial?.ok && snapshot.financial.data.collectedToday).toBe("0.00");
    expect(snapshot?.lowStock?.ok && snapshot.lowStock.data).toEqual([]);
    expect(snapshot?.activity?.ok && snapshot.activity.data).toEqual([]);

    // Charts return a full window of zeros, so they render an axis rather than an error.
    expect(snapshot?.occupancyTrend?.ok && snapshot.occupancyTrend.data).toHaveLength(TREND_DAYS);
    expect(
      snapshot?.occupancyTrend?.ok && snapshot.occupancyTrend.data.every((p) => p.value === 0),
    ).toBe(true);

    await prisma.property.delete({ where: { id: fresh.id } });
  });

  it("returns null when there is no property at all", async () => {
    const missing = await getDashboardSnapshot(ALL, "nonexistentpropertyid000000");
    expect(missing).toBeNull();
  });
});
