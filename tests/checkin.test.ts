import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { businessDate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import type { Permission } from "@/lib/permissions";
import {
  evaluateCheckInEligibility,
  evaluateNoShowEligibility,
  missingGuestFields,
} from "@/server/checkin-rules";
import {
  checkInReservation,
  getCheckInContext,
  markNoShow,
} from "@/server/services/checkin.service";
import { createReservation } from "@/server/services/reservation.service";

import {
  TEST_ACTOR,
  resetDatabase,
  seedCheckInGuest,
  seedGuest,
  seedInventory,
  setBusinessDate,
  setVatRate,
} from "./helpers";

/**
 * Stage 9 — arrivals.
 *
 * The cases here are the ones a person clicking through the screen once will never
 * produce: twenty simultaneous submissions of the same arrival, two receptionists
 * racing for the last clean room, a room blocked between the booking and the guest
 * walking in, and an assignment that must not spend the hotel's capacity twice.
 *
 * Every one of them goes through the real service. A test that reproduced the rules
 * with its own queries would pass while the front desk failed.
 */

const AUG_20 = "2026-08-20";
const AUG_21 = "2026-08-21";
const AUG_22 = "2026-08-22";
const AUG_23 = "2026-08-23";

const d = (iso: string) => businessDate(iso);
const perms = (...list: Permission[]) => new Set<Permission>(list);
const FULL = perms("reservations.view", "reservations.checkin", "payments.view", "guests.edit");

let ctx: Awaited<ReturnType<typeof seedInventory>>;
let guest: Awaited<ReturnType<typeof seedCheckInGuest>>;

beforeEach(async () => {
  await resetDatabase();
  ctx = await seedInventory({ units: 3, unitPrefix: "C" });
  await setVatRate(ctx.property.id, "0");
  await setBusinessDate(AUG_20);
  guest = await seedCheckInGuest();
});

afterAll(async () => {
  // The suites that follow seed their own world and count reservation numbers; rows
  // left behind here would collide with theirs.
  await resetDatabase();
});

function payload(overrides: Record<string, unknown> = {}) {
  const merged: Record<string, unknown> = {
    propertyId: ctx.property.id,
    guestId: guest.id,
    unitId: ctx.units[0].id,
    unitTypeId: ctx.unitType.id,
    checkInDate: AUG_20,
    checkOutDate: AUG_23,
    adults: 2,
    nightlyRate: "400.00",
    status: "CONFIRMED",
    ...overrides,
  };

  // The create schema treats an unassigned booking as an absent unit, not a null one.
  if (merged.unitId === null) delete merged.unitId;

  return merged as never;
}

const book = (overrides: Record<string, unknown> = {}) =>
  createReservation(payload(overrides), TEST_ACTOR);

const arrive = (reservationId: string, unitId?: string) =>
  checkInReservation({ reservationId, unitId }, TEST_ACTOR);

const statusOf = async (reservationId: string) =>
  (
    await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { status: true },
    })
  ).status;

const unitStatusOf = async (unitId: string) =>
  (
    await prisma.unit.findUniqueOrThrow({ where: { id: unitId }, select: { status: true } })
  ).status;

// ---------------------------------------------------------------------------

describe("eligibility rules", () => {
  const base = { checkInDate: d(AUG_20), checkOutDate: d(AUG_23) };

  it("allows a confirmed booking on its arrival day", () => {
    const result = evaluateCheckInEligibility({
      ...base,
      status: "CONFIRMED",
      businessDay: d(AUG_20),
    });
    expect(result.eligible).toBe(true);
    expect(result.lateArrival).toBe(false);
  });

  it("allows a late arrival on a later night of the same stay", () => {
    const result = evaluateCheckInEligibility({
      ...base,
      status: "CONFIRMED",
      businessDay: d(AUG_22),
    });
    expect(result.eligible).toBe(true);
    expect(result.lateArrival).toBe(true);
  });

  it("refuses the checkout day itself", () => {
    const result = evaluateCheckInEligibility({
      ...base,
      status: "CONFIRMED",
      businessDay: d(AUG_23),
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedReason).toContain("انتهت فترة هذا الحجز");
  });

  it("refuses a booking that has not started", () => {
    const result = evaluateCheckInEligibility({
      ...base,
      status: "CONFIRMED",
      businessDay: d("2026-08-19"),
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedReason).toBe("لا يمكن تسجيل الوصول قبل تاريخ بداية الحجز.");
  });

  it.each([
    ["PENDING", "أكّد الحجز أولًا"],
    ["CANCELLED", "ملغي"],
    ["NO_SHOW", "عدم حضور"],
    ["CHECKED_OUT", "انتهت إقامة"],
  ] as const)("refuses a %s booking", (status, fragment) => {
    const result = evaluateCheckInEligibility({
      ...base,
      status,
      businessDay: d(AUG_20),
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedReason).toContain(fragment);
  });

  it("reports an already-checked-in booking as a replay rather than a failure", () => {
    const result = evaluateCheckInEligibility({
      ...base,
      status: "CHECKED_IN",
      businessDay: d(AUG_20),
    });
    expect(result.alreadyCheckedIn).toBe(true);
    expect(result.eligible).toBe(false);
  });
});

describe("check-in eligibility through the service", () => {
  it("checks in a confirmed booking on its arrival day", async () => {
    const reservation = await book();
    const result = await arrive(reservation.id);

    expect(result.status).toBe("CHECKED_IN");
    expect(result.unitNumber).toBe(ctx.units[0].unitNumber);
    expect(result.replayed).toBe(false);
    expect(await statusOf(reservation.id)).toBe("CHECKED_IN");
  });

  it("refuses a pending booking without silently confirming it", async () => {
    const reservation = await book({ status: "PENDING" });

    await expect(arrive(reservation.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await statusOf(reservation.id)).toBe("PENDING");
  });

  it.each(["CANCELLED", "NO_SHOW", "CHECKED_OUT"] as const)(
    "refuses a %s booking",
    async (status) => {
      const reservation = await book();
      await prisma.reservation.update({ where: { id: reservation.id }, data: { status } });

      await expect(arrive(reservation.id)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await statusOf(reservation.id)).toBe(status);
    },
  );

  it("refuses an arrival before the booking starts", async () => {
    const reservation = await book({ checkInDate: AUG_22, checkOutDate: AUG_23 });

    await expect(arrive(reservation.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "لا يمكن تسجيل الوصول قبل تاريخ بداية الحجز.",
    });
  });

  it("allows a late arrival and leaves the original dates untouched", async () => {
    const reservation = await book();
    await setBusinessDate(AUG_22);

    const result = await arrive(reservation.id);
    expect(result.lateArrival).toBe(true);

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: { checkInDate: true, checkOutDate: true },
    });
    expect(stored.checkInDate).toEqual(d(AUG_20));
    expect(stored.checkOutDate).toEqual(d(AUG_23));
  });

  it("refuses an arrival on the checkout day", async () => {
    const reservation = await book();
    await setBusinessDate(AUG_23);

    await expect(arrive(reservation.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("guest requirements", () => {
  it("names every missing field rather than only the first", () => {
    const missing = missingGuestFields({
      fullName: "سعد",
      identificationType: null,
      identificationNumber: null,
      nationality: null,
      mobile: null,
    });
    expect(missing.map((item) => item.field)).toEqual([
      "identificationType",
      "identificationNumber",
      "nationality",
      "mobile",
    ]);
  });

  it("treats whitespace as missing", () => {
    const missing = missingGuestFields({
      fullName: "سعد",
      identificationType: "NATIONAL_ID",
      identificationNumber: "1010101010",
      nationality: "   ",
      mobile: "0551234567",
    });
    expect(missing.map((item) => item.field)).toEqual(["nationality"]);
  });

  it("refuses check-in for a guest with no document", async () => {
    const bare = await seedGuest({ fullName: "نزيل بلا وثيقة", mobile: "0559990001" });
    const reservation = await book({ guestId: bare.id });

    await expect(arrive(reservation.id)).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { identificationType: "مطلوب قبل تسجيل الوصول" },
    });
    expect(await statusOf(reservation.id)).toBe("CONFIRMED");
  });

  it("refuses check-in when the nationality is missing", async () => {
    const partial = await seedCheckInGuest();
    await prisma.guest.update({ where: { id: partial.id }, data: { nationality: null } });
    const reservation = await book({ guestId: partial.id });

    await expect(arrive(reservation.id)).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { nationality: "مطلوب قبل تسجيل الوصول" },
    });
  });

  it("refuses check-in when the mobile is missing", async () => {
    const partial = await seedCheckInGuest();
    await prisma.guest.update({ where: { id: partial.id }, data: { mobile: null } });
    const reservation = await book({ guestId: partial.id });

    await expect(arrive(reservation.id)).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { mobile: "مطلوب قبل تسجيل الوصول" },
    });
  });

  it("masks the document for a caller who may not read documents", async () => {
    const reservation = await book();

    const withAccess = await getCheckInContext(reservation.id, [ctx.property.id], FULL);
    const withoutAccess = await getCheckInContext(
      reservation.id,
      [ctx.property.id],
      perms("reservations.view", "reservations.checkin"),
    );

    expect(withAccess.guest.identificationDisplay).toBe(guest.identificationNumber);
    expect(withoutAccess.guest.identificationDisplay).not.toBe(guest.identificationNumber);
    expect(withoutAccess.guest.identificationDisplay).toContain("•");
  });
});

describe("room selection", () => {
  it("checks into the room already named on the booking", async () => {
    const reservation = await book();
    const result = await arrive(reservation.id);
    expect(result.unitId).toBe(ctx.units[0].id);
  });

  it("assigns a room to an unassigned booking at the desk", async () => {
    const reservation = await book({ unitId: null });
    expect(reservation.unitId).toBeNull();

    const result = await arrive(reservation.id, ctx.units[1].id);
    expect(result.unitId).toBe(ctx.units[1].id);
    expect(await unitStatusOf(ctx.units[1].id)).toBe("OCCUPIED");
  });

  it("refuses to complete an unassigned booking without a room, while rooms exist", async () => {
    const reservation = await book({ unitId: null });

    await expect(arrive(reservation.id)).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { unitId: "اختر وحدة جاهزة" },
    });
  });

  it("says so plainly when no room of the type is both free and ready", async () => {
    const reservation = await book({ unitId: null });

    // Two rooms sold to somebody else, the third left dirty: nothing to hand over.
    const other = await seedCheckInGuest();
    await book({ guestId: other.id, unitId: ctx.units[0].id });
    await book({ guestId: other.id, unitId: ctx.units[1].id });
    await prisma.unit.update({
      where: { id: ctx.units[2].id },
      data: { housekeepingStatus: "DIRTY" },
    });

    await expect(arrive(reservation.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "لا توجد وحدة جاهزة ومتاحة من النوع المحجوز لإتمام تسجيل الوصول.",
    });
  });

  it("refuses a room of a different unit type", async () => {
    const otherType = await prisma.unitType.create({
      data: {
        propertyId: ctx.property.id,
        name: "جناح",
        capacity: 4,
        baseRate: "900.00",
      },
    });
    const suite = await prisma.unit.create({
      data: {
        propertyId: ctx.property.id,
        unitTypeId: otherType.id,
        unitNumber: "S901",
        floor: 9,
      },
    });

    const reservation = await book({ unitId: null });
    await expect(arrive(reservation.id, suite.id)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await statusOf(reservation.id)).toBe("CONFIRMED");
  });

  it("refuses a room belonging to another property", async () => {
    const other = await seedInventory({ units: 1, name: "فندق آخر", unitPrefix: "X" });
    const reservation = await book({ unitId: null });

    await expect(arrive(reservation.id, other.units[0].id)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuses a room another booking holds for an overlapping night", async () => {
    const reservation = await book({ unitId: null });
    const other = await seedCheckInGuest();
    await book({ guestId: other.id, unitId: ctx.units[0].id });

    await expect(arrive(reservation.id, ctx.units[0].id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("refuses a room blocked after the booking was made", async () => {
    const reservation = await book();

    await prisma.unitBlock.create({
      data: {
        propertyId: ctx.property.id,
        unitId: ctx.units[0].id,
        reason: "RENOVATION",
        startDate: d(AUG_20),
        endDate: null,
        active: true,
      },
    });

    await expect(arrive(reservation.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await statusOf(reservation.id)).toBe("CONFIRMED");
  });

  it("refuses a room taken out of service", async () => {
    const reservation = await book();
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { maintenanceStatus: "OUT_OF_SERVICE" },
    });

    await expect(arrive(reservation.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a room already holding a checked-in guest", async () => {
    const first = await book();
    await arrive(first.id);

    // A second booking pointed at the occupied room by hand — the situation an
    // availability check has to catch even though no booking flow would create it.
    const other = await seedCheckInGuest();
    const second = await book({ guestId: other.id, unitId: null });

    await expect(arrive(second.id, ctx.units[0].id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("checks the whole remaining stay, not just tonight", async () => {
    // Room 0 is free tonight but sold from the 22nd — it cannot take a 20→23 stay.
    const other = await seedCheckInGuest();
    await book({ guestId: other.id, unitId: ctx.units[0].id, checkInDate: AUG_22, checkOutDate: "2026-08-24" });

    const reservation = await book({ unitId: null });
    await expect(arrive(reservation.id, ctx.units[0].id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("allows a room whose previous guest leaves before the remaining stay starts", async () => {
    // Somebody else has room 0 for the night of the 20th only.
    const other = await seedCheckInGuest();
    await book({ guestId: other.id, unitId: ctx.units[0].id, checkInDate: AUG_20, checkOutDate: AUG_21 });

    // Our guest booked 20→23 but only turns up on the 21st: room 0 is genuinely usable.
    const reservation = await book({ unitId: null });
    await setBusinessDate(AUG_21);

    const result = await arrive(reservation.id, ctx.units[0].id);
    expect(result.unitId).toBe(ctx.units[0].id);
    expect(result.lateArrival).toBe(true);
  });

  it("moves the booking to another room when the desk picks one", async () => {
    const reservation = await book();
    const result = await arrive(reservation.id, ctx.units[2].id);

    expect(result.unitId).toBe(ctx.units[2].id);
    expect(await unitStatusOf(ctx.units[2].id)).toBe("OCCUPIED");
    // The room it left is recomputed, not assumed.
    expect(await unitStatusOf(ctx.units[0].id)).toBe("AVAILABLE");
  });
});

describe("housekeeping readiness", () => {
  it.each(["DIRTY", "CLEANING"] as const)("refuses a %s room", async (housekeepingStatus) => {
    const reservation = await book();
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { housekeepingStatus },
    });

    await expect(arrive(reservation.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: `الوحدة ${ctx.units[0].unitNumber} مخصصة لهذا الحجز لكنها تحتاج إلى تنظيف قبل تسجيل الوصول.`,
    });
    // The room is not silently cleaned to make the check-in succeed.
    const unit = await prisma.unit.findUniqueOrThrow({
      where: { id: ctx.units[0].id },
      select: { housekeepingStatus: true },
    });
    expect(unit.housekeepingStatus).toBe(housekeepingStatus);
  });

  it.each(["CLEAN", "INSPECTED"] as const)("accepts a %s room", async (housekeepingStatus) => {
    const reservation = await book();
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { housekeepingStatus },
    });

    const result = await arrive(reservation.id);
    expect(result.status).toBe("CHECKED_IN");
  });

  it("leaves the room's housekeeping state alone once the guest is in it", async () => {
    const reservation = await book();
    await arrive(reservation.id);

    const unit = await prisma.unit.findUniqueOrThrow({
      where: { id: ctx.units[0].id },
      select: { status: true, housekeepingStatus: true },
    });
    expect(unit.status).toBe("OCCUPIED");
    // A guest walking in does not make the room dirty.
    expect(unit.housekeepingStatus).toBe("CLEAN");
  });

  it("still refuses a dirty room even when it is the booking's own", async () => {
    const reservation = await book();
    await prisma.unit.update({
      where: { id: ctx.units[0].id },
      data: { housekeepingStatus: "DIRTY" },
    });

    const context = await getCheckInContext(reservation.id, [ctx.property.id], FULL);
    const room = context.rooms.find((candidate) => candidate.id === ctx.units[0].id);

    // The distinction the screen has to draw: available, but not ready.
    expect(room?.available).toBe(true);
    expect(room?.ready).toBe(false);
    expect(room?.selectable).toBe(false);
  });
});

describe("concurrency", () => {
  it("performs exactly one transition when the same arrival is submitted 20 times", async () => {
    const reservation = await book();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => arrive(reservation.id)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(20);

    // One of them did the work; the rest found it done and said so.
    const performed = fulfilled.filter(
      (r) => (r as PromiseFulfilledResult<{ replayed: boolean }>).value.replayed === false,
    );
    expect(performed).toHaveLength(1);

    expect(await statusOf(reservation.id)).toBe("CHECKED_IN");

    const events = await prisma.activityLog.count({
      where: { entityId: reservation.id, action: "check_in" },
    });
    expect(events).toBe(1);
  });

  it("gives the last clean room to exactly one of twenty racing arrivals", async () => {
    /*
     * Twenty rooms so twenty confirmed bookings can legitimately exist — capacity is
     * the booking engine's rule and it is not the one under test here. Nineteen of
     * them are left dirty, so readiness, not availability, is what narrows the hotel
     * to a single door that twenty receptionists all reach for at once.
     */
    const hotel = await seedInventory({ units: 20, name: "فندق الزحام", unitPrefix: "Z" });
    await prisma.unit.updateMany({
      where: { id: { in: hotel.units.slice(1).map((unit) => unit.id) } },
      data: { housekeepingStatus: "DIRTY" },
    });

    const bookings = [];
    for (let index = 0; index < 20; index++) {
      const other = await seedCheckInGuest();
      bookings.push(
        await createReservation(
          {
            propertyId: hotel.property.id,
            guestId: other.id,
            unitTypeId: hotel.unitType.id,
            checkInDate: AUG_20,
            checkOutDate: AUG_23,
            adults: 1,
            nightlyRate: "400.00",
            status: "CONFIRMED",
          } as never,
          TEST_ACTOR,
        ),
      );
    }

    const results = await Promise.allSettled(
      bookings.map((reservation) =>
        checkInReservation(
          { reservationId: reservation.id, unitId: hotel.units[0].id },
          TEST_ACTOR,
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(1);

    const inHouse = await prisma.reservation.count({
      where: { unitId: hotel.units[0].id, status: "CHECKED_IN" },
    });
    expect(inHouse).toBe(1);
  });

  it("never puts two guests in one room when several unassigned arrivals race", async () => {
    // Three rooms, three unassigned bookings, all arriving at once and all allowed to
    // choose. Whatever order they resolve in, no room may end up with two guests.
    const bookings = [];
    for (let index = 0; index < 3; index++) {
      const other = await seedCheckInGuest();
      bookings.push(await book({ guestId: other.id, unitId: null }));
    }

    await Promise.allSettled(
      bookings.map((reservation, index) => arrive(reservation.id, ctx.units[index].id)),
    );

    const occupied = await prisma.reservation.groupBy({
      by: ["unitId"],
      where: { status: "CHECKED_IN" },
      _count: { _all: true },
    });

    for (const row of occupied) {
      expect(row._count._all).toBe(1);
    }
  });
});

describe("inventory", () => {
  it("does not consume a second unit of capacity when a room is assigned at check-in", async () => {
    const { getReservationAvailability } = await import(
      "@/server/services/availability.service"
    );

    const query = {
      propertyId: ctx.property.id,
      unitTypeId: ctx.unitType.id,
      checkInDate: AUG_20,
      checkOutDate: AUG_23,
    };

    const reservation = await book({ unitId: null });

    const before = await getReservationAvailability(query);
    expect(before.unassignedConsumed).toBe(1);
    expect(before.assignedConsumed).toBe(0);
    expect(before.remaining).toBe(2);

    await arrive(reservation.id, ctx.units[0].id);

    const after = await getReservationAvailability(query);
    // The spend moved from the type to a door; the total did not change.
    expect(after.unassignedConsumed).toBe(0);
    expect(after.assignedConsumed).toBe(1);
    expect(after.remaining).toBe(2);
  });

  it("checks in the last booking in a full hotel", async () => {
    // Three rooms, three confirmed unassigned bookings. Re-checking capacity at
    // assignment time would refuse the third — the guest is standing at the desk.
    const bookings = [];
    for (let index = 0; index < 3; index++) {
      const other = await seedCheckInGuest();
      bookings.push(await book({ guestId: other.id, unitId: null }));
    }

    for (let index = 0; index < 3; index++) {
      const result = await arrive(bookings[index].id, ctx.units[index].id);
      expect(result.status).toBe("CHECKED_IN");
    }
  });
});

describe("money", () => {
  it("leaves every financial figure untouched", async () => {
    const reservation = await book();

    const before = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: { total: true, paidAmount: true, balance: true, paymentStatus: true },
    });

    await arrive(reservation.id);

    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: { total: true, paidAmount: true, balance: true, paymentStatus: true },
    });

    expect(after.total.toString()).toBe(before.total.toString());
    expect(after.paidAmount.toString()).toBe(before.paidAmount.toString());
    expect(after.balance.toString()).toBe(before.balance.toString());
    expect(after.paymentStatus).toBe(before.paymentStatus);
  });

  it.each([
    ["unpaid", "0.00", "UNPAID"],
    ["partially paid", "500.00", "PARTIALLY_PAID"],
    ["fully paid", "1200.00", "PAID"],
  ] as const)("checks in a %s booking under the current policy", async (_label, paid, status) => {
    const reservation = await book();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { paidAmount: paid, balance: `${1200 - Number(paid)}.00`, paymentStatus: status },
    });

    const result = await arrive(reservation.id);
    expect(result.status).toBe("CHECKED_IN");
  });

  it("creates no payment or invoice rows", async () => {
    const reservation = await book();
    await arrive(reservation.id);

    expect(await prisma.payment.count({ where: { reservationId: reservation.id } })).toBe(0);
    expect(await prisma.invoice.count({ where: { reservationId: reservation.id } })).toBe(0);
  });

  it("withholds financial figures from a caller without payments.view", async () => {
    const reservation = await book();

    const withMoney = await getCheckInContext(reservation.id, [ctx.property.id], FULL);
    const withoutMoney = await getCheckInContext(
      reservation.id,
      [ctx.property.id],
      perms("reservations.view", "reservations.checkin"),
    );

    expect(withMoney.financial).not.toBeNull();
    // Absent, not zeroed: the figures never leave the server.
    expect(withoutMoney.financial).toBeNull();
  });
});

describe("property isolation", () => {
  let other: Awaited<ReturnType<typeof seedInventory>>;
  let foreignReservationId: string;

  beforeEach(async () => {
    other = await seedInventory({ units: 2, name: "فندق باء", unitPrefix: "B" });
    const foreignGuest = await seedCheckInGuest();
    const reservation = await createReservation(
      {
        propertyId: other.property.id,
        guestId: foreignGuest.id,
        unitId: other.units[0].id,
        unitTypeId: other.unitType.id,
        checkInDate: AUG_20,
        checkOutDate: AUG_23,
        adults: 1,
        nightlyRate: "300.00",
        status: "CONFIRMED",
      } as never,
      TEST_ACTOR,
    );
    foreignReservationId = reservation.id;
  });

  it("refuses to check in another property's booking", async () => {
    await expect(
      checkInReservation({ reservationId: foreignReservationId }, TEST_ACTOR, [ctx.property.id]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await statusOf(foreignReservationId)).toBe("CONFIRMED");
  });

  it("refuses to assign another property's room", async () => {
    const reservation = await book({ unitId: null });

    await expect(
      checkInReservation(
        { reservationId: reservation.id, unitId: other.units[0].id },
        TEST_ACTOR,
        [ctx.property.id],
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("hides another property's booking from the check-in screen entirely", async () => {
    await expect(
      getCheckInContext(foreignReservationId, [ctx.property.id], FULL),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never lists another property's rooms as candidates", async () => {
    const reservation = await book({ unitId: null });
    const context = await getCheckInContext(reservation.id, [ctx.property.id], FULL);

    const ids = context.rooms.map((room) => room.id);
    expect(ids).toEqual(expect.arrayContaining(ctx.units.map((unit) => unit.id)));
    for (const unit of other.units) {
      expect(ids).not.toContain(unit.id);
    }
  });

  it("refuses to mark another property's booking as a no-show", async () => {
    await setBusinessDate(AUG_21);
    await expect(
      markNoShow({ reservationId: foreignReservationId, reason: "لم يحضر" }, TEST_ACTOR, [
        ctx.property.id,
      ]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("activity log", () => {
  it("records the arrival with the room and the actor, and never the document", async () => {
    const reservation = await book();
    await arrive(reservation.id);

    const entry = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: reservation.id, action: "check_in" },
      select: { description: true, metadata: true, userName: true, propertyId: true },
    });

    expect(entry.userName).toBe(TEST_ACTOR.name);
    expect(entry.propertyId).toBe(ctx.property.id);
    expect(entry.description).toContain(ctx.units[0].unitNumber);
    expect(entry.description).toContain(reservation.reservationNumber);

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(guest.identificationNumber!);
  });

  it("records the assignment separately when a room is chosen at the desk", async () => {
    const reservation = await book({ unitId: null });
    await arrive(reservation.id, ctx.units[1].id);

    const assign = await prisma.activityLog.count({
      where: { entityId: reservation.id, action: "assign_unit" },
    });
    expect(assign).toBe(1);
  });

  it("records a room change before check-in as a reassignment", async () => {
    const reservation = await book();
    await arrive(reservation.id, ctx.units[2].id);

    const reassign = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: reservation.id, action: "reassign_unit" },
      select: { description: true },
    });
    expect(reassign.description).toContain(ctx.units[2].unitNumber);
  });
});

describe("actual arrival metadata", () => {
  it("stores when the guest arrived and who recorded it", async () => {
    const user = await prisma.user.create({
      data: {
        name: "موظف الاستقبال",
        email: `reception-${Date.now()}@nokhba-hotel.sa`,
        passwordHash: "x".repeat(60),
      },
    });

    const reservation = await book();
    const before = Date.now();
    await checkInReservation({ reservationId: reservation.id }, { ...TEST_ACTOR, id: user.id });

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: { checkedInAt: true, checkedInById: true, checkInDate: true },
    });

    expect(stored.checkedInById).toBe(user.id);
    expect(stored.checkedInAt).toBeInstanceOf(Date);
    // An instant, not a business date: the two are different columns for a reason.
    expect(stored.checkedInAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(stored.checkedInAt!.getTime()).not.toBe(stored.checkInDate.getTime());
  });

  it("keeps the original arrival timestamp when the command is replayed", async () => {
    const reservation = await book();
    const first = await arrive(reservation.id);
    const replay = await arrive(reservation.id);

    expect(replay.replayed).toBe(true);
    expect(replay.checkedInAt).toBe(first.checkedInAt);
  });
});

describe("no-show", () => {
  it("refuses on the arrival day itself", () => {
    const result = evaluateNoShowEligibility({
      status: "CONFIRMED",
      checkInDate: d(AUG_20),
      businessDay: d(AUG_20),
      issuedInvoices: 0,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedReason).toContain("يوم الوصول نفسه");
  });

  it("records a no-show once the arrival day has passed", async () => {
    const reservation = await book();
    await setBusinessDate(AUG_21);

    await markNoShow({ reservationId: reservation.id, reason: "لم يحضر ولم يتواصل" }, TEST_ACTOR);

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: { status: true, noShowAt: true, noShowReason: true, cancelledAt: true },
    });

    expect(stored.status).toBe("NO_SHOW");
    expect(stored.noShowAt).toBeInstanceOf(Date);
    expect(stored.noShowReason).toBe("لم يحضر ولم يتواصل");
    // Its own columns — a no-show is not a cancellation wearing a different label.
    expect(stored.cancelledAt).toBeNull();
  });

  it("releases the room's inventory", async () => {
    const { getReservationAvailability } = await import(
      "@/server/services/availability.service"
    );
    const query = {
      propertyId: ctx.property.id,
      unitTypeId: ctx.unitType.id,
      checkInDate: AUG_20,
      checkOutDate: AUG_23,
    };

    const reservation = await book();
    expect((await getReservationAvailability(query)).remaining).toBe(2);

    await setBusinessDate(AUG_21);
    await markNoShow({ reservationId: reservation.id, reason: "لم يحضر" }, TEST_ACTOR);

    expect((await getReservationAvailability(query)).remaining).toBe(3);
    expect(await unitStatusOf(ctx.units[0].id)).toBe("AVAILABLE");
  });

  it("preserves the booking rather than deleting it", async () => {
    const reservation = await book();
    await setBusinessDate(AUG_21);
    await markNoShow({ reservationId: reservation.id, reason: "لم يحضر" }, TEST_ACTOR);

    expect(
      await prisma.reservation.count({ where: { id: reservation.id } }),
    ).toBe(1);
  });

  it("leaves an existing payment exactly where it is", async () => {
    const reservation = await book();
    await prisma.payment.create({
      data: {
        propertyId: ctx.property.id,
        reservationId: reservation.id,
        guestId: guest.id,
        paymentNumber: `PAY-TEST-${Date.now()}`,
        amount: "400.00",
        method: "CASH",
        paymentDate: d(AUG_20),
      },
    });
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { paidAmount: "400.00", balance: "800.00", paymentStatus: "PARTIALLY_PAID" },
    });

    await setBusinessDate(AUG_21);
    await markNoShow({ reservationId: reservation.id, reason: "لم يحضر" }, TEST_ACTOR);

    const payments = await prisma.payment.findMany({
      where: { reservationId: reservation.id },
      select: { amount: true },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0].amount.toString()).toBe("400");

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: { paidAmount: true, balance: true },
    });
    expect(stored.paidAmount.toString()).toBe("400");
    expect(stored.balance.toString()).toBe("800");
  });

  it("refuses when an invoice has been issued", async () => {
    const reservation = await book();
    await prisma.invoice.create({
      data: {
        propertyId: ctx.property.id,
        reservationId: reservation.id,
        guestId: guest.id,
        invoiceNumber: `INV-TEST-${Date.now()}`,
        issueDate: d(AUG_20),
        subtotal: "1200.00",
        total: "1200.00",
        balance: "1200.00",
        status: "ISSUED",
      },
    });

    await setBusinessDate(AUG_21);
    await expect(
      markNoShow({ reservationId: reservation.id, reason: "لم يحضر" }, TEST_ACTOR),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requires a reason", async () => {
    const reservation = await book();
    await setBusinessDate(AUG_21);

    await expect(
      markNoShow({ reservationId: reservation.id, reason: "" }, TEST_ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("is idempotent", async () => {
    const reservation = await book();
    await setBusinessDate(AUG_21);

    await markNoShow({ reservationId: reservation.id, reason: "لم يحضر" }, TEST_ACTOR);
    const second = await markNoShow({ reservationId: reservation.id, reason: "لم يحضر" }, TEST_ACTOR);

    expect(second.replayed).toBe(true);
    expect(
      await prisma.activityLog.count({ where: { entityId: reservation.id, action: "no_show" } }),
    ).toBe(1);
  });

  it("refuses to check in a booking already marked as a no-show", async () => {
    const reservation = await book();
    await setBusinessDate(AUG_21);
    await markNoShow({ reservationId: reservation.id, reason: "لم يحضر" }, TEST_ACTOR);

    await expect(arrive(reservation.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
