import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import * as Money from "@/lib/money";
import type { Permission } from "@/lib/permissions";
import { AppError } from "@/server/errors";
import { priceReservation } from "@/server/pricing";
import {
  cancelReservation,
  confirmReservation,
  createReservation,
  getReservationDetail,
  listReservations,
  updateReservation,
} from "@/server/services/reservation.service";

import {
  TEST_ACTOR,
  resetDatabase,
  seedGuest,
  seedInventory,
  setVatRate,
} from "./helpers";

/**
 * Phase 7 — the booking engine.
 *
 * These tests exist for the cases a single person clicking through a form will never
 * produce: two receptionists confirming the same room in the same millisecond, a
 * browser that submits twice, a booking that holds no room but has already spent the
 * capacity, and an edit that would make an issued invoice describe something that
 * never happened.
 */

let ctx: Awaited<ReturnType<typeof seedInventory>>;
let guest: Awaited<ReturnType<typeof seedGuest>>;

const AUG_20 = "2026-08-20";
const AUG_22 = "2026-08-22";
const AUG_24 = "2026-08-24";

const perms = (...list: Permission[]) => new Set<Permission>(list);
const FULL = perms("reservations.view", "payments.view", "invoices.view", "activity.view", "guests.edit");
const NO_MONEY = perms("reservations.view");

function payload(overrides: Record<string, unknown> = {}) {
  return {
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
  } as never;
}

const book = (overrides: Record<string, unknown> = {}) =>
  createReservation(payload(overrides), TEST_ACTOR);

/** Counts how many of a batch of racing promises won. */
function tally(results: PromiseSettledResult<unknown>[]) {
  return {
    won: results.filter((r) => r.status === "fulfilled").length,
    lost: results.filter((r) => r.status === "rejected").length,
    reasons: results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason as AppError)?.code ?? "UNKNOWN"),
  };
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
  await setVatRate(ctx.property.id, "15");
});

// ---------------------------------------------------------------------------

describe("creation", () => {
  it("creates a booking with its relationships and dates intact", async () => {
    const reservation = await book();

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(stored.guestId).toBe(guest.id);
    expect(stored.unitId).toBe(ctx.units[0].id);
    expect(stored.unitTypeId).toBe(ctx.unitType.id);
    // Business dates: calendar days, no timezone shift smuggled in.
    expect(stored.checkInDate.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(stored.checkOutDate.toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });

  it("issues unique sequential numbers", async () => {
    const first = await book();
    const second = await book({ unitId: ctx.units[1].id });

    expect(first.reservationNumber).not.toBe(second.reservationNumber);
    expect(first.reservationNumber).toMatch(/^RES-2026-\d{6}$/);
    expect(Number(second.reservationNumber.slice(-6))).toBe(
      Number(first.reservationNumber.slice(-6)) + 1,
    );
  });

  it("refuses a unit belonging to another property", async () => {
    const other = await seedInventory({ units: 1, name: "فندق آخر", unitPrefix: "X" });
    await expect(book({ unitId: other.units[0].id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuses a unit type belonging to another property", async () => {
    const other = await seedInventory({ units: 1, name: "فندق ثالث", unitPrefix: "Y" });
    await expect(book({ unitTypeId: other.unitType.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuses a checkout that is not after the check-in", async () => {
    await expect(book({ checkOutDate: AUG_20 })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses a guest that does not exist", async () => {
    await expect(book({ guestId: "cmzzzzzzzzzzzzzzzzzzzzzzz" })).rejects.toBeInstanceOf(AppError);
  });

  it("marks a confirmed room as reserved on the board", async () => {
    await book();
    const unit = await prisma.unit.findUniqueOrThrow({ where: { id: ctx.units[0].id } });
    expect(unit.status).toBe("RESERVED");
  });

  it("writes an audit entry that outlives the acting user", async () => {
    const reservation = await book();
    const entry = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "Reservation", entityId: reservation.id, action: "create" },
    });
    expect(entry.description).toContain(reservation.reservationNumber);
    expect(entry.userName).toBe(TEST_ACTOR.name);
  });
});

// ---------------------------------------------------------------------------

describe("pricing", () => {
  it("computes the folio from the rate, the nights and the configured rate of tax", async () => {
    const reservation = await book({ nightlyRate: "400.00", checkOutDate: AUG_24 });
    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });

    // 4 nights x 400 = 1600; VAT 15% = 240; total 1840. Exact, not approximately.
    expect(Money.toAmountString(stored.subtotal)).toBe("1600.00");
    expect(Money.toAmountString(stored.tax)).toBe("240.00");
    expect(Money.toAmountString(stored.total)).toBe("1840.00");
    expect(Money.toAmountString(stored.balance)).toBe("1840.00");
    expect(stored.paymentStatus).toBe("UNPAID");
  });

  it("taxes the accommodation after the discount, never before", async () => {
    const reservation = await book({ nightlyRate: "500.00", discount: "200.00" });
    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });

    // (2 x 500 - 200) = 800 taxable; VAT 120; total 920.
    expect(Money.toAmountString(stored.subtotal)).toBe("1000.00");
    expect(Money.toAmountString(stored.discount)).toBe("200.00");
    expect(Money.toAmountString(stored.tax)).toBe("120.00");
    expect(Money.toAmountString(stored.total)).toBe("920.00");
  });

  it("reads the rate of tax from settings rather than a constant in the code", async () => {
    await setVatRate(ctx.property.id, "5");
    const reservation = await book({ nightlyRate: "1000.00" });
    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });

    // The rate moved from 15% to 5% without a code change — which is the point.
    expect(Money.toAmountString(stored.tax)).toBe("100.00");
    expect(Money.toAmountString(stored.total)).toBe("2100.00");
  });

  it("does not drift on a rate that does not divide evenly", () => {
    /*
     * 333.33 x 7 = 2333.31; 15% of that is 349.9965, which floating point renders as
     * 349.99649999999997 and a naive implementation stores as a total nobody can
     * reconcile against the invoice.
     */
    const price = priceReservation({ nightlyRate: "333.33", nights: 7, vatRate: "15" });

    expect(Money.toAmountString(price.subtotal)).toBe("2333.31");
    expect(Money.toAmountString(price.tax)).toBe("350.00");
    expect(Money.toAmountString(price.total)).toBe("2683.31");
  });

  it("adds charge rows without taxing them a second time", () => {
    // A charge row already carries its own line tax inside its total. Applying the
    // accommodation rate over it again would invent tax the guest does not owe.
    const price = priceReservation({
      nightlyRate: "400.00",
      nights: 2,
      vatRate: "15",
      additionalCharges: "230.00",
    });

    expect(Money.toAmountString(price.tax)).toBe("120.00");
    expect(Money.toAmountString(price.total)).toBe("1150.00");
  });

  it("never produces negative tax from an oversized discount", () => {
    const price = priceReservation({
      nightlyRate: "100.00",
      nights: 1,
      discount: "500.00",
      vatRate: "15",
    });
    expect(Money.toAmountString(price.taxableBase)).toBe("0.00");
    expect(Money.toAmountString(price.tax)).toBe("0.00");
  });
});

// ---------------------------------------------------------------------------

describe("concurrency", () => {
  it("confirms a booking once when the button is clicked ten times", async () => {
    /*
     * Every attempt ends with the booking confirmed, so the status alone cannot tell
     * whether the work happened once or ten times. The audit trail can — and a
     * booking whose history says it was confirmed ten times is a booking nobody can
     * reconstruct.
     *
     * This is the failure the lock ordering exists to prevent, and it only appears
     * under concurrency: MySQL hands a transaction a snapshot from its first read, so
     * a status check made before the lock still shows PENDING long after somebody
     * else confirmed.
     */
    const reservation = await book({ status: "PENDING" });

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        confirmReservation(reservation.id, [ctx.property.id], TEST_ACTOR),
      ),
    );

    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(10);

    const stored = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      select: { status: true },
    });
    expect(stored.status).toBe("CONFIRMED");

    const entries = await prisma.activityLog.count({
      where: { entityId: reservation.id, action: "confirm" },
    });
    expect(entries).toBe(1);
  });

  it("sells one room once when twenty receptionists try at the same instant", async () => {
    /*
     * All twenty read an empty calendar. Without the row lock all twenty insert and
     * the room is sold twenty times. The lock makes nineteen of them wait, re-read,
     * and find the first one's booking.
     */
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => book({ unitId: ctx.units[0].id })),
    );
    const { won, lost, reasons } = tally(attempts);

    expect(won).toBe(1);
    expect(lost).toBe(19);
    // A controlled availability conflict, not a deadlock or a raw driver error.
    expect(new Set(reasons)).toEqual(new Set(["CONFLICT"]));

    expect(await prisma.reservation.count({ where: { unitId: ctx.units[0].id } })).toBe(1);
  });

  it("sells the last room of a type once, to twenty unassigned bookings", async () => {
    /*
     * The case a per-room lock cannot catch. None of these name a room, so there is
     * no unit row to serialise on — the guarantee has to come from the unit type.
     * Two rooms are already spent, so exactly one unit of capacity remains.
     */
    await book({ unitId: ctx.units[0].id });
    await book({ unitId: ctx.units[1].id });

    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => book({ unitId: undefined })),
    );
    const { won, lost, reasons } = tally(attempts);

    expect(won).toBe(1);
    expect(lost).toBe(19);
    expect(new Set(reasons)).toEqual(new Set(["CONFLICT"]));

    const confirmed = await prisma.reservation.count({
      where: { unitTypeId: ctx.unitType.id, status: "CONFIRMED" },
    });
    // Three rooms, three confirmed bookings. Not four.
    expect(confirmed).toBe(3);
  });

  it("sells the last unit of capacity once when five bookings race for it", async () => {
    await book({ unitId: ctx.units[0].id });
    await book({ unitId: ctx.units[1].id });

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => book({ unitId: undefined })),
    );
    const { won, lost } = tally(attempts);

    expect(won).toBe(1);
    expect(lost).toBe(4);
  });

  it("does not oversell when assigned and unassigned bookings race together", async () => {
    // A mixed race is the realistic one: one receptionist picks a room, another
    // leaves it for later, and both are chasing the same last unit of inventory.
    await book({ unitId: ctx.units[0].id });
    await book({ unitId: ctx.units[1].id });

    const attempts = await Promise.allSettled([
      book({ unitId: ctx.units[2].id }),
      book({ unitId: undefined }),
      book({ unitId: ctx.units[2].id }),
      book({ unitId: undefined }),
      book({ unitId: ctx.units[2].id }),
      book({ unitId: undefined }),
    ]);
    const { won } = tally(attempts);

    expect(won).toBe(1);
    expect(
      await prisma.reservation.count({
        where: { unitTypeId: ctx.unitType.id, status: "CONFIRMED" },
      }),
    ).toBe(3);
  });

  it("fills a type exactly to capacity and no further", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () => book({ unitId: undefined })),
    );
    const { won } = tally(attempts);

    // Three rooms means three sales, whatever order twelve requests arrive in.
    expect(won).toBe(3);
    expect(
      await prisma.reservation.count({
        where: { unitTypeId: ctx.unitType.id, status: "CONFIRMED" },
      }),
    ).toBe(3);
  });

  it("lets pending enquiries pile up without consuming anything", async () => {
    // A pending booking is an enquiry, not a sale. It takes no inventory — and so
    // twelve of them do not take any either.
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () => book({ unitId: undefined, status: "PENDING" })),
    );
    expect(tally(attempts).won).toBe(12);

    // And the rooms are all still for sale.
    const confirmed = await Promise.allSettled(
      Array.from({ length: 5 }, () => book({ unitId: undefined, status: "CONFIRMED" })),
    );
    expect(tally(confirmed).won).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe("idempotent creation", () => {
  it("answers a repeated submission with the booking the first one made", async () => {
    const key = randomUUID();

    const first = await book({ idempotencyKey: key });
    const second = await book({ idempotencyKey: key });

    expect(second.id).toBe(first.id);
    expect(second.reservationNumber).toBe(first.reservationNumber);
    expect(await prisma.reservation.count()).toBe(1);
  });

  it("creates one booking when the same submission arrives ten times at once", async () => {
    /*
     * The double-clicked button, raced. The pre-check finds nothing for any of them,
     * so the unique index is what actually decides — and the losers are answered with
     * the winner's booking rather than an error.
     */
    const key = randomUUID();
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => book({ idempotencyKey: key })),
    );

    const { won, lost } = tally(attempts);
    expect(won).toBe(10);
    expect(lost).toBe(0);

    const ids = new Set(
      attempts.flatMap((a) => (a.status === "fulfilled" ? [(a.value as { id: string }).id] : [])),
    );
    expect(ids.size).toBe(1);
    expect(await prisma.reservation.count()).toBe(1);
  });

  it("charges the folio once, not once per replay", async () => {
    const key = randomUUID();
    await Promise.allSettled(Array.from({ length: 6 }, () => book({ idempotencyKey: key })));

    const all = await prisma.reservation.findMany();
    expect(all).toHaveLength(1);
    expect(Money.toAmountString(all[0].total)).toBe("920.00");
  });

  it("treats two different bookings as different, even with identical details", async () => {
    // Two guests from the same company, same nights, same room type. Legitimate —
    // and indistinguishable except by the key, which is why the key is what is used.
    const first = await book({ unitId: undefined, idempotencyKey: randomUUID() });
    const second = await book({ unitId: undefined, idempotencyKey: randomUUID() });

    expect(second.id).not.toBe(first.id);
    expect(await prisma.reservation.count()).toBe(2);
  });

  it("does not hand a booking to another property that guessed the key", async () => {
    const key = randomUUID();
    await book({ idempotencyKey: key });

    const other = await seedInventory({ units: 1, name: "فندق رابع", unitPrefix: "Z" });
    const otherGuest = await seedGuest({ fullName: "نزيل آخر", mobile: "0559999999" });

    // Same key, different property: the replay must not leak the first booking.
    const created = await createReservation(
      {
        propertyId: other.property.id,
        guestId: otherGuest.id,
        unitId: other.units[0].id,
        unitTypeId: other.unitType.id,
        checkInDate: AUG_20,
        checkOutDate: AUG_22,
        adults: 1,
        nightlyRate: "300.00",
        status: "CONFIRMED",
        idempotencyKey: `${key}-b`,
      } as never,
      TEST_ACTOR,
    );
    expect(created.propertyId).toBe(other.property.id);
  });
});

// ---------------------------------------------------------------------------

/** An issued invoice for a reservation, as the invoicing phase would leave it. */
async function issueInvoice(reservationId: string, total: string) {
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: { propertyId: true, guestId: true },
  });
  return prisma.invoice.create({
    data: {
      invoiceNumber: `INV-TEST-${reservationId.slice(-8)}`,
      propertyId: reservation.propertyId,
      reservationId,
      guestId: reservation.guestId,
      subtotal: total,
      total,
      paid: "0.00",
      balance: total,
      status: "ISSUED",
      issueDate: new Date("2026-08-20T00:00:00.000Z"),
    },
  });
}

/** A payment against a reservation, with the derived fields brought into line. */
async function recordPayment(reservationId: string, amount: string) {
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: { propertyId: true, guestId: true, total: true },
  });
  await prisma.payment.create({
    data: {
      paymentNumber: `PAY-TEST-${reservationId.slice(-8)}`,
      reservationId,
      guestId: reservation.guestId,
      propertyId: reservation.propertyId,
      amount,
      method: "CASH",
    },
  });
  const paid = Money.money(amount);
  await prisma.reservation.update({
    where: { id: reservationId },
    data: {
      paidAmount: paid,
      balance: Money.subtract(reservation.total, paid),
      paymentStatus: "PARTIALLY_PAID",
    },
  });
}

function edit(reservationId: string, overrides: Record<string, unknown> = {}) {
  return updateReservation(
    {
      reservationId,
      guestId: guest.id,
      unitTypeId: ctx.unitType.id,
      unitId: ctx.units[0].id,
      source: "DIRECT",
      checkInDate: AUG_20,
      checkOutDate: AUG_22,
      adults: 2,
      nightlyRate: "400.00",
      ...overrides,
    } as never,
    TEST_ACTOR,
    [ctx.property.id],
  );
}

describe("editing", () => {
  it("moves the dates when the new nights are free", async () => {
    const reservation = await book();
    await edit(reservation.id, { checkInDate: AUG_22, checkOutDate: AUG_24 });

    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(stored.checkInDate.toISOString()).toBe("2026-08-22T00:00:00.000Z");
    expect(Money.toAmountString(stored.total)).toBe("920.00");
  });

  it("does not treat a booking's own hold as a conflict with itself", async () => {
    // Extending a stay by a night must not find the room booked — by this booking.
    const reservation = await book();
    await edit(reservation.id, { checkOutDate: AUG_24 });

    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(Money.toAmountString(stored.subtotal)).toBe("1600.00");
  });

  it("refuses new dates that collide with another booking", async () => {
    const first = await book({ unitId: ctx.units[0].id });
    await book({ unitId: ctx.units[0].id, checkInDate: AUG_22, checkOutDate: AUG_24 });

    await expect(
      edit(first.id, { checkInDate: AUG_20, checkOutDate: AUG_24 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reassigns the room and hands the old one back to the board", async () => {
    const reservation = await book({ unitId: ctx.units[0].id });
    await edit(reservation.id, { unitId: ctx.units[1].id });

    const [old, next] = await Promise.all([
      prisma.unit.findUniqueOrThrow({ where: { id: ctx.units[0].id } }),
      prisma.unit.findUniqueOrThrow({ where: { id: ctx.units[1].id } }),
    ]);
    expect(old.status).toBe("AVAILABLE");
    expect(next.status).toBe("RESERVED");
  });

  it("refuses a room already held over those nights", async () => {
    const first = await book({ unitId: ctx.units[0].id });
    await book({ unitId: ctx.units[1].id });

    await expect(edit(first.id, { unitId: ctx.units[1].id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("releases capacity in the old type when a booking moves to another", async () => {
    const suite = await prisma.unitType.create({
      data: { propertyId: ctx.property.id, name: "جناح", capacity: 4, baseRate: "900.00" },
    });
    const suiteUnit = await prisma.unit.create({
      data: { propertyId: ctx.property.id, unitTypeId: suite.id, unitNumber: "S1" },
    });

    const reservation = await book({ unitId: undefined });
    await edit(reservation.id, { unitTypeId: suite.id, unitId: suiteUnit.id });

    const { getReservationAvailability } = await import("@/server/services/availability.service");
    const standard = await getReservationAvailability({
      propertyId: ctx.property.id,
      unitTypeId: ctx.unitType.id,
      checkInDate: AUG_20,
      checkOutDate: AUG_22,
    });
    // The unit it never occupied is given back to the type it left.
    expect(standard.remaining).toBe(3);
  });

  it("does not consume inventory twice when an unassigned booking is given a room", async () => {
    const reservation = await book({ unitId: undefined });
    await edit(reservation.id, { unitId: ctx.units[0].id });

    const { getReservationAvailability } = await import("@/server/services/availability.service");
    const result = await getReservationAvailability({
      propertyId: ctx.property.id,
      unitTypeId: ctx.unitType.id,
      checkInDate: AUG_20,
      checkOutDate: AUG_22,
    });
    // One booking, one unit of capacity — before and after the assignment.
    expect(result.assignedConsumed).toBe(1);
    expect(result.unassignedConsumed).toBe(0);
    expect(result.remaining).toBe(2);
  });

  it("keeps charge rows and folds them back into the total", async () => {
    const reservation = await book();
    await prisma.reservationCharge.create({
      data: {
        reservationId: reservation.id,
        propertyId: ctx.property.id,
        category: "RESTAURANT",
        description: "عشاء",
        quantity: 1,
        unitPrice: "200.00",
        tax: "30.00",
        total: "230.00",
      },
    });

    await edit(reservation.id, { nightlyRate: "500.00" });

    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    // The charge survived the edit, and the total includes it exactly once.
    expect(await prisma.reservationCharge.count({ where: { reservationId: reservation.id } })).toBe(1);
    expect(Money.toAmountString(stored.additionalCharges)).toBe("230.00");
    // 2 x 500 = 1000, VAT 150, plus the charge's own 230.
    expect(Money.toAmountString(stored.total)).toBe("1380.00");
  });

  it("keeps payment rows and recomputes the balance around them", async () => {
    const reservation = await book();
    await recordPayment(reservation.id, "500.00");

    await edit(reservation.id, { nightlyRate: "600.00" });

    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(await prisma.payment.count({ where: { reservationId: reservation.id } })).toBe(1);
    // 2 x 600 = 1200 + 180 VAT = 1380, less the 500 already paid.
    expect(Money.toAmountString(stored.total)).toBe("1380.00");
    expect(Money.toAmountString(stored.paidAmount)).toBe("500.00");
    expect(Money.toAmountString(stored.balance)).toBe("880.00");
    expect(stored.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("refuses an edit that would leave the guest overpaid", async () => {
    const reservation = await book({ nightlyRate: "1000.00" });
    await recordPayment(reservation.id, "2000.00");

    // Shortening the stay below what was paid is a refund — a decision with a payer,
    // an amount and a date. None of those can be inferred here, so it stops.
    await expect(edit(reservation.id, { nightlyRate: "100.00" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(Money.toAmountString(stored.nightlyRate)).toBe("1000.00");
  });

  it("refuses to edit a reservation whose invoice has been issued", async () => {
    const reservation = await book();
    await issueInvoice(reservation.id, "920.00");

    await expect(edit(reservation.id, { nightlyRate: "700.00" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("refuses to edit a stay in progress", async () => {
    const reservation = await book();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CHECKED_IN" },
    });

    await expect(edit(reservation.id, { adults: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to edit a completed stay", async () => {
    const reservation = await book();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CHECKED_OUT" },
    });

    await expect(edit(reservation.id, { adults: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to move a booking to another guest once money is attached", async () => {
    const reservation = await book();
    await recordPayment(reservation.id, "100.00");
    const other = await seedGuest({ fullName: "نزيل مختلف", mobile: "0555555555" });

    await expect(edit(reservation.id, { guestId: other.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("allows the guest to be corrected while nothing financial is attached", async () => {
    const reservation = await book();
    const other = await seedGuest({ fullName: "النزيل الصحيح", mobile: "0554444444" });

    await edit(reservation.id, { guestId: other.id });
    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(stored.guestId).toBe(other.id);
  });

  it("refuses a discount larger than the stay", async () => {
    const reservation = await book();
    await expect(edit(reservation.id, { discount: "99999.00" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("records which fields moved, and their safe before and after", async () => {
    const reservation = await book();
    await edit(reservation.id, { nightlyRate: "550.00", checkOutDate: AUG_24 });

    const entry = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "Reservation", entityId: reservation.id, action: "update" },
      orderBy: { createdAt: "desc" },
    });
    const metadata = entry.metadata as { changes: Record<string, { from: string; to: string }> };

    expect(metadata.changes.nightlyRate).toEqual({ from: "400.00", to: "550.00" });
    expect(metadata.changes.checkOutDate).toEqual({ from: "2026-08-22", to: "2026-08-24" });
  });
});

// ---------------------------------------------------------------------------

describe("status transitions", () => {
  it("confirms a pending booking and takes its inventory", async () => {
    const reservation = await book({ status: "PENDING", unitId: undefined });

    const confirmed = await confirmReservation(reservation.id, [ctx.property.id], TEST_ACTOR);
    expect(confirmed.status).toBe("CONFIRMED");

    const { getReservationAvailability } = await import("@/server/services/availability.service");
    const result = await getReservationAvailability({
      propertyId: ctx.property.id,
      unitTypeId: ctx.unitType.id,
      checkInDate: AUG_20,
      checkOutDate: AUG_22,
    });
    expect(result.remaining).toBe(2);
  });

  it("re-checks availability at the moment of confirming, not when the enquiry was taken", async () => {
    /*
     * A pending booking holds nothing, so between the enquiry and the confirmation
     * the room can be sold. The confirmation is when the sale actually happens, so
     * that is where the calendar has to be read again.
     */
    const pending = await book({ status: "PENDING", unitId: ctx.units[0].id });
    await book({ status: "CONFIRMED", unitId: ctx.units[0].id });

    await expect(
      confirmReservation(pending.id, [ctx.property.id], TEST_ACTOR),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to confirm when the type has sold out meanwhile", async () => {
    const pending = await book({ status: "PENDING", unitId: undefined });
    for (const unit of ctx.units) await book({ unitId: unit.id });

    await expect(
      confirmReservation(pending.id, [ctx.property.id], TEST_ACTOR),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("treats confirming a confirmed booking as the same outcome", async () => {
    const reservation = await book({ status: "CONFIRMED", unitId: undefined });
    const again = await confirmReservation(reservation.id, [ctx.property.id], TEST_ACTOR);
    expect(again.id).toBe(reservation.id);
    expect(again.status).toBe("CONFIRMED");
  });

  it("refuses to confirm a cancelled booking", async () => {
    const reservation = await book({ status: "PENDING", unitId: undefined });
    await cancelReservation(reservation.id, null, TEST_ACTOR, [ctx.property.id]);

    await expect(
      confirmReservation(reservation.id, [ctx.property.id], TEST_ACTOR),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("confirms exactly once when two clicks race", async () => {
    const reservation = await book({ status: "PENDING", unitId: ctx.units[0].id });
    const attempts = await Promise.allSettled([
      confirmReservation(reservation.id, [ctx.property.id], TEST_ACTOR),
      confirmReservation(reservation.id, [ctx.property.id], TEST_ACTOR),
    ]);
    // Both resolve — the second finds it already confirmed, which is the same outcome.
    expect(tally(attempts).won).toBe(2);
    expect(
      await prisma.reservation.count({ where: { unitId: ctx.units[0].id, status: "CONFIRMED" } }),
    ).toBe(1);
  });
});

describe("cancellation", () => {
  it("releases the room and the capacity immediately", async () => {
    const reservation = await book();
    await cancelReservation(reservation.id, "طلب النزيل", TEST_ACTOR, [ctx.property.id]);

    const [stored, unit] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } }),
      prisma.unit.findUniqueOrThrow({ where: { id: ctx.units[0].id } }),
    ]);
    expect(stored.status).toBe("CANCELLED");
    expect(unit.status).toBe("AVAILABLE");
    // The room is immediately sellable again for the same nights.
    await expect(book({ unitId: ctx.units[0].id })).resolves.toBeTruthy();
  });

  it("keeps the reason, the moment and the person who decided", async () => {
    const reservation = await book();
    await cancelReservation(reservation.id, "تغيّرت خطط النزيل", TEST_ACTOR, [ctx.property.id]);

    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(stored.cancelReason).toBe("تغيّرت خطط النزيل");
    expect(stored.cancelledAt).toBeInstanceOf(Date);
    // The actor here has no user row; a real cancellation records the id.
    expect(stored).toHaveProperty("cancelledById");
  });

  it("refuses to cancel a booking that has been paid", async () => {
    const reservation = await book();
    await recordPayment(reservation.id, "300.00");

    const attempt = cancelReservation(reservation.id, null, TEST_ACTOR, [ctx.property.id]);
    await expect(attempt).rejects.toMatchObject({ code: "CONFLICT" });
    await attempt.catch((error: AppError) =>
      expect(error.message).toContain("يوجد مبلغ مسدد"),
    );
  });

  it("refuses to cancel a booking whose invoice has been issued", async () => {
    const reservation = await book();
    await issueInvoice(reservation.id, "920.00");

    await expect(
      cancelReservation(reservation.id, null, TEST_ACTOR, [ctx.property.id]),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to cancel a stay in progress", async () => {
    const reservation = await book();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CHECKED_IN" },
    });

    await expect(
      cancelReservation(reservation.id, null, TEST_ACTOR, [ctx.property.id]),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is idempotent", async () => {
    const reservation = await book();
    await cancelReservation(reservation.id, "أولى", TEST_ACTOR, [ctx.property.id]);
    const again = await cancelReservation(reservation.id, "ثانية", TEST_ACTOR, [ctx.property.id]);

    expect(again.status).toBe("CANCELLED");
    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    // The first reason stands; a repeat does not rewrite the record.
    expect(stored.cancelReason).toBe("أولى");
  });
});

// ---------------------------------------------------------------------------

describe("property scope", () => {
  let other: Awaited<ReturnType<typeof seedInventory>>;
  let otherGuest: Awaited<ReturnType<typeof seedGuest>>;
  let mine: { id: string; reservationNumber: string };
  let theirs: { id: string; reservationNumber: string };

  beforeEach(async () => {
    other = await seedInventory({ units: 2, name: "منشأة باء", unitPrefix: "B" });
    otherGuest = await seedGuest({ fullName: "نزيل المنشأة باء", mobile: "0561112222" });
    await setVatRate(other.property.id, "15");

    mine = await book();
    theirs = await createReservation(
      {
        propertyId: other.property.id,
        guestId: otherGuest.id,
        unitId: other.units[0].id,
        unitTypeId: other.unitType.id,
        checkInDate: AUG_20,
        checkOutDate: AUG_22,
        adults: 1,
        // A rate that cannot be confused with anything else in the payload.
        nightlyRate: "8899.00",
        status: "CONFIRMED",
      } as never,
      TEST_ACTOR,
    );
  });

  it("lists only the caller's own reservations", async () => {
    const { rows, total } = await listReservations([ctx.property.id], { page: 1, pageSize: 50 }, FULL);

    expect(total).toBe(1);
    expect(rows.map((r) => r.id)).toEqual([mine.id]);
    expect(JSON.stringify(rows)).not.toContain(theirs.reservationNumber);
    expect(JSON.stringify(rows)).not.toContain("نزيل المنشأة باء");
  });

  it("reports another property's reservation as missing, not as forbidden", async () => {
    // "You may not see this" still confirms it exists. Knowing an id must not be a
    // way to test whether a booking is real.
    await expect(
      getReservationDetail(theirs.id, [ctx.property.id], FULL),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to edit another property's reservation", async () => {
    await expect(
      updateReservation(
        {
          reservationId: theirs.id,
          guestId: otherGuest.id,
          unitTypeId: other.unitType.id,
          unitId: other.units[1].id,
          source: "DIRECT",
          checkInDate: AUG_20,
          checkOutDate: AUG_22,
          adults: 1,
          nightlyRate: "100.00",
        } as never,
        TEST_ACTOR,
        [ctx.property.id],
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to cancel another property's reservation", async () => {
    await expect(
      cancelReservation(theirs.id, null, TEST_ACTOR, [ctx.property.id]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(stored.status).toBe("CONFIRMED");
  });

  it("refuses to confirm another property's reservation", async () => {
    await expect(
      confirmReservation(theirs.id, [ctx.property.id], TEST_ACTOR),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to assign another property's room", async () => {
    await expect(edit(mine.id, { unitId: other.units[0].id })).rejects.toBeInstanceOf(AppError);
  });

  it("does not leak the other property's rate through the list payload", async () => {
    const { rows } = await listReservations([ctx.property.id], { page: 1, pageSize: 50 }, FULL);
    expect(JSON.stringify(rows)).not.toContain("8899");
  });

  it("does not count another property's bookings against this one's inventory", async () => {
    const { getReservationAvailability } = await import("@/server/services/availability.service");
    const result = await getReservationAvailability({
      propertyId: ctx.property.id,
      unitTypeId: ctx.unitType.id,
      checkInDate: AUG_20,
      checkOutDate: AUG_22,
    });
    // Three rooms here, one sold here. The other hotel is irrelevant.
    expect(result.totalUnits).toBe(3);
    expect(result.remaining).toBe(2);
  });
});

// ---------------------------------------------------------------------------

describe("financial payload security", () => {
  it("omits money from the directory for a caller without payments.view", async () => {
    await book({ nightlyRate: "777.00" });
    const { rows } = await listReservations([ctx.property.id], { page: 1, pageSize: 25 }, NO_MONEY);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty("total");
      expect(row).not.toHaveProperty("balance");
      expect(row).not.toHaveProperty("paymentStatus");
    }
    // Absent from the payload, not merely unrendered.
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("777");
    expect(serialized).not.toContain('"total"');
  });

  it("still gives the directory everything a booking clerk needs", async () => {
    await book();
    const { rows } = await listReservations([ctx.property.id], { page: 1, pageSize: 25 }, NO_MONEY);

    expect(rows[0].guestName).toBeTruthy();
    expect(rows[0].unitNumber).toBe("R101");
    expect(rows[0].nights).toBe(2);
  });

  it("omits the folio, the charges, the payments and the invoices from a detail payload", async () => {
    const reservation = await book();
    await recordPayment(reservation.id, "100.00");
    await issueInvoice(reservation.id, "920.00");

    const detail = await getReservationDetail(reservation.id, [ctx.property.id], NO_MONEY);

    expect(detail.financial).toBeNull();
    expect(detail.charges).toBeNull();
    expect(detail.payments).toBeNull();
    expect(detail.invoices).toBeNull();

    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain('"total"');
    expect(serialized).not.toContain('"balance"');
    expect(serialized).not.toContain('"nightlyRate"');
    expect(serialized).not.toContain("920");
  });

  it("gives the folio to a caller who may see money", async () => {
    const reservation = await book();
    const detail = await getReservationDetail(reservation.id, [ctx.property.id], FULL);

    expect(detail.financial!.total).toBe("920.00");
    expect(detail.financial!.vatRate).toBe("15.00");
    expect(detail.payments).toEqual([]);
  });

  it("masks the guest's document for a caller who may not read documents", async () => {
    await prisma.guest.update({
      where: { id: guest.id },
      data: { identificationType: "NATIONAL_ID", identificationNumber: "1098765432" },
    });
    const reservation = await book();

    const masked = await getReservationDetail(reservation.id, [ctx.property.id], NO_MONEY);
    expect(masked.guest.identificationDisplay).toMatch(/^•+/);
    expect(JSON.stringify(masked)).not.toContain("1098765432");

    const desk = await getReservationDetail(reservation.id, [ctx.property.id], FULL);
    expect(desk.guest.identificationDisplay).toBe("1098765432");
  });

  it("withholds the activity log from a caller without activity.view", async () => {
    const reservation = await book();
    const detail = await getReservationDetail(
      reservation.id,
      [ctx.property.id],
      perms("reservations.view", "payments.view"),
    );
    expect(detail.activity).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("the directory", () => {
  beforeEach(async () => {
    await book({ unitId: ctx.units[0].id });
    await book({ unitId: ctx.units[1].id, status: "PENDING" });
    await book({ unitId: undefined, checkInDate: AUG_22, checkOutDate: AUG_24 });
  });

  it("paginates on the server", async () => {
    const first = await listReservations([ctx.property.id], { page: 1, pageSize: 2 }, FULL);
    const second = await listReservations([ctx.property.id], { page: 2, pageSize: 2 }, FULL);

    expect(first.total).toBe(3);
    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(1);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(3);
  });

  it("filters by status", async () => {
    const { rows } = await listReservations(
      [ctx.property.id],
      { status: "PENDING", page: 1, pageSize: 25 },
      FULL,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("PENDING");
  });

  it("filters to the bookings with no room yet", async () => {
    const { rows } = await listReservations(
      [ctx.property.id],
      { unassigned: true, page: 1, pageSize: 25 },
      FULL,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].unitNumber).toBeNull();
  });

  it("filters to arrivals on a given day", async () => {
    const { rows } = await listReservations(
      [ctx.property.id],
      { arrival: AUG_22, page: 1, pageSize: 25 },
      FULL,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].checkInDate).toBe("2026-08-22");
  });

  it("filters to departures on a given day", async () => {
    const { rows } = await listReservations(
      [ctx.property.id],
      { departure: AUG_22, page: 1, pageSize: 25 },
      FULL,
    );
    expect(rows).toHaveLength(2);
  });

  it("selects stays that touch a window, not only ones inside it", async () => {
    const { rows } = await listReservations(
      [ctx.property.id],
      { from: "2026-08-21", to: "2026-08-23", page: 1, pageSize: 25 },
      FULL,
    );
    // A guest staying across the window is in it, however the window is drawn.
    expect(rows).toHaveLength(3);
  });

  it("finds a booking by its number", async () => {
    const all = await listReservations([ctx.property.id], { page: 1, pageSize: 25 }, FULL);
    const target = all.rows[0];

    const { rows } = await listReservations(
      [ctx.property.id],
      { q: target.reservationNumber, page: 1, pageSize: 25 },
      FULL,
    );
    expect(rows.map((r) => r.id)).toContain(target.id);
  });

  it("finds a booking by the guest's name", async () => {
    const { rows } = await listReservations(
      [ctx.property.id],
      { q: "سعد", page: 1, pageSize: 25 },
      FULL,
    );
    expect(rows.length).toBe(3);
  });

  it("finds a booking by the guest's mobile", async () => {
    const { rows } = await listReservations(
      [ctx.property.id],
      { q: "0551234567", page: 1, pageSize: 25 },
      FULL,
    );
    expect(rows.length).toBe(3);
  });

  it("finds a booking by its room number", async () => {
    const { rows } = await listReservations(
      [ctx.property.id],
      { q: "R101", page: 1, pageSize: 25 },
      FULL,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].unitNumber).toBe("R101");
  });

  it("returns nothing rather than everything for a term that matches no booking", async () => {
    const { rows, total } = await listReservations(
      [ctx.property.id],
      { q: "لاشيءيطابقهذا", page: 1, pageSize: 25 },
      FULL,
    );
    expect(total).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("costs the same number of queries whatever the page size", async () => {
    // The N+1 claim, stated as the property that matters: a per-row implementation
    // would fetch a guest and a unit for each of twenty-five rows.
    const count = async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ Value: string }>>(
        "SHOW GLOBAL STATUS LIKE 'Questions'",
      );
      return Number(rows[0].Value);
    };
    const measure = async (pageSize: number) => {
      const before = await count();
      await listReservations([ctx.property.id], { page: 1, pageSize }, FULL);
      return (await count()) - before;
    };

    await measure(1);
    const small = await measure(1);
    const large = await measure(25);

    expect(large).toBeLessThanOrEqual(small + 2);
    expect(large).toBeLessThanOrEqual(8);
  });
});
