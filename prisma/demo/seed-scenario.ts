import { addDays, nightsBetween } from "../../src/lib/datetime";
import { add, money, multiply, subtract } from "../../src/lib/money";

import type { PrismaClient } from "../../src/generated/prisma/client";

import { DEMO_BUSINESS_DATE, VAT_RATE } from "./constants";
import type { Random } from "./random";
import type { Foundation } from "./seed-foundation";
import type { PlannedStay, UnitRole } from "./seed-reservations";

/**
 * Turns the plan into records.
 *
 * Financial figures are computed with the same money utilities the application
 * uses, and every reservation's cached totals are written from its own components —
 * never typed in by hand. The validator afterwards re-derives all of them from the
 * child rows and refuses to pass if any disagree.
 *
 * Timestamps are all relative to the demo business date, so a payment is recorded
 * during the stay it belongs to rather than at whatever moment the seed ran.
 */


type Actor = { id: string; name: string; email: string; roles: string[] };

export type ScenarioResult = {
  reservationIds: string[];
  counts: Record<string, number>;
};

/** A plausible clock time on a given demo-relative day. */
function instantOn(dayOffset: number, hour: number, minute = 0): Date {
  const day = addDays(DEMO_BUSINESS_DATE, dayOffset);
  // Riyadh is UTC+3; stored instants are UTC.
  return new Date(day.getTime() + (hour - 3) * 3_600_000 + minute * 60_000);
}

function dayOffsetOf(date: Date): number {
  return Math.round((date.getTime() - DEMO_BUSINESS_DATE.getTime()) / 86_400_000);
}

const CHARGE_MENU = [
  { category: "LAUNDRY", description: "غسيل وكي — 4 قطع", unitPrice: "45.00", outlet: "مغسلة الفندق" },
  { category: "ROOM_SERVICE", description: "عشاء بالغرفة", unitPrice: "120.00", outlet: "خدمة الغرف" },
  { category: "ROOM_SERVICE", description: "إفطار إضافي", unitPrice: "65.00", outlet: "خدمة الغرف" },
  { category: "RESTAURANT", description: "عشاء بمطعم الشاطئ", unitPrice: "185.00", outlet: "مطعم الشاطئ" },
  { category: "EXTRA_BED", description: "سرير إضافي", unitPrice: "90.00", outlet: null },
  { category: "LATE_CHECKOUT", description: "مغادرة متأخرة حتى 18:00", unitPrice: "110.00", outlet: null },
  { category: "TRANSPORTATION", description: "توصيل من المطار", unitPrice: "150.00", outlet: null },
  { category: "MINIBAR", description: "مشروبات الميني بار", unitPrice: "35.00", outlet: "مقهى أروقة" },
] as const;

const PAYMENT_METHODS: ReadonlyArray<readonly [string, number]> = [
  ["CARD", 52],
  ["CASH", 24],
  ["BANK_TRANSFER", 20],
  ["OTHER", 4],
];

export async function seedScenario(
  prisma: PrismaClient,
  random: Random,
  foundation: Foundation,
  stays: PlannedStay[],
  roles: UnitRole[],
  actors: { reception: Actor; accountant: Actor; manager: Actor },
): Promise<ScenarioResult> {
  const reservationIds: string[] = [];
  const counts: Record<string, number> = {};
  const bump = (key: string, by = 1) => {
    counts[key] = (counts[key] ?? 0) + by;
  };

  let sequence = 0;
  const nextNumber = (prefix: string, index: number) =>
    `${prefix}-2026-${String(index).padStart(6, "0")}`;

  let paymentSeq = 0;
  let invoiceSeq = 0;

  for (const stay of stays) {
    sequence += 1;

    const unit = stay.unitIndex === null ? null : foundation.units[stay.unitIndex];
    const guestId = foundation.guestIds[stay.guestIndex % foundation.guestIds.length];
    const nights = nightsBetween(stay.checkIn, stay.checkOut);

    /*
     * The rate actually sold, not the rack rate: a small spread around the unit
     * type's base rate, so revenue reporting has something to show and two identical
     * rooms do not always carry the same price.
     */
    const baseRate = money(unit?.baseRate ?? "300.00");
    const rateFactor = random.pick(["0.90", "0.95", "1.00", "1.00", "1.05", "1.15"]);
    const nightlyRate = multiply(baseRate, rateFactor);

    const subtotal = multiply(nightlyRate, nights);
    const discount = random.chance(0.18)
      ? multiply(subtotal, random.pick(["0.05", "0.10"]))
      : money(0);
    const taxable = subtract(subtotal, discount);
    const tax = multiply(taxable, String(VAT_RATE / 100));

    const checkInOffset = dayOffsetOf(stay.checkIn);
    const checkOutOffset = dayOffsetOf(stay.checkOut);

    const reservation = await prisma.reservation.create({
      data: {
        reservationNumber: nextNumber("RES", sequence),
        propertyId: foundation.propertyId,
        guestId,
        unitId: unit?.id ?? null,
        unitTypeId: unit
          ? foundation.unitTypeIds[unit.typeKey]
          : foundation.unitTypeIds.standard,
        source: stay.source as never,
        checkInDate: stay.checkIn,
        checkOutDate: stay.checkOut,
        adults: random.weighted([[1, 25], [2, 50], [3, 15], [4, 10]]),
        children: random.chance(0.25) ? random.int(1, 2) : 0,
        nightlyRate,
        subtotal,
        discount,
        tax,
        additionalCharges: money(0),
        total: add(taxable, tax),
        paidAmount: money(0),
        balance: add(taxable, tax),
        status: stay.status as never,
        paymentStatus: "UNPAID",
        createdById: actors.reception.id,
        // Booked a few days before arrival, not at seed time.
        createdAt: instantOn(checkInOffset - random.int(1, 21), random.int(9, 20)),
        checkedInAt:
          stay.status === "CHECKED_IN" || stay.status === "CHECKED_OUT"
            ? instantOn(checkInOffset, random.int(14, 22), random.int(0, 59))
            : null,
        checkedOutAt:
          stay.status === "CHECKED_OUT"
            ? instantOn(checkOutOffset, random.int(7, 12), random.int(0, 59))
            : null,
        cancelledAt:
          stay.status === "CANCELLED"
            ? instantOn(checkInOffset - random.int(1, 10), random.int(9, 20))
            : null,
        cancelReason:
          stay.status === "CANCELLED"
            ? random.pick([
                "تغيير خطط السفر",
                "إلغاء من قناة الحجز",
                "حجز بديل بتاريخ آخر",
                "ظرف طارئ للنزيل",
              ])
            : null,
      },
      select: { id: true },
    });

    reservationIds.push(reservation.id);
    bump(`reservation.${stay.status}`);

    // Cancellations and no-shows carry no folio and no money.
    if (stay.status === "CANCELLED" || stay.status === "NO_SHOW") continue;

    // --- folio charges -----------------------------------------------------
    let chargesTotal = money(0);
    const hasCharges =
      stay.status === "CHECKED_OUT" || stay.status === "CHECKED_IN"
        ? random.chance(0.45)
        : false;

    if (hasCharges) {
      const items = random.shuffle([...CHARGE_MENU]).slice(0, random.int(1, 3));

      for (const item of items) {
        const quantity = random.int(1, 2);
        const lineNet = multiply(item.unitPrice, quantity);
        const lineTax = multiply(lineNet, String(VAT_RATE / 100));
        const lineTotal = add(lineNet, lineTax);

        await prisma.reservationCharge.create({
          data: {
            reservationId: reservation.id,
            propertyId: foundation.propertyId,
            outletId: item.outlet ? foundation.outletIds[item.outlet] : null,
            category: item.category as never,
            description: item.description,
            quantity,
            unitPrice: item.unitPrice,
            tax: lineTax,
            total: lineTotal,
            chargedAt: instantOn(
              Math.min(checkInOffset + random.int(0, Math.max(0, nights - 1)), checkOutOffset),
              random.int(10, 23),
            ),
            createdById: actors.reception.id,
            createdAt: instantOn(checkInOffset + random.int(0, Math.max(0, nights - 1)), random.int(10, 23)),
          },
        });

        chargesTotal = add(chargesTotal, lineTotal);
        bump("charge");
      }
    }

    const total = add(taxable, tax, chargesTotal);

    // --- payments ----------------------------------------------------------
    let paid = money(0);

    const settlement: "full" | "deposit" | "partial" | "unpaid" =
      stay.status === "CHECKED_OUT"
        ? "full"
        : stay.status === "CHECKED_IN"
          ? random.weighted([["full", 45], ["deposit", 35], ["partial", 20]] as const)
          : random.weighted([["deposit", 40], ["unpaid", 45], ["full", 15]] as const);

    const recordPayment = async (amount: ReturnType<typeof money>, dayOffset: number, hour: number) => {
      paymentSeq += 1;
      await prisma.payment.create({
        data: {
          paymentNumber: nextNumber("PAY", paymentSeq),
          reservationId: reservation.id,
          guestId,
          propertyId: foundation.propertyId,
          amount,
          method: random.weighted(PAYMENT_METHODS) as never,
          reference: random.chance(0.5) ? `REF${random.int(100000, 999999)}` : null,
          paymentDate: instantOn(dayOffset, hour, random.int(0, 59)),
          createdById: random.chance(0.5) ? actors.reception.id : actors.accountant.id,
          createdAt: instantOn(dayOffset, hour, random.int(0, 59)),
        },
      });
      paid = add(paid, amount);
      bump("payment");
    };

    if (settlement === "full") {
      await recordPayment(total, Math.max(checkOutOffset, checkInOffset), random.int(8, 12));
    } else if (settlement === "deposit") {
      const deposit = multiply(total, random.pick(["0.25", "0.30", "0.50"]));
      await recordPayment(deposit, checkInOffset - random.int(1, 7), random.int(10, 19));
    } else if (settlement === "partial") {
      const first = multiply(total, "0.50");
      await recordPayment(first, checkInOffset - random.int(1, 5), random.int(10, 18));
      await recordPayment(multiply(total, "0.25"), checkInOffset, random.int(15, 21));
    }

    // --- one deliberate refund case ----------------------------------------
    const isRefundCase =
      stay.role === "departing_today" && !counts["refund"] && settlement === "full";

    if (isRefundCase) {
      paymentSeq += 1;
      const refund = money("-150.00");
      await prisma.payment.create({
        data: {
          paymentNumber: nextNumber("PAY", paymentSeq),
          reservationId: reservation.id,
          guestId,
          propertyId: foundation.propertyId,
          amount: refund,
          method: "CARD",
          reference: `REFUND${random.int(10000, 99999)}`,
          notes: "استرجاع جزئي — تقصير ليلة واحدة بطلب النزيل",
          paymentDate: instantOn(0, 9, 30),
          createdById: actors.accountant.id,
          createdAt: instantOn(0, 9, 30),
        },
      });
      paid = add(paid, refund);
      bump("payment");
      bump("refund");
    }

    const balance = subtract(total, paid);
    const paymentStatus = balance.isZero()
      ? "PAID"
      : paid.isZero()
        ? "UNPAID"
        : "PARTIALLY_PAID";

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { additionalCharges: chargesTotal, total, paidAmount: paid, balance, paymentStatus },
    });

    // --- invoices ----------------------------------------------------------
    const needsInvoice =
      stay.status === "CHECKED_OUT" || (stay.status === "CHECKED_IN" && random.chance(0.3));

    if (needsInvoice) {
      invoiceSeq += 1;
      const invoiceStatus = balance.isZero()
        ? "PAID"
        : paid.isZero()
          ? "ISSUED"
          : "PARTIALLY_PAID";

      await prisma.invoice.create({
        data: {
          invoiceNumber: nextNumber("INV", invoiceSeq),
          propertyId: foundation.propertyId,
          reservationId: reservation.id,
          guestId,
          subtotal: add(subtotal, chargesTotal),
          discount,
          tax,
          total,
          paid,
          balance,
          status: invoiceStatus as never,
          issueDate: stay.checkOut,
          createdAt: instantOn(checkOutOffset, random.int(8, 12)),
        },
      });
      bump("invoice");
    }
  }

  return { reservationIds, counts };
}

export { instantOn, dayOffsetOf };
