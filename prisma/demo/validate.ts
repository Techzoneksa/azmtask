import { nightsBetween } from "../../src/lib/datetime";
import { add, money, subtract } from "../../src/lib/money";

import type { PrismaClient } from "../../src/generated/prisma/client";

import { DEMO_BUSINESS_DATE } from "./constants";
import { findDemoProperty } from "./reset";

/**
 * Demo integrity validator.
 *
 * Re-derives every stored figure from the rows underneath it and reports any
 * disagreement. This is the difference between a demo that looks plausible and one
 * that survives a client adding up a column: if a reservation says 1,350 paid, the
 * payment rows have to sum to 1,350 — checked with exact decimal comparison, not a
 * tolerance.
 */

export type Violation = { check: string; detail: string };

export type ValidationReport = {
  propertyId: string | null;
  checks: Array<{ name: string; passed: number; failed: number }>;
  violations: Violation[];
  ok: boolean;
};

/** Statuses that hold inventory and therefore must never overlap on one unit. */
const BLOCKING = ["CONFIRMED", "CHECKED_IN"] as const;

export async function validateDemo(prisma: PrismaClient): Promise<ValidationReport> {
  const propertyId = await findDemoProperty(prisma);
  const violations: Violation[] = [];
  const checks: ValidationReport["checks"] = [];

  if (!propertyId) {
    return {
      propertyId: null,
      checks: [],
      violations: [{ check: "property", detail: "لا توجد منشأة عرض في قاعدة البيانات." }],
      ok: false,
    };
  }

  const track = (name: string, passed: number, failed: number) =>
    checks.push({ name, passed, failed });

  // -------------------------------------------------------------------------
  // Reservations: dates, ownership, and no overlapping holds
  // -------------------------------------------------------------------------
  const reservations = await prisma.reservation.findMany({
    where: { propertyId },
    select: {
      id: true, reservationNumber: true, status: true, paymentStatus: true,
      checkInDate: true, checkOutDate: true, nightlyRate: true,
      subtotal: true, discount: true, tax: true, additionalCharges: true,
      total: true, paidAmount: true, balance: true,
      unitId: true, unitTypeId: true, guestId: true,
      unit: { select: { propertyId: true, unitTypeId: true } },
    },
  });

  let datesOk = 0;
  for (const reservation of reservations) {
    if (nightsBetween(reservation.checkInDate, reservation.checkOutDate) >= 1) {
      datesOk += 1;
    } else {
      violations.push({
        check: "reservation.dates",
        detail: `${reservation.reservationNumber}: تاريخ المغادرة ليس بعد الوصول`,
      });
    }
  }
  track("reservation dates", datesOk, reservations.length - datesOk);

  let ownershipOk = 0;
  for (const reservation of reservations) {
    if (!reservation.unit) {
      ownershipOk += 1;
      continue;
    }
    if (reservation.unit.propertyId !== propertyId) {
      violations.push({
        check: "reservation.unit.property",
        detail: `${reservation.reservationNumber}: الوحدة تتبع منشأة أخرى`,
      });
    } else if (reservation.unit.unitTypeId !== reservation.unitTypeId) {
      violations.push({
        check: "reservation.unit.type",
        detail: `${reservation.reservationNumber}: نوع الوحدة لا يطابق الوحدة المسنَدة`,
      });
    } else {
      ownershipOk += 1;
    }
  }
  track("reservation unit ownership", ownershipOk, reservations.length - ownershipOk);

  // Overlap: compared pairwise within each unit's blocking reservations.
  const byUnit = new Map<string, typeof reservations>();
  for (const reservation of reservations) {
    if (!reservation.unitId) continue;
    if (!(BLOCKING as readonly string[]).includes(reservation.status)) continue;
    const list = byUnit.get(reservation.unitId) ?? [];
    list.push(reservation);
    byUnit.set(reservation.unitId, list);
  }

  let overlapChecked = 0;
  let overlaps = 0;
  for (const [unitId, list] of byUnit) {
    const sorted = [...list].sort((a, b) => a.checkInDate.getTime() - b.checkInDate.getTime());
    for (let i = 1; i < sorted.length; i++) {
      overlapChecked += 1;
      if (sorted[i].checkInDate.getTime() < sorted[i - 1].checkOutDate.getTime()) {
        overlaps += 1;
        violations.push({
          check: "reservation.overlap",
          detail: `الوحدة ${unitId}: ${sorted[i - 1].reservationNumber} يتقاطع مع ${sorted[i].reservationNumber}`,
        });
      }
    }
  }
  track("no overlapping holds", overlapChecked - overlaps, overlaps);

  // -------------------------------------------------------------------------
  // Financial reconciliation, per reservation
  // -------------------------------------------------------------------------
  const chargeSums = await prisma.reservationCharge.groupBy({
    by: ["reservationId"],
    where: { propertyId },
    _sum: { total: true },
  });
  const chargeByReservation = new Map(
    chargeSums.map((row) => [row.reservationId, money(row._sum.total)]),
  );

  const paymentSums = await prisma.payment.groupBy({
    by: ["reservationId"],
    where: { propertyId },
    _sum: { amount: true },
  });
  const paidByReservation = new Map(
    paymentSums.map((row) => [row.reservationId, money(row._sum.amount)]),
  );

  let financeOk = 0;
  for (const reservation of reservations) {
    const problems: string[] = [];

    if (reservation.status === "CANCELLED" || reservation.status === "NO_SHOW") {
      financeOk += 1;
      continue;
    }

    // subtotal = nightlyRate x nights
    const nights = nightsBetween(reservation.checkInDate, reservation.checkOutDate);
    const expectedSubtotal = money(reservation.nightlyRate).times(nights);
    if (!money(reservation.subtotal).equals(expectedSubtotal)) {
      problems.push(
        `subtotal=${reservation.subtotal.toFixed(2)} بينما ${nights}×${reservation.nightlyRate.toFixed(2)}=${expectedSubtotal.toFixed(2)}`,
      );
    }

    // additionalCharges = SUM(charges.total)
    const charges = chargeByReservation.get(reservation.id) ?? money(0);
    if (!money(reservation.additionalCharges).equals(charges)) {
      problems.push(
        `additionalCharges=${reservation.additionalCharges.toFixed(2)} بينما مجموع الرسوم=${charges.toFixed(2)}`,
      );
    }

    // total = subtotal - discount + tax + charges
    const expectedTotal = add(
      subtract(reservation.subtotal, reservation.discount),
      reservation.tax,
      charges,
    );
    if (!money(reservation.total).equals(expectedTotal)) {
      problems.push(
        `total=${reservation.total.toFixed(2)} بينما المحسوب=${expectedTotal.toFixed(2)}`,
      );
    }

    // paidAmount = SUM(payments.amount)
    const paid = paidByReservation.get(reservation.id) ?? money(0);
    if (!money(reservation.paidAmount).equals(paid)) {
      problems.push(
        `paidAmount=${reservation.paidAmount.toFixed(2)} بينما مجموع الدفعات=${paid.toFixed(2)}`,
      );
    }

    // balance = total - paidAmount
    const expectedBalance = subtract(reservation.total, reservation.paidAmount);
    if (!money(reservation.balance).equals(expectedBalance)) {
      problems.push(
        `balance=${reservation.balance.toFixed(2)} بينما المحسوب=${expectedBalance.toFixed(2)}`,
      );
    }

    // paymentStatus follows from the balance, never set independently
    const expectedStatus = money(reservation.balance).isZero()
      ? "PAID"
      : money(reservation.paidAmount).isZero()
        ? "UNPAID"
        : "PARTIALLY_PAID";
    if (reservation.paymentStatus !== expectedStatus && reservation.paymentStatus !== "REFUNDED") {
      problems.push(`paymentStatus=${reservation.paymentStatus} بينما المتوقع=${expectedStatus}`);
    }

    if (problems.length === 0) {
      financeOk += 1;
    } else {
      violations.push({
        check: "reservation.financial",
        detail: `${reservation.reservationNumber}: ${problems.join(" | ")}`,
      });
    }
  }
  track("financial reconciliation", financeOk, reservations.length - financeOk);

  // -------------------------------------------------------------------------
  // Invoices
  // -------------------------------------------------------------------------
  const invoices = await prisma.invoice.findMany({
    where: { propertyId },
    select: {
      id: true, invoiceNumber: true, subtotal: true, discount: true, tax: true,
      total: true, paid: true, balance: true, status: true, reservationId: true,
    },
  });

  let invoiceOk = 0;
  for (const invoice of invoices) {
    const problems: string[] = [];

    const expectedBalance = subtract(invoice.total, invoice.paid);
    if (!money(invoice.balance).equals(expectedBalance)) {
      problems.push(
        `balance=${invoice.balance.toFixed(2)} بينما total-paid=${expectedBalance.toFixed(2)}`,
      );
    }

    const expectedStatus = money(invoice.balance).isZero()
      ? "PAID"
      : money(invoice.paid).isZero()
        ? "ISSUED"
        : "PARTIALLY_PAID";
    if (invoice.status !== expectedStatus && invoice.status !== "DRAFT" && invoice.status !== "CANCELLED") {
      problems.push(`status=${invoice.status} بينما المتوقع=${expectedStatus}`);
    }

    if (problems.length === 0) {
      invoiceOk += 1;
    } else {
      violations.push({
        check: "invoice.financial",
        detail: `${invoice.invoiceNumber}: ${problems.join(" | ")}`,
      });
    }
  }
  track("invoice reconciliation", invoiceOk, invoices.length - invoiceOk);

  // -------------------------------------------------------------------------
  // Unit operational state must be justified by real records
  // -------------------------------------------------------------------------
  const units = await prisma.unit.findMany({
    where: { propertyId },
    select: {
      id: true, unitNumber: true, status: true, housekeepingStatus: true,
      maintenanceStatus: true, notes: true,
      reservations: {
        where: { status: "CHECKED_IN" },
        select: { id: true, checkInDate: true, checkOutDate: true },
      },
      housekeepingTasks: {
        where: { status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } },
        select: { id: true, status: true },
      },
      maintenanceRequests: {
        where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
        select: { id: true },
      },
    },
  });

  let unitOk = 0;
  for (const unit of units) {
    const problems: string[] = [];
    const inHouse = unit.reservations.length > 0;
    const activeClean = unit.housekeepingTasks.length > 0;
    const activeFault = unit.maintenanceRequests.length > 0;

    if (unit.status === "OCCUPIED" && !inHouse) {
      problems.push("الحالة OCCUPIED بلا إقامة قائمة");
    }
    if (inHouse && unit.status !== "OCCUPIED") {
      problems.push(`يوجد نزيل مسجّل لكن الحالة ${unit.status}`);
    }
    if (unit.status === "MAINTENANCE" && !activeFault) {
      problems.push("الحالة MAINTENANCE بلا بلاغ صيانة مفتوح");
    }
    if (unit.maintenanceStatus === "OUT_OF_SERVICE" && !activeFault) {
      problems.push("خارج الخدمة بلا بلاغ صيانة مفتوح");
    }
    if (unit.status === "CLEANING" && !activeClean) {
      problems.push("الحالة CLEANING بلا مهمة نظافة قائمة");
    }
    if (unit.housekeepingStatus === "CLEANING" && !activeClean) {
      problems.push("حالة النظافة CLEANING بلا مهمة جارية");
    }
    if (unit.status === "AVAILABLE") {
      if (unit.housekeepingStatus === "DIRTY" || unit.housekeepingStatus === "CLEANING") {
        problems.push("متاحة رغم أنها غير نظيفة");
      }
      if (unit.maintenanceStatus !== "OPERATIONAL") {
        problems.push("متاحة رغم أنها خارج الخدمة");
      }
      if (activeClean) problems.push("متاحة رغم وجود مهمة نظافة قائمة");
    }
    if (unit.status === "BLOCKED" && !unit.notes?.trim()) {
      problems.push("محجوبة بلا سبب مسجّل في الملاحظات");
    }

    if (problems.length === 0) {
      unitOk += 1;
    } else {
      violations.push({
        check: "unit.state",
        detail: `الغرفة ${unit.unitNumber}: ${problems.join(" | ")}`,
      });
    }
  }
  track("unit state coherence", unitOk, units.length - unitOk);

  // -------------------------------------------------------------------------
  // Housekeeping task timestamps must match their status
  // -------------------------------------------------------------------------
  const tasks = await prisma.housekeepingTask.findMany({
    where: { propertyId },
    select: { id: true, status: true, startedAt: true, completedAt: true, unitId: true },
  });

  let taskOk = 0;
  for (const task of tasks) {
    const problems: string[] = [];
    if (task.status === "COMPLETED" && !task.completedAt) {
      problems.push("مكتملة بلا وقت إنهاء");
    }
    if (task.status !== "COMPLETED" && task.completedAt) {
      problems.push("غير مكتملة ولها وقت إنهاء");
    }
    if (task.status === "IN_PROGRESS" && !task.startedAt) {
      problems.push("جارية بلا وقت بدء");
    }
    if (task.status === "PENDING" && task.startedAt) {
      problems.push("معلّقة ولها وقت بدء");
    }
    if (task.completedAt && task.startedAt && task.completedAt < task.startedAt) {
      problems.push("وقت الإنهاء قبل وقت البدء");
    }

    if (problems.length === 0) {
      taskOk += 1;
    } else {
      violations.push({ check: "housekeeping.task", detail: `${task.id}: ${problems.join(" | ")}` });
    }
  }
  track("housekeeping timestamps", taskOk, tasks.length - taskOk);

  // -------------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------------
  const requests = await prisma.maintenanceRequest.findMany({
    where: { propertyId },
    select: { id: true, status: true, openedAt: true, completedAt: true },
  });

  let requestOk = 0;
  for (const request of requests) {
    const problems: string[] = [];
    if (request.status === "COMPLETED" && !request.completedAt) {
      problems.push("مكتمل بلا وقت إغلاق");
    }
    if (request.status !== "COMPLETED" && request.completedAt) {
      problems.push("غير مكتمل وله وقت إغلاق");
    }
    if (request.completedAt && request.completedAt < request.openedAt) {
      problems.push("وقت الإغلاق قبل وقت الفتح");
    }

    if (problems.length === 0) {
      requestOk += 1;
    } else {
      violations.push({ check: "maintenance.request", detail: `${request.id}: ${problems.join(" | ")}` });
    }
  }
  track("maintenance timestamps", requestOk, requests.length - requestOk);

  // -------------------------------------------------------------------------
  // Inventory ledger equals stored quantity
  // -------------------------------------------------------------------------
  const items = await prisma.inventoryItem.findMany({
    where: { propertyId },
    select: { id: true, name: true, quantity: true },
  });
  const movementSums = await prisma.inventoryTransaction.groupBy({
    by: ["itemId"],
    where: { propertyId },
    _sum: { quantity: true },
  });
  const ledger = new Map(movementSums.map((row) => [row.itemId, money(row._sum.quantity)]));

  let stockOk = 0;
  for (const item of items) {
    const fromLedger = ledger.get(item.id) ?? money(0);
    if (money(item.quantity).equals(fromLedger)) {
      stockOk += 1;
    } else {
      violations.push({
        check: "inventory.ledger",
        detail: `${item.name}: المخزون=${item.quantity.toFixed(2)} بينما مجموع الحركات=${fromLedger.toFixed(2)}`,
      });
    }
    if (money(item.quantity).isNegative()) {
      violations.push({ check: "inventory.negative", detail: `${item.name}: كمية سالبة` });
    }
  }
  track("inventory ledger", stockOk, items.length - stockOk);

  // -------------------------------------------------------------------------
  // The demo date must actually have something to show
  // -------------------------------------------------------------------------
  const arrivals = reservations.filter(
    (r) => r.checkInDate.getTime() === DEMO_BUSINESS_DATE.getTime() && r.status === "CONFIRMED",
  ).length;
  const departures = reservations.filter(
    (r) => r.checkOutDate.getTime() === DEMO_BUSINESS_DATE.getTime() && r.status === "CHECKED_IN",
  ).length;
  const occupied = units.filter((u) => u.status === "OCCUPIED").length;

  if (arrivals === 0) {
    violations.push({ check: "scenario.arrivals", detail: "لا توجد وصولات في تاريخ العرض" });
  }
  if (departures === 0) {
    violations.push({ check: "scenario.departures", detail: "لا توجد مغادرات في تاريخ العرض" });
  }
  if (occupied === 0) {
    violations.push({ check: "scenario.occupancy", detail: "لا توجد غرف مشغولة في تاريخ العرض" });
  }
  track("scenario has today's activity", 3 - (arrivals === 0 ? 1 : 0) - (departures === 0 ? 1 : 0) - (occupied === 0 ? 1 : 0), 0);

  return { propertyId, checks, violations, ok: violations.length === 0 };
}
