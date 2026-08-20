import "server-only";

import { InvoiceStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { businessToday } from "@/lib/datetime";
import * as Money from "@/lib/money";
import { AppError, withDbErrors } from "@/server/errors";

import { recordActivity, type ActivityActor } from "./activity.service";
import { nextDocumentNumber } from "./numbering";

/**
 * Invoices.
 *
 * An invoice is a snapshot, not a view. Its figures are copied from the reservation
 * at issue time and never recomputed, because the document handed to a guest must
 * keep saying what it said — a later adjustment to the booking creates a new
 * invoice, it does not rewrite the old one.
 *
 * The printable document arrives in Stage 13; this is the record it renders.
 */

export async function issueInvoice(
  reservationId: string,
  actor: ActivityActor,
) {
  return withDbErrors("invoice.issue", () =>
    prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          guestId: true,
          subtotal: true,
          discount: true,
          tax: true,
          additionalCharges: true,
          total: true,
          paidAmount: true,
        },
      });

      if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

      const invoiceNumber = await nextDocumentNumber(
        tx,
        "INV",
        reservation.propertyId,
      );

      const subtotal = Money.add(
        reservation.subtotal,
        reservation.additionalCharges,
      );
      const total = Money.money(reservation.total);
      const paid = Money.money(reservation.paidAmount);
      const balance = Money.subtract(total, paid);

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          propertyId: reservation.propertyId,
          reservationId: reservation.id,
          guestId: reservation.guestId,
          subtotal,
          discount: Money.money(reservation.discount),
          tax: Money.money(reservation.tax),
          total,
          paid,
          balance,
          status: deriveInvoiceStatus(total, paid, balance),
          issueDate: businessToday(),
        },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          paid: true,
          balance: true,
          status: true,
          issueDate: true,
        },
      });

      await recordActivity(
        {
          actor,
          propertyId: reservation.propertyId,
          module: "invoices",
          action: "issue",
          entityType: "Invoice",
          entityId: invoice.id,
          description: `إصدار الفاتورة ${invoiceNumber} للحجز ${reservation.reservationNumber}`,
          metadata: { invoiceNumber, total: Money.toAmountString(total) },
        },
        tx,
      );

      return invoice;
    }),
  );
}

function deriveInvoiceStatus(
  total: Money.Money,
  paid: Money.Money,
  balance: Money.Money,
): InvoiceStatus {
  if (Money.isZero(paid)) return InvoiceStatus.ISSUED;
  if (balance.lessThanOrEqualTo(0)) return InvoiceStatus.PAID;
  return InvoiceStatus.PARTIALLY_PAID;
}

export async function listInvoicesForReservation(reservationId: string) {
  return withDbErrors("invoice.listForReservation", () =>
    prisma.invoice.findMany({
      where: { reservationId },
      orderBy: { issueDate: "desc" },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        paid: true,
        balance: true,
        status: true,
        issueDate: true,
      },
    }),
  );
}
