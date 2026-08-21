import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { addDays, toISODate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { getBusinessDate } from "@/server/business-date";
import {
  blockUnit,
  createUnit,
  createUnitType,
  getUnitDetails,
  listUnitTypes,
  listUnits,
  unblockUnit,
  updateUnit,
  updateUnitType,
  UnitFilterSchema,
} from "@/server/services/unit.service";

import { findDemoProperty } from "../prisma/demo/reset";

/**
 * Phase 5 — units.
 *
 * The rules under test are the ones that keep the board honest: a room is never
 * shown as free while a guest is in it, never blocked out from under a confirmed
 * arrival, and never given a status a human simply typed in.
 */

const run = promisify(execFile);

let propertyId: string;
let today: Date;

const ACTOR = { id: null, name: "مشغّل الاختبار", email: "test@arwiqah-demo.sa", roles: ["admin"] };

const filters = (overrides: Record<string, unknown> = {}) =>
  UnitFilterSchema.parse({ page: 1, pageSize: 25, ...overrides });

beforeAll(async () => {
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL! };
  await run("npx", ["tsx", "prisma/seed.ts"], { env });
  await run("npx", ["tsx", "prisma/demo-seed.ts"], { env });

  const found = await findDemoProperty(prisma);
  if (!found) throw new Error("تعذّر إنشاء بيانات العرض.");
  propertyId = found;
  today = await getBusinessDate();
}, 300_000);

describe("listing", () => {
  it("returns a page of units scoped to the property", async () => {
    const { rows, total } = await listUnits(propertyId, filters());

    expect(total).toBe(40);
    expect(rows).toHaveLength(25);

    const foreign = await prisma.unit.count({
      where: { id: { in: rows.map((r) => r.id) }, propertyId: { not: propertyId } },
    });
    expect(foreign).toBe(0);
  });

  it("paginates on the server rather than in the browser", async () => {
    const first = await listUnits(propertyId, filters({ page: 1, pageSize: 10 }));
    const second = await listUnits(propertyId, filters({ page: 2, pageSize: 10 }));

    expect(first.rows).toHaveLength(10);
    expect(second.rows).toHaveLength(10);
    // Distinct pages, not the same rows re-sliced.
    expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(20);
  });

  it("filters by floor", async () => {
    const { rows, total } = await listUnits(propertyId, filters({ floor: 2 }));
    expect(total).toBeGreaterThan(0);
    expect(rows.every((row) => row.floor === 2)).toBe(true);
  });

  it("filters by operational status", async () => {
    const { rows, total } = await listUnits(propertyId, filters({ status: "OCCUPIED" }));
    const expected = await prisma.unit.count({ where: { propertyId, status: "OCCUPIED" } });

    expect(total).toBe(expected);
    expect(rows.every((row) => row.status === "OCCUPIED")).toBe(true);
  });

  it("filters by housekeeping state", async () => {
    const { total } = await listUnits(propertyId, filters({ housekeeping: "DIRTY" }));
    const expected = await prisma.unit.count({ where: { propertyId, housekeepingStatus: "DIRTY" } });
    expect(total).toBe(expected);
  });

  it("filters by unit type", async () => {
    const type = await prisma.unitType.findFirstOrThrow({ where: { propertyId } });
    const { rows } = await listUnits(propertyId, filters({ unitTypeId: type.id }));
    expect(rows.every((row) => row.unitTypeId === type.id)).toBe(true);
  });

  it("searches unit numbers by prefix", async () => {
    const { rows } = await listUnits(propertyId, filters({ q: "20" }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.unitNumber.startsWith("20"))).toBe(true);
  });

  it("carries the occupying guest on an occupied row, and nothing on a free one", async () => {
    const occupied = await listUnits(propertyId, filters({ status: "OCCUPIED", pageSize: 5 }));
    expect(occupied.rows[0].currentGuest).toBeTruthy();
    expect(occupied.rows[0].checkOutDate).toBeTruthy();

    const available = await listUnits(propertyId, filters({ status: "AVAILABLE", pageSize: 5 }));
    expect(available.rows[0].currentGuest).toBeNull();
  });
});

describe("creating a unit", () => {
  it("creates one and logs it", async () => {
    const type = await prisma.unitType.findFirstOrThrow({ where: { propertyId } });

    const unit = await createUnit(
      propertyId,
      { unitNumber: "901", unitTypeId: type.id, floor: 9 },
      ACTOR,
    );

    expect(unit.unitNumber).toBe("901");

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "Unit", entityId: unit.id, action: "create" },
      select: { description: true, userName: true },
    });
    expect(log.description).toContain("901");
    expect(log.userName).toBe(ACTOR.name);
  });

  it("rejects a number already used in the property", async () => {
    const type = await prisma.unitType.findFirstOrThrow({ where: { propertyId } });
    await expect(
      createUnit(propertyId, { unitNumber: "101", unitTypeId: type.id, floor: 1 }, ACTOR),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("rejects a unit type belonging to another property", async () => {
    const other = await prisma.property.create({
      data: { name: "منشأة أخرى", type: "HOTEL", city: "الرياض" },
      select: { id: true },
    });
    const foreignType = await prisma.unitType.create({
      data: { propertyId: other.id, name: "نوع غريب", capacity: 2, baseRate: "100.00" },
      select: { id: true },
    });

    await expect(
      createUnit(propertyId, { unitNumber: "902", unitTypeId: foreignType.id }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await prisma.unitType.delete({ where: { id: foreignType.id } });
    await prisma.property.delete({ where: { id: other.id } });
  });

  it("rejects a missing unit number", async () => {
    const type = await prisma.unitType.findFirstOrThrow({ where: { propertyId } });
    await expect(
      createUnit(propertyId, { unitNumber: "  ", unitTypeId: type.id }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("editing a unit", () => {
  it("updates metadata and records a renumber explicitly", async () => {
    const unit = await prisma.unit.findFirstOrThrow({
      where: { propertyId, unitNumber: "901" },
      select: { id: true },
    });

    await updateUnit(propertyId, { unitId: unit.id, unitNumber: "903", floor: 9 }, ACTOR);

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "Unit", entityId: unit.id, action: "update" },
      orderBy: { createdAt: "desc" },
      select: { description: true },
    });
    expect(log.description).toContain("901");
    expect(log.description).toContain("903");
  });

  it("cannot be used to set an operational status", async () => {
    const unit = await prisma.unit.findFirstOrThrow({
      where: { propertyId, unitNumber: "903" },
      select: { id: true, status: true },
    });

    // A caller passing status through gets it ignored: the field is not in the
    // schema, so the derived state cannot be overwritten from a form.
    await updateUnit(
      propertyId,
      { unitId: unit.id, notes: "ملاحظة", status: "OCCUPIED" } as never,
      ACTOR,
    );

    const after = await prisma.unit.findUniqueOrThrow({
      where: { id: unit.id },
      select: { status: true },
    });
    expect(after.status).toBe(unit.status);
    expect(after.status).not.toBe("OCCUPIED");
  });

  it("refuses a unit from another property", async () => {
    const other = await prisma.property.create({
      data: { name: "منشأة ثالثة", type: "RESORT", city: "أبها" },
      select: { id: true },
    });
    const type = await prisma.unitType.create({
      data: { propertyId: other.id, name: "نوع", capacity: 2, baseRate: "100.00" },
      select: { id: true },
    });
    const foreignUnit = await prisma.unit.create({
      data: { propertyId: other.id, unitTypeId: type.id, unitNumber: "1" },
      select: { id: true },
    });

    await expect(
      updateUnit(propertyId, { unitId: foreignUnit.id, floor: 3 }, ACTOR),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await prisma.unit.delete({ where: { id: foreignUnit.id } });
    await prisma.unitType.delete({ where: { id: type.id } });
    await prisma.property.delete({ where: { id: other.id } });
  });
});

describe("blocking", () => {
  /*
   * A purpose-built room with no bookings at all, so a block test exercises the
   * block rule and nothing else. Hunting through seeded rooms was fragile: the demo
   * gives nearly every unit a forward booking, and the first test to block one left
   * none for the next.
   */
  let counter = 0;
  async function freeUnit() {
    const type = await prisma.unitType.findFirstOrThrow({
      where: { propertyId, status: "ACTIVE" },
      select: { id: true },
    });
    counter += 1;
    return prisma.unit.create({
      data: {
        propertyId,
        unitTypeId: type.id,
        unitNumber: `B${counter.toString().padStart(2, "0")}`,
        floor: 9,
      },
      select: { id: true, unitNumber: true },
    });
  }

  it("blocks an unencumbered unit and records the reason", async () => {
    const unit = await freeUnit();

    await blockUnit(
      propertyId,
      { unitId: unit.id, reason: "RENOVATION", notes: "تجديد الحمام" },
      ACTOR,
    );

    const block = await prisma.unitBlock.findFirstOrThrow({
      where: { unitId: unit.id, active: true },
      select: { reason: true, notes: true, startDate: true, endDate: true },
    });

    expect(block.reason).toBe("RENOVATION");
    expect(block.notes).toBe("تجديد الحمام");
    // Open-ended by default rather than guessing an end date.
    expect(block.endDate).toBeNull();

    const after = await prisma.unit.findUniqueOrThrow({
      where: { id: unit.id },
      select: { status: true },
    });
    expect(after.status).toBe("BLOCKED");
  });

  it("refuses to block the same unit twice", async () => {
    const unit = await freeUnit();
    await blockUnit(propertyId, { unitId: unit.id, reason: "OTHER" }, ACTOR);

    await expect(
      blockUnit(propertyId, { unitId: unit.id, reason: "OTHER" }, ACTOR),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to block a room with a guest in it", async () => {
    const stay = await prisma.reservation.findFirstOrThrow({
      where: { propertyId, status: "CHECKED_IN", unitId: { not: null } },
      select: { unitId: true },
    });

    await expect(
      blockUnit(propertyId, { unitId: stay.unitId!, reason: "RENOVATION" }, ACTOR),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  /**
   * A room with exactly one confirmed booking on it, built for the test rather than
   * found in the seed. Seeded rooms carry a forward pipeline, so a window chosen
   * around one booking can quietly overlap another and the assertion stops testing
   * what it claims to.
   */
  async function unitWithBooking(checkIn: Date, nights: number) {
    const unit = await freeUnit();
    const type = await prisma.unitType.findFirstOrThrow({
      where: { propertyId, status: "ACTIVE" },
      select: { id: true },
    });
    const guest = await prisma.guest.findFirstOrThrow({ select: { id: true } });

    counter += 1;
    const reservation = await prisma.reservation.create({
      data: {
        reservationNumber: `TST-${Date.now()}-${counter}`,
        propertyId,
        guestId: guest.id,
        unitId: unit.id,
        unitTypeId: type.id,
        checkInDate: checkIn,
        checkOutDate: addDays(checkIn, nights),
        nightlyRate: "300.00",
        status: "CONFIRMED",
      },
      select: { id: true, reservationNumber: true },
    });

    return { unit, reservation, checkIn, checkOut: addDays(checkIn, nights) };
  }

  it("refuses a block that would strand a confirmed arrival, and names it", async () => {
    const { unit, reservation, checkIn, checkOut } = await unitWithBooking(addDays(today, 10), 3);

    const attempt = blockUnit(
      propertyId,
      {
        unitId: unit.id,
        reason: "RENOVATION",
        startDate: toISODate(addDays(checkIn, -1)),
        endDate: toISODate(addDays(checkOut, 1)),
      },
      ACTOR,
    );

    await expect(attempt).rejects.toMatchObject({ code: "CONFLICT" });

    // Refusing is not enough: the desk needs to know which bookings are in the way.
    await attempt.catch((error) => {
      const conflicts = JSON.parse(error.fields.conflicts);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].reservationNumber).toBe(reservation.reservationNumber);
      expect(conflicts[0].guestName).toBeTruthy();
      expect(conflicts[0].checkInDate).toBe(toISODate(checkIn));
    });
  });

  it("allows a block that ends the day a booking begins", async () => {
    const { unit, checkIn } = await unitWithBooking(addDays(today, 20), 2);

    // Half-open, the same rule stays use: a block ending on the arrival date leaves
    // that night free for the guest, so it is not a conflict.
    const result = await blockUnit(
      propertyId,
      {
        unitId: unit.id,
        reason: "DEEP_CLEANING",
        startDate: toISODate(addDays(checkIn, -3)),
        endDate: toISODate(checkIn),
      },
      ACTOR,
    );

    expect(result.blockId).toBeTruthy();
  });

  it("refuses a block that starts the day a booking ends only if it overlaps", async () => {
    const { unit, checkOut } = await unitWithBooking(addDays(today, 30), 2);

    // Starting on the checkout date does not overlap either — the room is free that
    // night. Both edges of the half-open interval behave the same way.
    const result = await blockUnit(
      propertyId,
      {
        unitId: unit.id,
        reason: "RENOVATION",
        startDate: toISODate(checkOut),
        endDate: toISODate(addDays(checkOut, 5)),
      },
      ACTOR,
    );

    expect(result.blockId).toBeTruthy();
  });

  it("rejects an end date before the start", async () => {
    const unit = await freeUnit();
    await expect(
      blockUnit(
        propertyId,
        {
          unitId: unit.id,
          reason: "OTHER",
          startDate: toISODate(addDays(today, 5)),
          endDate: toISODate(addDays(today, 2)),
        },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("closes the block on unblock rather than deleting it", async () => {
    const unit = await freeUnit();
    await blockUnit(propertyId, { unitId: unit.id, reason: "STAFF_USE" }, ACTOR);

    const block = await prisma.unitBlock.findFirstOrThrow({
      where: { unitId: unit.id, active: true },
      select: { id: true, unitId: true },
    });

    await unblockUnit(propertyId, block.unitId, ACTOR);

    const after = await prisma.unitBlock.findUniqueOrThrow({
      where: { id: block.id },
      select: { active: true, endedAt: true },
    });

    // The history of why the room was out survives.
    expect(after.active).toBe(false);
    expect(after.endedAt).toBeInstanceOf(Date);

    const restored = await prisma.unit.findUniqueOrThrow({
      where: { id: block.unitId },
      select: { status: true },
    });
    expect(restored.status).not.toBe("BLOCKED");
  });

  it("refuses to unblock a unit that is not blocked", async () => {
    const unit = await prisma.unit.findFirstOrThrow({
      where: { propertyId, status: "AVAILABLE" },
      select: { id: true },
    });
    await expect(unblockUnit(propertyId, unit.id, ACTOR)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("unit details", () => {
  it("reports the occupying stay for an occupied room", async () => {
    const stay = await prisma.reservation.findFirstOrThrow({
      where: { propertyId, status: "CHECKED_IN", unitId: { not: null } },
      select: { unitId: true, reservationNumber: true, guest: { select: { fullName: true } } },
    });

    const detail = await getUnitDetails(propertyId, stay.unitId!);

    expect(detail.currentStay?.reservationNumber).toBe(stay.reservationNumber);
    expect(detail.currentStay?.guestName).toBe(stay.guest.fullName);
    expect(detail.status).toBe("OCCUPIED");
  });

  it("reports no stay for a free room, rather than a placeholder", async () => {
    const unit = await prisma.unit.findFirstOrThrow({
      where: { propertyId, status: "AVAILABLE" },
      select: { id: true },
    });
    const detail = await getUnitDetails(propertyId, unit.id);
    expect(detail.currentStay).toBeNull();
  });

  it("includes the next arrival, housekeeping, maintenance and history", async () => {
    const unit = await prisma.unit.findFirstOrThrow({
      where: { propertyId, unitNumber: "101" },
      select: { id: true },
    });
    const detail = await getUnitDetails(propertyId, unit.id);

    expect(detail.unitType.name).toBeTruthy();
    expect(detail.unitType.baseRate).toMatch(/^\d+\.\d{2}$/);
    expect(Array.isArray(detail.housekeeping)).toBe(true);
    expect(Array.isArray(detail.maintenance)).toBe(true);
    expect(detail.history.length).toBeGreaterThan(0);
  });

  it("refuses a unit from another property", async () => {
    const other = await prisma.property.create({
      data: { name: "منشأة رابعة", type: "HOTEL", city: "الدمام" },
      select: { id: true },
    });
    const type = await prisma.unitType.create({
      data: { propertyId: other.id, name: "نوع", capacity: 2, baseRate: "100.00" },
      select: { id: true },
    });
    const foreign = await prisma.unit.create({
      data: { propertyId: other.id, unitTypeId: type.id, unitNumber: "1" },
      select: { id: true },
    });

    await expect(getUnitDetails(propertyId, foreign.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await prisma.unit.delete({ where: { id: foreign.id } });
    await prisma.unitType.delete({ where: { id: type.id } });
    await prisma.property.delete({ where: { id: other.id } });
  });
});

describe("unit types", () => {
  it("lists types with their dependants and whether they can be retired", async () => {
    const types = await listUnitTypes(propertyId);

    expect(types).toHaveLength(5);
    expect(types.every((type) => type.unitCount >= 0)).toBe(true);
    // Every seeded type holds rooms, so none may be retired yet.
    expect(types.every((type) => type.canDeactivate === (type.unitCount === 0))).toBe(true);
  });

  it("creates a type", async () => {
    const type = await createUnitType(
      propertyId,
      { name: "جناح اختباري", capacity: 3, baseRate: "375.50" },
      ACTOR,
    );

    const stored = await prisma.unitType.findUniqueOrThrow({
      where: { id: type.id },
      select: { baseRate: true, capacity: true },
    });
    expect(stored.baseRate.toFixed(2)).toBe("375.50");
    expect(stored.capacity).toBe(3);
  });

  it("rejects a duplicate name in the same property", async () => {
    await expect(
      createUnitType(propertyId, { name: "جناح اختباري", capacity: 2, baseRate: "200" }, ACTOR),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("rejects a negative rate", async () => {
    await expect(
      createUnitType(propertyId, { name: "نوع سالب", capacity: 2, baseRate: "-50" }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses to retire a type that still holds rooms", async () => {
    const inUse = await prisma.unitType.findFirstOrThrow({
      where: { propertyId, units: { some: {} } },
      select: { id: true },
    });

    await expect(
      updateUnitType(propertyId, { unitTypeId: inUse.id, status: "INACTIVE" }, ACTOR),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("retires an unused type, and logs a rate change with both figures", async () => {
    const unused = await prisma.unitType.findFirstOrThrow({
      where: { propertyId, name: "جناح اختباري" },
      select: { id: true },
    });

    await updateUnitType(propertyId, { unitTypeId: unused.id, baseRate: "410.00" }, ACTOR);

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "UnitType", entityId: unused.id, action: "update_type" },
      orderBy: { createdAt: "desc" },
      select: { description: true },
    });
    expect(log.description).toContain("375.50");
    expect(log.description).toContain("410.00");

    const retired = await updateUnitType(
      propertyId,
      { unitTypeId: unused.id, status: "INACTIVE" },
      ACTOR,
    );
    expect(retired.id).toBe(unused.id);
  });

  it("refuses to build a unit on a retired type", async () => {
    const retired = await prisma.unitType.findFirstOrThrow({
      where: { propertyId, status: "INACTIVE" },
      select: { id: true },
    });

    await expect(
      createUnit(propertyId, { unitNumber: "904", unitTypeId: retired.id }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
