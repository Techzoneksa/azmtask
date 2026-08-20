import "server-only";

import { z } from "zod";

import { PaymentMethod } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import * as Money from "@/lib/money";
import { AppError, withDbErrors } from "@/server/errors";
import { IdSchema, SignedMoneySchema, fieldErrors } from "@/server/validation";

import { recordActivity, type ActivityActor } from "./activity.service";
import { nextDocumentNumber } from "./numbering";
import { recalculateTotals } from "./reservation.service";

/**
 * Payments.
 *
 * A payment is never just a row. Recording one has to move the reservation's paid
 * amount, balance and payment status with it, or the two disagree — the failure the
 * schema notes warn about, where the payments table says 1,000 and the reservation
 * says 700. So the insert and the recalculation share one transaction, and the
 * recalculation reads `SUM(payments.amount)` rather than adding to a cached figure:
 * a sum cannot drift, an increment can.
 *
 * Refunds are negative payments. That keeps one signed sum as the whole truth
 * instead of two columns that must be reconciled.
 */

export const RecordPaymentSchema = z.object({
  reservationId: IdSchema,
  amount: SignedMoneySchema,
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  paymentDate: z.coerce.date().optional(),
});

export type RecordPaymentInput = z.input<typeof RecordPaymentSchema>;

export async function recordPayment(
  rawInput: RecordPaymentInput,
  actor: ActivityActor,
) {
  const parsed = RecordPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات الدفعة غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;

  return withDbErrors("payment.record", () =>
    prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          guestId: true,
          paidAmount: true,
          status: true,
        },
      });

      if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

      // A refund cannot exceed what was actually received.
      if (Money.isNegative(input.amount)) {
        const refundable = Money.money(reservation.paidAmount);
        if (Money.money(input.amount).abs().greaterThan(refundable)) {
          throw new AppError(
            "VALIDATION",
            `مبلغ الاسترجاع أكبر من المبلغ المدفوع فعليًا (${Money.toAmountString(refundable)}).`,
            { fields: { amount: "المبلغ أكبر من الرصيد المدفوع" } },
          );
        }
      }

      const paymentNumber = await nextDocumentNumber(
        tx,
        "PAY",
        reservation.propertyId,
      );

      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          reservationId: reservation.id,
          guestId: reservation.guestId,
          propertyId: reservation.propertyId,
          amount: Money.money(input.amount),
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          paymentDate: input.paymentDate ?? new Date(),
          createdById: actor.id,
        },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          method: true,
          paymentDate: true,
        },
      });

      // Same transaction: the cached totals can never be observed out of step with
      // the payment that changed them.
      await recalculateTotals(tx, reservation.id);

      await recordActivity(
        {
          actor,
          propertyId: reservation.propertyId,
          module: "payments",
          action: Money.isNegative(input.amount) ? "refund" : "create",
          entityType: "Payment",
          entityId: payment.id,
          description: `تسجيل دفعة ${Money.toAmountString(payment.amount)} على الحجز ${reservation.reservationNumber}`,
          metadata: {
            paymentNumber,
            reservationNumber: reservation.reservationNumber,
            method: input.method,
          },
        },
        tx,
      );

      return payment;
    }),
  );
}

export async function listPaymentsForReservation(reservationId: string) {
  return withDbErrors("payment.listForReservation", () =>
    prisma.payment.findMany({
      where: { reservationId },
      orderBy: { paymentDate: "desc" },
      select: {
        id: true,
        paymentNumber: true,
        amount: true,
        method: true,
        reference: true,
        paymentDate: true,
      },
    }),
  );
}
