import { addDays } from "../../src/lib/datetime";
import { add, money } from "../../src/lib/money";

import type { PrismaClient } from "../../src/generated/prisma/client";

import { DEMO_BUSINESS_DATE } from "./constants";
import type { Random } from "./random";
import type { Foundation } from "./seed-foundation";
import { instantOn } from "./seed-scenario";

/**
 * Inventory and expenses.
 *
 * Stock is never written as a final figure. Each item is built by recording its
 * movements and letting the quantity fall out of them, exactly as the application
 * requires at runtime — so the ledger and the stored quantity agree by construction
 * rather than by coincidence.
 */

const INVENTORY = [
  { category: "مستلزمات الغرف", name: "شامبو 30 مل", unit: "حبة", minimum: 200, opening: 640 },
  { category: "مستلزمات الغرف", name: "صابون 25 جم", unit: "حبة", minimum: 200, opening: 700 },
  { category: "مستلزمات الغرف", name: "مناديل ورقية", unit: "كرتون", minimum: 15, opening: 42 },
  { category: "مستلزمات الغرف", name: "مياه معدنية 330 مل", unit: "كرتون", minimum: 25, opening: 60 },
  { category: "مستلزمات الغرف", name: "أطقم أسنان", unit: "حبة", minimum: 150, opening: 380 },
  { category: "مستلزمات الغرف", name: "نعال غرف", unit: "زوج", minimum: 100, opening: 260 },
  { category: "مواد النظافة", name: "منظف أرضيات", unit: "لتر", minimum: 40, opening: 95 },
  { category: "مواد النظافة", name: "منظف زجاج", unit: "لتر", minimum: 20, opening: 48 },
  { category: "مواد النظافة", name: "أكياس نفايات كبيرة", unit: "عبوة", minimum: 30, opening: 88 },
  { category: "مواد النظافة", name: "معطر جو", unit: "حبة", minimum: 25, opening: 55 },
  { category: "مواد النظافة", name: "قفازات تنظيف", unit: "زوج", minimum: 50, opening: 120 },
  { category: "الأغذية والمشروبات", name: "قهوة عربية", unit: "كيلو", minimum: 10, opening: 26 },
  { category: "الأغذية والمشروبات", name: "شاي أكياس", unit: "عبوة", minimum: 20, opening: 52 },
  { category: "الأغذية والمشروبات", name: "سكر أكياس", unit: "عبوة", minimum: 20, opening: 60 },
  { category: "الأغذية والمشروبات", name: "حليب مبخر", unit: "كرتون", minimum: 8, opening: 18 },
  { category: "الأغذية والمشروبات", name: "تمر فاخر", unit: "كيلو", minimum: 12, opening: 30 },
  { category: "أدوات الصيانة", name: "لمبات LED 9 واط", unit: "حبة", minimum: 40, opening: 110 },
  { category: "أدوات الصيانة", name: "بطاريات AA", unit: "عبوة", minimum: 20, opening: 46 },
  { category: "أدوات الصيانة", name: "فلاتر مكيفات", unit: "حبة", minimum: 15, opening: 34 },
  { category: "أدوات الصيانة", name: "شريط لاصق عازل", unit: "حبة", minimum: 10, opening: 24 },
  { category: "أدوات الصيانة", name: "صمامات مياه", unit: "حبة", minimum: 8, opening: 20 },
  { category: "قرطاسية", name: "ورق طباعة A4", unit: "صندوق", minimum: 6, opening: 15 },
  { category: "قرطاسية", name: "بطاقات مفاتيح الغرف", unit: "عبوة", minimum: 10, opening: 28 },
  { category: "قرطاسية", name: "أظرف الفواتير", unit: "عبوة", minimum: 8, opening: 20 },
  { category: "قرطاسية", name: "أقلام حبر", unit: "عبوة", minimum: 10, opening: 26 },
] as const;

export async function seedInventory(
  prisma: PrismaClient,
  random: Random,
  foundation: Foundation,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = (key: string, by = 1) => {
    counts[key] = (counts[key] ?? 0) + by;
  };

  const categoryIds = new Map<string, string>();
  for (const name of new Set(INVENTORY.map((item) => item.category))) {
    const category = await prisma.inventoryCategory.upsert({
      where: { propertyId_name: { propertyId: foundation.propertyId, name } },
      create: { propertyId: foundation.propertyId, name },
      update: {},
      select: { id: true },
    });
    categoryIds.set(name, category.id);
    bump("category");
  }

  for (const [index, spec] of INVENTORY.entries()) {
    const sku = `SKU-${String(index + 1).padStart(4, "0")}`;

    const item = await prisma.inventoryItem.upsert({
      where: { propertyId_sku: { propertyId: foundation.propertyId, sku } },
      create: {
        propertyId: foundation.propertyId,
        categoryId: categoryIds.get(spec.category)!,
        name: spec.name,
        sku,
        minimumQuantity: String(spec.minimum),
        unit: spec.unit,
        quantity: 0,
      },
      update: { minimumQuantity: String(spec.minimum), unit: spec.unit },
      select: { id: true },
    });

    // Rebuild the ledger from scratch so re-seeding cannot double the stock.
    await prisma.inventoryTransaction.deleteMany({ where: { itemId: item.id } });

    let quantity = money(0);
    const record = async (
      type: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT",
      amount: string,
      dayOffset: number,
      reference: string | null,
      notes: string | null = null,
    ) => {
      await prisma.inventoryTransaction.create({
        data: {
          itemId: item.id,
          propertyId: foundation.propertyId,
          type,
          quantity: amount,
          reference,
          notes,
          createdById: foundation.userIds.admin ?? null,
          createdAt: instantOn(dayOffset, random.int(8, 16), random.int(0, 59)),
        },
      });
      quantity = add(quantity, amount);
      bump("transaction");
    };

    // Opening stock, then a month of consumption and a couple of resupplies.
    await record("STOCK_IN", String(spec.opening), -35, `PO-${1000 + index}`, "رصيد افتتاحي");

    const consumptions = random.int(3, 6);
    for (let i = 0; i < consumptions; i++) {
      const draw = Math.max(1, Math.round(spec.opening * (random.int(4, 12) / 100)));
      await record("STOCK_OUT", String(-draw), -random.int(2, 30), `REQ-${random.int(2000, 2999)}`);
    }

    if (random.chance(0.5)) {
      const resupply = Math.round(spec.opening * (random.int(20, 40) / 100));
      await record("STOCK_IN", String(resupply), -random.int(3, 14), `PO-${2000 + index}`);
    }

    // A stock count correction on a few items — the kind of thing that really happens.
    if (random.chance(0.25)) {
      await record("ADJUSTMENT", String(-random.int(1, 4)), -random.int(1, 8), null, "تسوية جرد");
    }

    /*
     * Every sixth item is deliberately drawn below its minimum so the low-stock
     * alert has something real to show. The extra draw is a movement like any
     * other, so the ledger still reconciles.
     */
    if (index % 6 === 0) {
      const target = money(String(spec.minimum)).minus(random.int(1, 8));
      const gap = quantity.minus(target);
      if (gap.greaterThan(0)) {
        await record("STOCK_OUT", gap.negated().toFixed(2), -1, `REQ-${random.int(3000, 3999)}`);
      }
    }

    await prisma.inventoryItem.update({ where: { id: item.id }, data: { quantity } });
    bump("item");
  }

  return counts;
}

const EXPENSES = [
  { category: "UTILITIES", description: "فاتورة الكهرباء — شهر أغسطس", min: 18000, max: 26000 },
  { category: "UTILITIES", description: "فاتورة المياه — شهر أغسطس", min: 3200, max: 5400 },
  { category: "SUPPLIES", description: "توريد مستلزمات غرف", min: 2400, max: 7800 },
  { category: "SUPPLIES", description: "شراء مناشف وأغطية", min: 3500, max: 9200 },
  { category: "CLEANING", description: "توريد مواد نظافة", min: 1800, max: 4600 },
  { category: "CLEANING", description: "خدمة مكافحة حشرات دورية", min: 900, max: 1600 },
  { category: "MAINTENANCE", description: "صيانة مكيفات الطابق الثالث", min: 2200, max: 6500 },
  { category: "MAINTENANCE", description: "إصلاح مضخة المياه", min: 1400, max: 3800 },
  { category: "MAINTENANCE", description: "عقد صيانة المصاعد", min: 3000, max: 3000 },
  { category: "MARKETING", description: "حملة إعلانية رقمية", min: 2500, max: 6000 },
  { category: "MARKETING", description: "تصوير احترافي للغرف", min: 3800, max: 3800 },
  { category: "SALARIES", description: "بدلات إضافية للموظفين", min: 4200, max: 11000 },
  { category: "OTHER", description: "مصاريف ضيافة وتشغيل", min: 600, max: 2400 },
  { category: "OTHER", description: "رسوم اشتراك أنظمة", min: 800, max: 1900 },
] as const;

export async function seedExpenses(
  prisma: PrismaClient,
  random: Random,
  foundation: Foundation,
): Promise<number> {
  const count = random.int(18, 24);

  for (let index = 0; index < count; index++) {
    const spec = EXPENSES[index % EXPENSES.length];
    const amount =
      spec.min === spec.max
        ? `${spec.min}.00`
        : `${random.int(spec.min, spec.max)}.${String(random.int(0, 99)).padStart(2, "0")}`;

    const dayOffset = -random.int(0, 29);
    const expenseNumber = `EXP-2026-${String(index + 1).padStart(6, "0")}`;

    await prisma.expense.upsert({
      where: { expenseNumber },
      create: {
        propertyId: foundation.propertyId,
        expenseNumber,
        category: spec.category as never,
        amount,
        date: addDays(DEMO_BUSINESS_DATE, dayOffset),
        paymentMethod: random.weighted([
          ["BANK_TRANSFER", 50],
          ["CASH", 30],
          ["CARD", 20],
        ] as const) as never,
        description: spec.description,
        createdById: foundation.userIds.accountant ?? null,
        createdAt: instantOn(dayOffset, random.int(9, 16)),
      },
      update: { amount, description: spec.description },
    });
  }

  return count;
}
