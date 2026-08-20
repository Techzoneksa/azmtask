import "server-only";

import { z } from "zod";

import { ChargeCategory, ReservationStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import * as Money from "@/lib/money";
import { AppError, withDbErrors } from "@/server/errors";
import { IdSchema, MoneySchema, fieldErrors } from "@/server/validation";

import { recordActivity, type ActivityActor } from "./activity.service";
import { recalculateTotals } from "./reservation.service";

/**
 * Guest folio charges.
 *
 * Every service rendered gets its own row — a laundry item is not merged into a
 * running "extras" figure. That detail is what an invoice line needs, and what a
 * guest disputing a charge at checkout needs. The reservation keeps only the sum,
 * recomputed from these rows inside the same transaction that writes one.
 */

export const AddChargeSchema = z.object({
  reservationId: IdSchema,
  outletId: IdSchema.optional(),
  category: z.nativeEnum(ChargeCategory),
  description: z.string().trim().min(1, "الوصف مطلوب").max(255),
  quantity: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر").max(9999),
  unitPrice: MoneySchema,
  tax: MoneySchema.optional(),
  chargedAt: z.coerce.date().optional(),
});

export type AddChargeInput = z.input<typeof AddChargeSchema>;

export async function addCharge(
  rawInput: AddChargeInput,
  actor: ActivityActor,
) {
  const parsed = AddChargeSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات الخدمة غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;

  return withDbErrors("charge.add", () =>
    prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        select: {
          id: true,
          reservationNumber: true,
          propertyId: true,
          status: true,
        },
      });

      if (!reservation) throw new AppError("NOT_FOUND", "الحجز غير موجود.");

      if (
        reservation.status === ReservationStatus.CANCELLED ||
        reservation.status === ReservationStatus.CHECKED_OUT
      ) {
        throw new AppError(
          "CONFLICT",
          "لا يمكن إضافة خدمات على حجز ملغي أو تمت مغادرته.",
        );
      }

      const lineTotal = Money.add(
        Money.multiply(input.unitPrice, input.quantity),
        input.tax,
      );

      const charge = await tx.reservationCharge.create({
        data: {
          reservationId: reservation.id,
          propertyId: reservation.propertyId,
          outletId: input.outletId ?? null,
          category: input.category,
          description: input.description,
          quantity: Money.money(input.quantity),
          unitPrice: Money.money(input.unitPrice),
          tax: Money.money(input.tax),
          total: lineTotal,
          chargedAt: input.chargedAt ?? new Date(),
          createdById: actor.id,
        },
        select: {
          id: true,
          category: true,
          description: true,
          quantity: true,
          unitPrice: true,
          total: true,
          chargedAt: true,
        },
      });

      await recalculateTotals(tx, reservation.id);

      await recordActivity(
        {
          actor,
          propertyId: reservation.propertyId,
          module: "outlets",
          action: "charge",
          entityType: "ReservationCharge",
          entityId: charge.id,
          description: `إضافة خدمة (${input.description}) بمبلغ ${Money.toAmountString(lineTotal)} على الحجز ${reservation.reservationNumber}`,
          metadata: { category: input.category, reservationNumber: reservation.reservationNumber },
        },
        tx,
      );

      return charge;
    }),
  );
}

export async function listChargesForReservation(reservationId: string) {
  return withDbErrors("charge.listForReservation", () =>
    prisma.reservationCharge.findMany({
      where: { reservationId },
      orderBy: { chargedAt: "desc" },
      select: {
        id: true,
        category: true,
        description: true,
        quantity: true,
        unitPrice: true,
        tax: true,
        total: true,
        chargedAt: true,
        outlet: { select: { id: true, name: true } },
      },
    }),
  );
}
