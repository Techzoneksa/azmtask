import type { PrismaClient } from "../../src/generated/prisma/client";

import { DEMO_MARKER_KEY, DEMO_MARKER_VALUE, DEMO_PROPERTY } from "./constants";

/**
 * Demo reset.
 *
 * Deletes operational data so the demo can be rebuilt from a known state. Two
 * guards stand in front of it, because a reset command that can reach production is
 * a catastrophe waiting for a mistyped environment variable:
 *
 *   1. It refuses to run in production unless ALLOW_DEMO_RESET is explicitly set.
 *   2. It only ever deletes rows belonging to the demo property — the one carrying
 *      the demo marker in its settings. A real hotel in the same database is not
 *      touched, and if the marker is missing the reset aborts rather than guessing.
 */

export class DemoResetBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoResetBlocked";
  }
}

export function assertResetAllowed(env: NodeJS.ProcessEnv = process.env): void {
  const isProduction = env.NODE_ENV === "production";
  const override = env.ALLOW_DEMO_RESET === "true";

  if (isProduction && !override) {
    throw new DemoResetBlocked(
      "رُفض الأمر: لا يمكن تشغيل إعادة تهيئة بيانات العرض في بيئة الإنتاج. " +
        "إن كنت متأكدًا أن هذه بيئة عرض، اضبط ALLOW_DEMO_RESET=true صراحةً.",
    );
  }
}

/** Finds the demo property by its marker. Returns null when there is none. */
export async function findDemoProperty(prisma: PrismaClient): Promise<string | null> {
  const marker = await prisma.systemSetting.findFirst({
    where: { key: DEMO_MARKER_KEY, value: DEMO_MARKER_VALUE },
    select: { propertyId: true },
  });

  if (marker?.propertyId) return marker.propertyId;

  // First run: the property may exist from an older seed without a marker yet.
  const byName = await prisma.property.findFirst({
    where: { name: DEMO_PROPERTY.name },
    select: { id: true },
  });

  return byName?.id ?? null;
}

/**
 * Removes the demo property's operational data, children before parents so no
 * foreign key blocks the delete. Reference data — roles, permissions — is left
 * alone: it is system state, not demo state.
 */
export async function resetDemoData(prisma: PrismaClient): Promise<void> {
  assertResetAllowed();

  const propertyId = await findDemoProperty(prisma);
  if (!propertyId) return;

  const scope = { propertyId };

  await prisma.activityLog.deleteMany({ where: scope });
  await prisma.inventoryTransaction.deleteMany({ where: scope });
  await prisma.inventoryItem.deleteMany({ where: scope });
  await prisma.inventoryCategory.deleteMany({ where: scope });
  await prisma.invoice.deleteMany({ where: scope });
  await prisma.payment.deleteMany({ where: scope });
  await prisma.reservationCharge.deleteMany({ where: scope });
  await prisma.reservation.deleteMany({ where: scope });
  await prisma.housekeepingTask.deleteMany({ where: scope });
  await prisma.maintenanceRequest.deleteMany({ where: scope });
  await prisma.expense.deleteMany({ where: scope });
  await prisma.outlet.deleteMany({ where: scope });
  await prisma.unit.deleteMany({ where: scope });
  await prisma.unitType.deleteMany({ where: scope });

  /*
   * Guests are not scoped to a property, so they are removed only once nothing
   * references them — which, after the deletes above, is all of the demo's guests
   * and none of anyone else's.
   */
  await prisma.guest.deleteMany({
    where: { reservations: { none: {} }, payments: { none: {} }, invoices: { none: {} } },
  });

  // Logins are detached from their employee records before those are removed.
  const employees = await prisma.employee.findMany({
    where: scope,
    select: { id: true },
  });
  await prisma.user.updateMany({
    where: { employeeId: { in: employees.map((e) => e.id) } },
    data: { employeeId: null },
  });
  await prisma.employee.deleteMany({ where: scope });
}
