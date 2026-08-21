import { prisma } from "@/lib/db";

/**
 * Wipes every table between test files, children first so foreign keys never block
 * the delete. Truncation with FK checks disabled would be faster but would also
 * hide a broken constraint — and the constraints are part of what these tests
 * verify, so they stay switched on.
 */
export async function resetDatabase() {
  await prisma.activityLog.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.inventoryCategory.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.reservationCharge.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.unitBlock.deleteMany();
  await prisma.housekeepingTask.deleteMany();
  await prisma.maintenanceRequest.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.outlet.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.unitType.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.property.deleteMany();
}

/** A property with one unit type and one unit — the minimum a reservation needs. */
export async function seedProperty(overrides: { unitNumber?: string } = {}) {
  const property = await prisma.property.create({
    data: {
      name: "فندق الاختبار",
      type: "HOTEL",
      city: "جدة",
    },
  });

  const unitType = await prisma.unitType.create({
    data: {
      propertyId: property.id,
      name: "غرفة مزدوجة",
      capacity: 2,
      baseRate: "450.00",
    },
  });

  const unit = await prisma.unit.create({
    data: {
      propertyId: property.id,
      unitTypeId: unitType.id,
      unitNumber: overrides.unitNumber ?? "101",
      floor: 1,
    },
  });

  return { property, unitType, unit };
}

export async function seedGuest(overrides: Partial<{ fullName: string; mobile: string }> = {}) {
  return prisma.guest.create({
    data: {
      fullName: overrides.fullName ?? "سعد المطيري",
      mobile: overrides.mobile ?? "0551234567",
      nationality: "سعودي",
    },
  });
}

export const TEST_ACTOR = {
  id: null,
  name: "مشغّل الاختبار",
  email: "test@nokhba-hotel.sa",
  roles: ["admin"],
};

/**
 * A property with a unit type and N rooms of it — the fixture inventory tests need.
 *
 * Capacity questions cannot be asked of a one-room hotel: with a single unit, "the
 * room is taken" and "the type is sold out" are the same sentence, and a test cannot
 * tell which rule refused it.
 */
export async function seedInventory(options: {
  units: number;
  name?: string;
  baseRate?: string;
  unitPrefix?: string;
}) {
  const property = await prisma.property.create({
    data: { name: options.name ?? "فندق السعة", type: "HOTEL", city: "الرياض" },
  });

  const unitType = await prisma.unitType.create({
    data: {
      propertyId: property.id,
      name: "غرفة قياسية",
      capacity: 2,
      baseRate: options.baseRate ?? "400.00",
    },
  });

  const units = [];
  for (let index = 0; index < options.units; index++) {
    units.push(
      await prisma.unit.create({
        data: {
          propertyId: property.id,
          unitTypeId: unitType.id,
          unitNumber: `${options.unitPrefix ?? "R"}${101 + index}`,
          floor: 1,
        },
      }),
    );
  }

  return { property, unitType, units };
}

/** The VAT rate the pricing engine will read for a property. */
export async function setVatRate(propertyId: string, rate: string) {
  await prisma.systemSetting.upsert({
    where: { propertyId_key: { propertyId, key: "tax.vatRate" } },
    create: { propertyId, key: "tax.vatRate", value: rate },
    update: { value: rate },
  });
}

/**
 * A guest complete enough to be checked in.
 *
 * `seedGuest` deliberately stays minimal — that shape is what the guest tests are
 * about. Check-in has stricter requirements, so it gets its own fixture rather than
 * making every other test carry a document it does not care about. The document is
 * unique per call: two fixtures sharing one number would collide on the constraint
 * that exists to stop exactly that.
 */
let documentSequence = 0;

export async function seedCheckInGuest(
  overrides: Partial<{ fullName: string; mobile: string; nationality: string }> = {},
) {
  documentSequence += 1;
  const suffix = String(documentSequence).padStart(6, "0");

  return prisma.guest.create({
    data: {
      fullName: overrides.fullName ?? `نزيل الوصول ${suffix}`,
      mobile: overrides.mobile ?? `0553${suffix}`,
      nationality: overrides.nationality ?? "سعودي",
      identificationType: "NATIONAL_ID",
      identificationNumber: `10${suffix.padStart(8, "0")}`,
    },
  });
}

/**
 * Pins the operating date the services will read.
 *
 * Written as the global override (null property) so a test does not have to name a
 * property to move the calendar, and so it survives a fixture that creates several.
 */
export async function setBusinessDate(iso: string) {
  const existing = await prisma.systemSetting.findFirst({
    where: { key: "demo.businessDate" },
    select: { id: true },
  });

  if (existing) {
    await prisma.systemSetting.update({ where: { id: existing.id }, data: { value: iso } });
    return;
  }

  await prisma.systemSetting.create({
    data: { propertyId: null, key: "demo.businessDate", value: iso },
  });
}
