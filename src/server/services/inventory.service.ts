import "server-only";

import { z } from "zod";

import { StockMovementType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import * as Money from "@/lib/money";
import { AppError, withDbErrors } from "@/server/errors";
import { IdSchema, fieldErrors } from "@/server/validation";

import { recordActivity, type ActivityActor } from "./activity.service";

/**
 * Inventory.
 *
 * Stock is only ever changed by recording a movement. Nothing writes an item's
 * quantity directly — not the UI, not an import, not an "adjust to" form — because
 * a quantity set from a client-supplied figure is a quantity with no history and no
 * way to find out how it got wrong.
 *
 * Movements are stored signed: STOCK_OUT rows are negative, so `SUM(quantity)` is
 * the item's true stock with no case analysis. The item's cached quantity is
 * recomputed from that sum inside the same transaction as the movement, and the item
 * row is locked first so two simultaneous issues cannot both read the old total.
 */

export const RecordMovementSchema = z.object({
  itemId: IdSchema,
  type: z.nativeEnum(StockMovementType),
  /** Magnitude for STOCK_IN and STOCK_OUT; signed delta for ADJUSTMENT. */
  quantity: z.coerce.number().refine((value) => value !== 0, "الكمية لا يمكن أن تكون صفرًا"),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type RecordMovementInput = z.input<typeof RecordMovementSchema>;

export async function recordMovement(
  rawInput: RecordMovementInput,
  actor: ActivityActor,
) {
  const parsed = RecordMovementSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات حركة المخزون غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;

  return withDbErrors("inventory.recordMovement", () =>
    prisma.$transaction(async (tx) => {
      // Serialise concurrent movements for this item behind the row lock.
      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        "SELECT `id` FROM `inventory_items` WHERE `id` = ? FOR UPDATE",
        input.itemId,
      );
      if (locked.length === 0) {
        throw new AppError("NOT_FOUND", "الصنف غير موجود.");
      }

      const item = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: input.itemId },
        select: { id: true, name: true, propertyId: true, quantity: true },
      });

      const magnitude = Math.abs(input.quantity);
      const signed =
        input.type === StockMovementType.STOCK_OUT
          ? -magnitude
          : input.type === StockMovementType.STOCK_IN
            ? magnitude
            : input.quantity;

      const projected = Money.add(item.quantity, signed);
      if (Money.isNegative(projected)) {
        throw new AppError(
          "VALIDATION",
          `الكمية المطلوبة أكبر من الرصيد المتاح (${Money.toAmountString(item.quantity)}).`,
          { fields: { quantity: "الكمية أكبر من الرصيد المتاح" } },
        );
      }

      const movement = await tx.inventoryTransaction.create({
        data: {
          itemId: item.id,
          propertyId: item.propertyId,
          type: input.type,
          quantity: Money.money(signed),
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          createdById: actor.id,
        },
        select: { id: true, type: true, quantity: true, createdAt: true },
      });

      // Recomputed from the movement history, never incremented from the old value.
      const totals = await tx.inventoryTransaction.aggregate({
        where: { itemId: item.id },
        _sum: { quantity: true },
      });

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: Money.money(totals._sum.quantity) },
      });

      await recordActivity(
        {
          actor,
          propertyId: item.propertyId,
          module: "inventory",
          action: input.type.toLowerCase(),
          entityType: "InventoryItem",
          entityId: item.id,
          description: `حركة مخزون (${input.type}) على الصنف ${item.name} بمقدار ${signed}`,
          metadata: { movementId: movement.id, reference: input.reference ?? null },
        },
        tx,
      );

      return movement;
    }),
  );
}

/** Items at or below their reorder point. */
export async function lowStockItems(propertyId: string) {
  return withDbErrors("inventory.lowStock", () =>
    prisma.$queryRawUnsafe<
      Array<{ id: string; name: string; quantity: string; minimumQuantity: string }>
    >(
      "SELECT `id`, `name`, `quantity`, `minimumQuantity` FROM `inventory_items` " +
        "WHERE `propertyId` = ? AND `status` = 'ACTIVE' AND `quantity` <= `minimumQuantity` " +
        "ORDER BY (`quantity` - `minimumQuantity`) ASC LIMIT 100",
      propertyId,
    ),
  );
}
