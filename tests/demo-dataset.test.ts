import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";

import { resetDatabase } from "./helpers";
import { money } from "@/lib/money";

import { DEMO_BUSINESS_DATE } from "../prisma/demo/constants";
import { assertResetAllowed, DemoResetBlocked, findDemoProperty } from "../prisma/demo/reset";
import { UNIT_ROLE_PLAN, assignUnitRoles, planReservations } from "../prisma/demo/seed-reservations";
import { createRandom } from "../prisma/demo/random";
import { validateDemo } from "../prisma/demo/validate";

/**
 * Phase 3 acceptance.
 *
 * The seed script running without throwing proves very little — a contradictory
 * dataset inserts perfectly happily. These tests assert the dataset reconciles, the
 * scenario is actually staged on the demo date, and the reset command cannot reach
 * a production database.
 *
 * The suite builds its own dataset by invoking the real seed commands as
 * subprocesses. Other test files in this suite truncate the database, so depending
 * on data left behind by an earlier run would make these tests pass or fail on file
 * ordering. Shelling out also means what is verified here is the command a person
 * actually types, not a private reimplementation of it.
 */

const run = promisify(execFile);

let propertyId: string;

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
  if (!found) throw new Error("تعذّر إنشاء بيانات العرض في قاعدة الاختبار.");
  propertyId = found;
}, 300_000);

describe("dataset shape", () => {
  it("has the demo property", async () => {
    const property = await prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: { name: true, city: true, type: true, status: true },
    });

    expect(property.name).toBe("فندق أروقة جدة");
    expect(property.city).toBe("جدة");
    expect(property.type).toBe("HOTEL");
    expect(property.status).toBe("ACTIVE");
  });

  it("meets the minimum counts the demo needs to look alive", async () => {
    const counts = {
      unitTypes: await prisma.unitType.count({ where: { propertyId } }),
      units: await prisma.unit.count({ where: { propertyId } }),
      guests: await prisma.guest.count(),
      employees: await prisma.employee.count({ where: { propertyId } }),
      reservations: await prisma.reservation.count({ where: { propertyId } }),
      payments: await prisma.payment.count({ where: { propertyId } }),
      invoices: await prisma.invoice.count({ where: { propertyId } }),
      charges: await prisma.reservationCharge.count({ where: { propertyId } }),
      housekeeping: await prisma.housekeepingTask.count({ where: { propertyId } }),
      maintenance: await prisma.maintenanceRequest.count({ where: { propertyId } }),
      expenses: await prisma.expense.count({ where: { propertyId } }),
      inventoryItems: await prisma.inventoryItem.count({ where: { propertyId } }),
      movements: await prisma.inventoryTransaction.count({ where: { propertyId } }),
      outlets: await prisma.outlet.count({ where: { propertyId } }),
      activity: await prisma.activityLog.count({ where: { propertyId } }),
    };

    expect(counts.unitTypes).toBe(5);
    expect(counts.units).toBeGreaterThanOrEqual(36);
    expect(counts.units).toBeLessThanOrEqual(42);
    expect(counts.guests).toBeGreaterThanOrEqual(35);
    expect(counts.employees).toBeGreaterThanOrEqual(14);
    expect(counts.reservations).toBeGreaterThanOrEqual(50);
    expect(counts.payments).toBeGreaterThan(0);
    expect(counts.invoices).toBeGreaterThan(0);
    expect(counts.charges).toBeGreaterThan(0);
    expect(counts.housekeeping).toBeGreaterThan(0);
    expect(counts.maintenance).toBeGreaterThanOrEqual(5);
    expect(counts.expenses).toBeGreaterThanOrEqual(15);
    expect(counts.inventoryItems).toBeGreaterThanOrEqual(20);
    expect(counts.movements).toBeGreaterThan(0);
    expect(counts.outlets).toBeGreaterThanOrEqual(3);
    expect(counts.activity).toBeGreaterThanOrEqual(80);
  });

  it("stages a housekeeping scenario with work in every live state", async () => {
    /*
     * Pinned, because the seed is deterministic and the housekeeping screens are read
     * against these figures. If a future change to the scenario moves them, that is a
     * decision somebody should make on purpose rather than discover on a demo.
     */
    const byStatus = await prisma.housekeepingTask.groupBy({
      by: ["status"],
      where: { propertyId },
      _count: { _all: true },
    });

    const count = (status: string) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    expect(count("COMPLETED")).toBe(58);
    expect(count("IN_PROGRESS")).toBe(2);
    expect(count("PENDING")).toBe(3);
    expect(count("CANCELLED")).toBe(0);
    expect(byStatus.reduce((sum, row) => sum + row._count._all, 0)).toBe(63);

    // Rooms in each state the board has to render.
    const rooms = await prisma.unit.groupBy({
      by: ["housekeepingStatus"],
      where: { propertyId },
      _count: { _all: true },
    });
    const inState = (status: string) =>
      rooms.find((row) => row.housekeepingStatus === status)?._count._all ?? 0;

    expect(inState("DIRTY")).toBeGreaterThan(0);
    expect(inState("CLEANING")).toBeGreaterThan(0);
    expect(inState("CLEAN")).toBeGreaterThan(0);
    expect(inState("INSPECTED")).toBeGreaterThan(0);
  });

  it("covers every reservation status the workflows need", async () => {
    const groups = await prisma.reservation.groupBy({
      by: ["status"],
      where: { propertyId },
      _count: true,
    });
    const present = new Set(groups.map((g) => g.status));

    for (const status of ["CHECKED_IN", "CHECKED_OUT", "CONFIRMED", "CANCELLED", "NO_SHOW", "PENDING"]) {
      expect(present).toContain(status);
    }
  });

  it("spreads bookings unevenly across sources, the way a real hotel's are", async () => {
    const groups = await prisma.reservation.groupBy({
      by: ["source"],
      where: { propertyId },
      _count: true,
    });

    expect(groups.length).toBeGreaterThanOrEqual(6);
    const counts = groups.map((g) => g._count);
    // If every source had the same count the source chart would be meaningless.
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it("carries a month of history and a month of forward pipeline", async () => {
    const span = await prisma.reservation.aggregate({
      where: { propertyId },
      _min: { checkInDate: true },
      _max: { checkOutDate: true },
    });

    const historyDays = Math.round(
      (DEMO_BUSINESS_DATE.getTime() - span._min.checkInDate!.getTime()) / 86_400_000,
    );
    const futureDays = Math.round(
      (span._max.checkOutDate!.getTime() - DEMO_BUSINESS_DATE.getTime()) / 86_400_000,
    );

    expect(historyDays).toBeGreaterThanOrEqual(30);
    expect(futureDays).toBeGreaterThanOrEqual(30);
  });
});

describe("the demo date is actually staged", () => {
  it("has arrivals waiting to be checked in", async () => {
    const arrivals = await prisma.reservation.count({
      where: { propertyId, checkInDate: DEMO_BUSINESS_DATE, status: "CONFIRMED" },
    });
    expect(arrivals).toBeGreaterThanOrEqual(5);
    expect(arrivals).toBeLessThanOrEqual(8);
  });

  it("has departures due today", async () => {
    const departures = await prisma.reservation.count({
      where: { propertyId, checkOutDate: DEMO_BUSINESS_DATE, status: "CHECKED_IN" },
    });
    expect(departures).toBeGreaterThanOrEqual(4);
    expect(departures).toBeLessThanOrEqual(7);
  });

  it("sits at a believable occupancy — neither empty nor full", async () => {
    const units = await prisma.unit.count({ where: { propertyId } });
    const inHouse = await prisma.reservation.count({
      where: { propertyId, status: "CHECKED_IN" },
    });

    const occupancy = (inHouse / units) * 100;
    expect(occupancy).toBeGreaterThanOrEqual(55);
    expect(occupancy).toBeLessThanOrEqual(70);
  });

  it("shows every operational unit state on the board", async () => {
    const groups = await prisma.unit.groupBy({
      by: ["status"],
      where: { propertyId },
      _count: true,
    });
    const present = new Set(groups.map((g) => g.status));

    for (const status of ["OCCUPIED", "AVAILABLE", "RESERVED", "CLEANING", "MAINTENANCE", "BLOCKED"]) {
      expect(present).toContain(status);
    }
  });

  it("has arrivals paid to differing degrees, so the desk has real cases", async () => {
    const arrivals = await prisma.reservation.findMany({
      where: { propertyId, checkInDate: DEMO_BUSINESS_DATE, status: "CONFIRMED" },
      select: { paymentStatus: true },
    });

    expect(new Set(arrivals.map((a) => a.paymentStatus)).size).toBeGreaterThan(1);
  });

  it("includes at least one refund, recorded as a negative payment", async () => {
    const refunds = await prisma.payment.findMany({
      where: { propertyId, amount: { lt: 0 } },
      select: { reservationId: true, amount: true },
    });

    expect(refunds.length).toBeGreaterThanOrEqual(1);

    // The refunded stay's ledger must still reconcile to its cached figures.
    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: refunds[0].reservationId },
      select: { paidAmount: true, total: true, balance: true },
    });
    const sum = await prisma.payment.aggregate({
      where: { reservationId: refunds[0].reservationId },
      _sum: { amount: true },
    });

    expect(money(reservation.paidAmount).equals(money(sum._sum.amount))).toBe(true);
    expect(
      money(reservation.balance).equals(money(reservation.total).minus(money(reservation.paidAmount))),
    ).toBe(true);
  });

  it("has low-stock items for the alerts to surface", async () => {
    const low = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c FROM inventory_items WHERE quantity < minimumQuantity`;
    expect(Number(low[0].c)).toBeGreaterThanOrEqual(3);
  });
});

describe("integrity", () => {
  it("passes every reconciliation check the validator makes", async () => {
    const report = await validateDemo(prisma);

    // Surface the actual contradiction rather than a bare false.
    expect(report.violations.map((v) => `${v.check}: ${v.detail}`)).toEqual([]);
    expect(report.ok).toBe(true);
  }, 60_000);

  it("has no two active reservations holding the same room", async () => {
    const clashes = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*) AS c
      FROM reservations a
      JOIN reservations b
        ON a.unitId = b.unitId
       AND a.id <> b.id
       AND a.checkInDate < b.checkOutDate
       AND a.checkOutDate > b.checkInDate
      WHERE a.status IN ('CONFIRMED','CHECKED_IN')
        AND b.status IN ('CONFIRMED','CHECKED_IN')
        AND a.unitId IS NOT NULL`;

    expect(Number(clashes[0].c)).toBe(0);
  });

  it("keeps every guest, unit and type inside the demo property", async () => {
    const strays = await prisma.reservation.count({
      where: { propertyId, unit: { propertyId: { not: propertyId } } },
    });
    expect(strays).toBe(0);
  });
});

describe("determinism", () => {
  it("plans the same scenario from the same seed", () => {
    const unitsStub = Array.from({ length: 40 }, (_, i) => ({
      id: `u${i}`, unitNumber: String(100 + i), floor: 1,
      typeKey: "standard" as const, baseRate: "220.00",
    }));

    const first = planReservations(createRandom(20260820), unitsStub, 42);
    const second = planReservations(createRandom(20260820), unitsStub, 42);

    expect(second.roles).toEqual(first.roles);
    expect(second.stays.length).toBe(first.stays.length);
    expect(second.stays.map((s) => `${s.unitIndex}:${s.checkIn.toISOString()}:${s.status}`)).toEqual(
      first.stays.map((s) => `${s.unitIndex}:${s.checkIn.toISOString()}:${s.status}`),
    );
  });

  it("produces a different scenario from a different seed", () => {
    const unitsStub = Array.from({ length: 40 }, (_, i) => ({
      id: `u${i}`, unitNumber: String(100 + i), floor: 1,
      typeKey: "standard" as const, baseRate: "220.00",
    }));

    const a = planReservations(createRandom(1), unitsStub, 42);
    const b = planReservations(createRandom(2), unitsStub, 42);
    expect(a.stays.length).not.toBe(b.stays.length);
  });

  it("assigns exactly the planned mix of unit roles", () => {
    const roles = assignUnitRoles(createRandom(20260820), 40);
    const counts = new Map<string, number>();
    for (const role of roles) counts.set(role, (counts.get(role) ?? 0) + 1);

    for (const [role, expected] of UNIT_ROLE_PLAN) {
      expect(counts.get(role) ?? 0).toBe(expected);
    }
  });
});

describe("demo reset safety", () => {
  it("refuses to run in production", () => {
    expect(() =>
      assertResetAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow(DemoResetBlocked);
  });

  it("runs in production only with an explicit override", () => {
    expect(() =>
      assertResetAllowed({
        NODE_ENV: "production",
        ALLOW_DEMO_RESET: "true",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("runs freely in development", () => {
    expect(() =>
      assertResetAllowed({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("identifies the demo property by its marker, not by guessing", async () => {
    const found = await findDemoProperty(prisma);
    expect(found).toBe(propertyId);

    const marker = await prisma.systemSetting.findFirst({
      where: { propertyId, key: "demo.dataset" },
      select: { value: true },
    });
    expect(marker?.value).toBe("arwiqah-jeddah-v1");
  });
});

describe("demo logins", () => {
  it("links accounts to employees, and leaves most staff without one", async () => {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: "@arwiqah-demo.sa" } },
      select: {
        email: true,
        employeeId: true,
        roles: { select: { role: { select: { key: true } } } },
      },
    });

    expect(users.length).toBe(6);

    const linked = users.filter((u) => u.employeeId !== null);
    expect(linked.length).toBe(5);

    const employees = await prisma.employee.count({ where: { propertyId } });
    // The separation is the point: an employee record does not imply a login.
    expect(employees - linked.length).toBeGreaterThanOrEqual(9);
  });

  it("resolves a property for the employee-linked accounts", async () => {
    const user = await prisma.user.findFirstOrThrow({
      where: { email: "reception@arwiqah-demo.sa" },
      select: { employee: { select: { propertyId: true } } },
    });
    expect(user.employee?.propertyId).toBe(propertyId);
  });
});
