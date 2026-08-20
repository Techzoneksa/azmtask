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
