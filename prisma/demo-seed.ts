import "dotenv/config";

import { createSeedClient, describeTarget } from "./demo/client";
import { DEMO_BUSINESS_DATE, DEMO_SEED } from "./demo/constants";
import { createRandom } from "./demo/random";
import { resetDemoData } from "./demo/reset";
import { seedActivity } from "./demo/seed-activity";
import {
  seedGuests,
  seedOutlets,
  seedProperty,
  seedTeam,
  seedUnitTypes,
  seedUnits,
  type Foundation,
} from "./demo/seed-foundation";
import { seedOperations } from "./demo/seed-operations";
import { describePlan, planReservations } from "./demo/seed-reservations";
import { seedExpenses, seedInventory } from "./demo/seed-resources";
import { seedScenario } from "./demo/seed-scenario";
import { toISODate } from "../src/lib/datetime";

/**
 * Demo dataset seed.
 *
 * Separate from `prisma/seed.ts`, which creates only the system reference data a
 * production install needs. This one creates a hotel, and it is not something a
 * real deployment should ever run.
 *
 * The operational tables are cleared for the demo property first, so the scenario is
 * rebuilt from a known state rather than layered on top of a previous run. Roles,
 * permissions and passwords are untouched by that clear.
 */

const prisma = createSeedClient();

async function main() {
  console.log(`Seeding demo hotel into ${describeTarget()}`);
  console.log(`Business date: ${toISODate(DEMO_BUSINESS_DATE)}  ·  seed: ${DEMO_SEED}\n`);

  const systemRoles = await prisma.role.count();
  if (systemRoles === 0) {
    throw new Error(
      "لم يتم العثور على الأدوار. شغّل `npm run db:seed` أولًا لإنشاء الصلاحيات والأدوار.",
    );
  }

  const random = createRandom(DEMO_SEED);

  console.log("Clearing previous demo data…");
  await resetDemoData(prisma);

  console.log("Property, rooms and outlets…");
  const propertyId = await seedProperty(prisma);
  const unitTypeIds = await seedUnitTypes(prisma, propertyId);
  const units = await seedUnits(prisma, propertyId, unitTypeIds);
  const outletIds = await seedOutlets(prisma, propertyId);

  console.log("Team and logins…");
  const { employeeIds, userIds } = await seedTeam(prisma, propertyId);

  console.log("Guests…");
  const guestIds = await seedGuests(prisma, random, 42);

  const foundation: Foundation = {
    propertyId,
    unitTypeIds,
    units,
    employeeIds,
    userIds,
    guestIds,
    outletIds,
  };

  const actorFor = (roleKey: string, name: string, email: string) => ({
    id: userIds[roleKey] ?? userIds.admin,
    name,
    email,
    roles: [roleKey],
  });

  const actors = {
    reception: actorFor("reception", "نورة بنت خالد الشهري", "reception@arwiqah-demo.sa"),
    accountant: actorFor("accountant", "خالد بن إبراهيم السبيعي", "accountant@arwiqah-demo.sa"),
    housekeeping: actorFor("housekeeping_supervisor", "منال بنت سعيد الغامدي", "housekeeping@arwiqah-demo.sa"),
    manager: actorFor("hotel_manager", "ماجد بن سعد العتيبي", "manager@arwiqah-demo.sa"),
  };

  console.log("Planning the reservation calendar…");
  const { stays, roles } = planReservations(random, units, guestIds.length);
  console.log(`  ${stays.length} stays planned — ${describePlan(stays)}`);

  console.log("Creating reservations, charges, payments and invoices…");
  const scenario = await seedScenario(prisma, random, foundation, stays, roles, actors);

  console.log("Housekeeping, maintenance and unit states…");
  const operations = await seedOperations(prisma, random, foundation, roles);

  console.log("Inventory and expenses…");
  const inventory = await seedInventory(prisma, random, foundation);
  const expenses = await seedExpenses(prisma, random, foundation);

  console.log("Activity history…");
  const activity = await seedActivity(prisma, random, foundation, actors);

  console.log("\nSeeded:");
  console.log(`  units ${units.length}  ·  guests ${guestIds.length}  ·  reservations ${scenario.reservationIds.length}`);
  console.log(`  payments ${scenario.counts.payment ?? 0}  ·  charges ${scenario.counts.charge ?? 0}  ·  invoices ${scenario.counts.invoice ?? 0}`);
  console.log(`  inventory items ${inventory.item ?? 0}  ·  movements ${inventory.transaction ?? 0}  ·  expenses ${expenses}`);
  console.log(`  housekeeping ${Object.values(operations).reduce((a, b) => a + b, 0)}  ·  activity ${activity}`);
  console.log("\nRun `npm run db:demo-validate` to verify the dataset reconciles.");
}

main()
  .catch((error) => {
    console.error("\nDemo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
