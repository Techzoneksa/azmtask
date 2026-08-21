import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { businessDate } from "@/lib/datetime";
import {
  cancelReservation,
  createReservation,
  findConflicts,
  isUnitAvailable,
} from "@/server/services/reservation.service";
import { AppError } from "@/server/errors";

import { TEST_ACTOR, resetDatabase, seedGuest, seedProperty } from "./helpers";

/**
 * Reservations — relationships, validation, numbering, and the guarantee the whole
 * module exists for: one unit is never sold twice for the same night.
 */

let ctx: Awaited<ReturnType<typeof seedProperty>>;
let guest: Awaited<ReturnType<typeof seedGuest>>;

const AUG_20 = "2026-08-20";
const AUG_23 = "2026-08-23";

async function book(overrides: Record<string, unknown> = {}) {
  return createReservation(
    {
      propertyId: ctx.property.id,
      guestId: guest.id,
      unitId: ctx.unit.id,
      unitTypeId: ctx.unitType.id,
      checkInDate: AUG_20,
      checkOutDate: AUG_23,
      adults: 2,
      nightlyRate: "450.00",
      status: "CONFIRMED",
      ...overrides,
    } as never,
    TEST_ACTOR,
  );
}

beforeEach(async () => {
  await resetDatabase();
  ctx = await seedProperty({ unitNumber: "101" });
  guest = await seedGuest();
});

describe("creation", () => {
  it("creates a reservation with its relationships intact", async () => {
    const reservation = await book();

    const found = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: {
        reservationNumber: true,
        guest: { select: { id: true } },
        unit: { select: { unitNumber: true } },
        unitType: { select: { name: true } },
        property: { select: { id: true } },
      },
    });

    expect(found.guest.id).toBe(guest.id);
    expect(found.unit?.unitNumber).toBe("101");
    expect(found.unitType.name).toBe("غرفة مزدوجة");
    expect(found.property.id).toBe(ctx.property.id);
  });

  it("computes totals from the nightly rate and the number of nights", async () => {
    const reservation = await book();

    const found = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: { subtotal: true, total: true, balance: true, paidAmount: true, paymentStatus: true },
    });

    /*
     * 3 nights x 450.00 = 1350, plus VAT at the property's configured rate. Stage 7
     * moved tax out of the caller's hands: it used to be an optional input that
     * defaulted to nothing, which meant a booking created without one was quietly
     * untaxed. The server computes it now, so these figures include it.
     */
    expect(found.subtotal.toFixed(2)).toBe("1350.00");
    expect(found.total.toFixed(2)).toBe("1552.50");
    expect(found.balance.toFixed(2)).toBe("1552.50");
    expect(found.paidAmount.toFixed(2)).toBe("0.00");
    expect(found.paymentStatus).toBe("UNPAID");
  });

  it("issues sequential, unique reservation numbers", async () => {
    const first = await book();
    const second = await book({ unitId: undefined, checkInDate: "2026-09-01", checkOutDate: "2026-09-03" });

    expect(first.reservationNumber).toMatch(/^RES-2026-\d{6}$/);
    expect(second.reservationNumber).not.toBe(first.reservationNumber);

    const numbers = await prisma.reservation.findMany({ select: { reservationNumber: true } });
    expect(new Set(numbers.map((r) => r.reservationNumber)).size).toBe(numbers.length);
  });

  it("stores business dates as calendar days, free of any timezone shift", async () => {
    const reservation = await book();
    const found = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: { checkInDate: true, checkOutDate: true },
    });

    expect(found.checkInDate.toISOString().slice(0, 10)).toBe(AUG_20);
    expect(found.checkOutDate.toISOString().slice(0, 10)).toBe(AUG_23);
    expect(found.checkInDate.getTime()).toBe(businessDate(AUG_20).getTime());
  });

  it("rejects a checkout that is not after the check-in", async () => {
    await expect(book({ checkOutDate: AUG_20 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(book({ checkOutDate: "2026-08-19" })).rejects.toThrow(AppError);
  });

  it("rejects a unit that belongs to another property", async () => {
    const other = await seedProperty({ unitNumber: "999" });

    await expect(book({ unitId: other.unit.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("marks a confirmed unit as reserved", async () => {
    await book();
    const unit = await prisma.unit.findUniqueOrThrow({
      where: { id: ctx.unit.id },
      select: { status: true },
    });
    expect(unit.status).toBe("RESERVED");
  });

  it("writes an audit entry that survives the acting user disappearing", async () => {
    const reservation = await book();

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "Reservation", entityId: reservation.id },
      select: { userName: true, userEmail: true, action: true, description: true },
    });

    expect(log.action).toBe("create");
    // The acting identity is frozen into the row, not joined at read time.
    expect(log.userName).toBe(TEST_ACTOR.name);
    expect(log.userEmail).toBe(TEST_ACTOR.email);
  });
});

describe("collision prevention", () => {
  it("refuses an overlapping booking for the same unit", async () => {
    await book();

    await expect(
      book({ checkInDate: "2026-08-22", checkOutDate: "2026-08-25" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a booking fully contained inside another", async () => {
    await book();
    await expect(
      book({ checkInDate: "2026-08-21", checkOutDate: "2026-08-22" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a booking that fully contains another", async () => {
    await book();
    await expect(
      book({ checkInDate: "2026-08-18", checkOutDate: "2026-08-26" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows a booking starting the day the previous one ends", async () => {
    await book();
    // Checkout is exclusive: the room is sellable again on the 23rd.
    const next = await book({ checkInDate: AUG_23, checkOutDate: "2026-08-25" });
    expect(next.id).toBeTruthy();
  });

  it("allows a booking ending the day the next one starts", async () => {
    await book();
    const earlier = await book({ checkInDate: "2026-08-17", checkOutDate: AUG_20 });
    expect(earlier.id).toBeTruthy();
  });

  it("releases the dates once a reservation is cancelled", async () => {
    const reservation = await book();

    await expect(book()).rejects.toMatchObject({ code: "CONFLICT" });

    await cancelReservation(reservation.id, "طلب النزيل", TEST_ACTOR);

    const replacement = await book();
    expect(replacement.id).toBeTruthy();
  });

  it("returns the unit to available when the last hold is cancelled", async () => {
    const reservation = await book();
    await cancelReservation(reservation.id, null, TEST_ACTOR);

    const unit = await prisma.unit.findUniqueOrThrow({
      where: { id: ctx.unit.id },
      select: { status: true },
    });
    expect(unit.status).toBe("AVAILABLE");
  });

  it("reports availability consistently with what creation enforces", async () => {
    expect(
      await isUnitAvailable({
        unitId: ctx.unit.id,
        checkInDate: businessDate(AUG_20),
        checkOutDate: businessDate(AUG_23),
      }),
    ).toBe(true);

    await book();

    expect(
      await isUnitAvailable({
        unitId: ctx.unit.id,
        checkInDate: businessDate("2026-08-21"),
        checkOutDate: businessDate("2026-08-24"),
      }),
    ).toBe(false);

    const conflicts = await findConflicts({
      unitId: ctx.unit.id,
      checkInDate: businessDate("2026-08-21"),
      checkOutDate: businessDate("2026-08-24"),
    });
    expect(conflicts).toHaveLength(1);
  });

  it("holds under concurrency: simultaneous bookings for one unit produce one winner", async () => {
    /*
     * The real test of the design. Both calls check availability against an empty
     * calendar; without the row lock both would insert and the room would be sold
     * twice. Exactly one must succeed.
     */
    const attempts = await Promise.allSettled([book(), book(), book(), book(), book()]);

    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);

    const stored = await prisma.reservation.count({ where: { unitId: ctx.unit.id } });
    expect(stored).toBe(1);
  });

  it("does not lock a specific room when none is assigned yet", async () => {
    /*
     * This test used to assert that two unassigned confirmed bookings both succeed,
     * against a property with exactly one room. That was the overselling bug Stage 7
     * exists to close: neither booking names a room, so a per-room check finds the
     * room free twice — and the hotel has sold one room to two people.
     *
     * What is actually true, and what this now asserts: no *specific* room is held,
     * so the room stays individually free — while the type's one unit of capacity is
     * spent, and the second booking is refused.
     */
    const first = await book({ unitId: undefined });

    const unit = await prisma.unit.findUniqueOrThrow({ where: { id: ctx.unit.id } });
    expect(unit.status).toBe("AVAILABLE");
    expect(first.unitId).toBeNull();

    await expect(book({ unitId: undefined })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("cancellation", () => {
  it("is idempotent", async () => {
    const reservation = await book();
    await cancelReservation(reservation.id, null, TEST_ACTOR);
    const again = await cancelReservation(reservation.id, null, TEST_ACTOR);
    expect(again.status).toBe("CANCELLED");
  });

  it("refuses to cancel a stay already checked in", async () => {
    const reservation = await book();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CHECKED_IN" },
    });

    await expect(cancelReservation(reservation.id, null, TEST_ACTOR)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
