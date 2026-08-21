import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { addCharge } from "@/server/services/charge.service";
import { issueInvoice } from "@/server/services/invoice.service";
import { recordPayment } from "@/server/services/payment.service";
import { createReservation } from "@/server/services/reservation.service";

import { TEST_ACTOR, resetDatabase, seedGuest, seedProperty, setVatRate } from "./helpers";

/**
 * Money.
 *
 * The invariant under test throughout: the reservation's cached figures always
 * equal what its child rows sum to. The schema notes warn about the failure where
 * payments say 1,000 and the reservation says 700 — these tests are what stop that
 * from ever being true.
 */

let ctx: Awaited<ReturnType<typeof seedProperty>>;
let guest: Awaited<ReturnType<typeof seedGuest>>;
let reservationId: string;

beforeEach(async () => {
  await resetDatabase();
  ctx = await seedProperty({ unitNumber: "101" });
  guest = await seedGuest();

  /*
   * Zero VAT, deliberately.
   *
   * This suite is about payments reconciling against a total: paidAmount summing from
   * the rows, the balance following it, the status derived from both. Tax is a
   * confound here — Stage 7 made the server compute it, and every figure below would
   * otherwise carry an extra term that has nothing to do with what is under test.
   * Tax arithmetic has its own tests in the booking-engine suite.
   */
  await setVatRate(ctx.property.id, "0");

  const reservation = await createReservation(
    {
      propertyId: ctx.property.id,
      guestId: guest.id,
      unitId: ctx.unit.id,
      unitTypeId: ctx.unitType.id,
      checkInDate: "2026-08-20",
      checkOutDate: "2026-08-23",
      adults: 2,
      nightlyRate: "450.00",
      status: "CONFIRMED",
    } as never,
    TEST_ACTOR,
  );
  reservationId = reservation.id;
});

async function reservationTotals() {
  return prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: {
      subtotal: true,
      additionalCharges: true,
      total: true,
      paidAmount: true,
      balance: true,
      paymentStatus: true,
    },
  });
}

describe("payments", () => {
  it("stores the amount at exact decimal precision", async () => {
    const payment = await recordPayment(
      { reservationId, amount: "333.33", method: "CARD" } as never,
      TEST_ACTOR,
    );

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { amount: true, paymentNumber: true, reservationId: true },
    });

    expect(stored.amount.toFixed(2)).toBe("333.33");
    expect(stored.paymentNumber).toMatch(/^PAY-2026-\d{6}$/);
    expect(stored.reservationId).toBe(reservationId);
  });

  it("moves the reservation to partially paid and updates the balance", async () => {
    await recordPayment({ reservationId, amount: "500.00", method: "CASH" } as never, TEST_ACTOR);

    const totals = await reservationTotals();
    expect(totals.paidAmount.toFixed(2)).toBe("500.00");
    expect(totals.balance.toFixed(2)).toBe("850.00");
    expect(totals.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("marks the reservation paid once the balance reaches zero", async () => {
    await recordPayment({ reservationId, amount: "1000.00", method: "CASH" } as never, TEST_ACTOR);
    await recordPayment({ reservationId, amount: "350.00", method: "CARD" } as never, TEST_ACTOR);

    const totals = await reservationTotals();
    expect(totals.paidAmount.toFixed(2)).toBe("1350.00");
    expect(totals.balance.toFixed(2)).toBe("0.00");
    expect(totals.paymentStatus).toBe("PAID");
  });

  it("keeps the cached paid amount equal to the sum of payment rows", async () => {
    // Amounts chosen so a float accumulator would drift.
    for (const amount of ["0.10", "0.20", "0.30", "10.05", "10.05"]) {
      await recordPayment({ reservationId, amount, method: "CASH" } as never, TEST_ACTOR);
    }

    const rows = await prisma.payment.aggregate({
      where: { reservationId },
      _sum: { amount: true },
    });
    const totals = await reservationTotals();

    expect(totals.paidAmount.toFixed(2)).toBe(rows._sum.amount?.toFixed(2));
    expect(totals.paidAmount.toFixed(2)).toBe("20.70");
  });

  it("records a refund as a negative payment", async () => {
    await recordPayment({ reservationId, amount: "1000.00", method: "CARD" } as never, TEST_ACTOR);
    await recordPayment({ reservationId, amount: "-250.00", method: "CARD" } as never, TEST_ACTOR);

    const totals = await reservationTotals();
    expect(totals.paidAmount.toFixed(2)).toBe("750.00");
    expect(totals.balance.toFixed(2)).toBe("600.00");
  });

  it("refuses a refund larger than what was actually received", async () => {
    await recordPayment({ reservationId, amount: "100.00", method: "CASH" } as never, TEST_ACTOR);

    await expect(
      recordPayment({ reservationId, amount: "-500.00", method: "CASH" } as never, TEST_ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses a zero payment", async () => {
    await expect(
      recordPayment({ reservationId, amount: "0", method: "CASH" } as never, TEST_ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses a payment against a reservation that does not exist", async () => {
    await expect(
      recordPayment({ reservationId: "missingid0000000000000000", amount: "10", method: "CASH" } as never, TEST_ACTOR),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a duplicate payment number at the database level", async () => {
    const payment = await recordPayment(
      { reservationId, amount: "10.00", method: "CASH" } as never,
      TEST_ACTOR,
    );
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });

    await expect(
      prisma.payment.create({
        data: {
          paymentNumber: stored.paymentNumber,
          reservationId,
          guestId: guest.id,
          propertyId: ctx.property.id,
          amount: "5.00",
          method: "CASH",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("folio charges", () => {
  it("keeps one row per service and sums them onto the reservation", async () => {
    await addCharge(
      { reservationId, category: "LAUNDRY", description: "غسيل ملابس", quantity: 2, unitPrice: "35.00" } as never,
      TEST_ACTOR,
    );
    await addCharge(
      { reservationId, category: "ROOM_SERVICE", description: "عشاء بالغرفة", quantity: 1, unitPrice: "120.50", tax: "18.08" } as never,
      TEST_ACTOR,
    );

    const charges = await prisma.reservationCharge.findMany({ where: { reservationId } });
    expect(charges).toHaveLength(2);

    const totals = await reservationTotals();
    // 70.00 + 138.58
    expect(totals.additionalCharges.toFixed(2)).toBe("208.58");
    expect(totals.total.toFixed(2)).toBe("1558.58");
    expect(totals.balance.toFixed(2)).toBe("1558.58");
  });

  it("refuses a charge on a cancelled reservation", async () => {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELLED" },
    });

    await expect(
      addCharge(
        { reservationId, category: "MINIBAR", description: "ماء", quantity: 1, unitPrice: "10" } as never,
        TEST_ACTOR,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a negative unit price", async () => {
    await expect(
      addCharge(
        { reservationId, category: "OTHER", description: "خصم", quantity: 1, unitPrice: "-50" } as never,
        TEST_ACTOR,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("invoices", () => {
  it("snapshots the reservation figures and links to it", async () => {
    await recordPayment({ reservationId, amount: "350.00", method: "CARD" } as never, TEST_ACTOR);
    const invoice = await issueInvoice(reservationId, TEST_ACTOR);

    expect(invoice.invoiceNumber).toMatch(/^INV-2026-\d{6}$/);
    expect(invoice.total.toFixed(2)).toBe("1350.00");
    expect(invoice.paid.toFixed(2)).toBe("350.00");
    expect(invoice.balance.toFixed(2)).toBe("1000.00");
    expect(invoice.status).toBe("PARTIALLY_PAID");

    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { reservation: { select: { id: true } }, guest: { select: { id: true } } },
    });
    expect(stored.reservation.id).toBe(reservationId);
    expect(stored.guest.id).toBe(guest.id);
  });

  it("keeps its figures when the reservation changes afterwards", async () => {
    const invoice = await issueInvoice(reservationId, TEST_ACTOR);

    await addCharge(
      { reservationId, category: "MINIBAR", description: "مشروبات", quantity: 4, unitPrice: "15.00" } as never,
      TEST_ACTOR,
    );

    const reread = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { total: true },
    });
    const totals = await reservationTotals();

    // The issued document keeps saying what the guest was handed.
    expect(reread.total.toFixed(2)).toBe("1350.00");
    expect(totals.total.toFixed(2)).toBe("1410.00");
  });

  it("rejects a duplicate invoice number", async () => {
    const invoice = await issueInvoice(reservationId, TEST_ACTOR);
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });

    await expect(
      prisma.invoice.create({
        data: {
          invoiceNumber: stored.invoiceNumber,
          propertyId: ctx.property.id,
          reservationId,
          guestId: guest.id,
          issueDate: new Date("2026-08-20T00:00:00Z"),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("history is protected", () => {
  it("refuses to delete a guest who has reservations", async () => {
    await expect(prisma.guest.delete({ where: { id: guest.id } })).rejects.toThrow();
  });

  it("refuses to delete a unit that has reservations", async () => {
    await expect(prisma.unit.delete({ where: { id: ctx.unit.id } })).rejects.toThrow();
  });

  it("refuses to delete a reservation that has payments", async () => {
    await recordPayment({ reservationId, amount: "10.00", method: "CASH" } as never, TEST_ACTOR);
    await expect(prisma.reservation.delete({ where: { id: reservationId } })).rejects.toThrow();
  });
});
