import "dotenv/config";

import bcrypt from "bcryptjs";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  PERMISSIONS,
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
} from "../src/lib/permissions";

/**
 * System seed.
 *
 * Reference data only — the permission catalogue, the standard roles, and the
 * accounts needed to sign in. The hotel's own data (property, units, guests,
 * reservations) belongs to Stage 3 and is deliberately not created here.
 *
 * Every write is an upsert keyed on a natural key, so running the seed twice is the
 * same as running it once. That matters: this runs after every deployment migration,
 * not just on an empty database.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL غير مضبوط — تعذّر تشغيل البذرة.");

const parsed = new URL(url);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    timezone: "Z",
  }),
});

/** Arabic description shown next to each permission in the roles screen. */
const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "dashboard.view": "عرض لوحة المعلومات",
  "reservations.view": "عرض الحجوزات",
  "reservations.create": "إنشاء حجز جديد",
  "reservations.edit": "تعديل بيانات الحجز",
  "reservations.cancel": "إلغاء الحجز",
  "reservations.checkin": "تسجيل دخول النزيل",
  "reservations.checkout": "إتمام مغادرة النزيل",
  "guests.view": "عرض النزلاء",
  "guests.create": "إضافة نزيل",
  "guests.edit": "تعديل بيانات النزيل",
  "units.view": "عرض الوحدات",
  "units.manage": "إدارة الوحدات وأنواعها",
  "units.status.change": "تغيير حالة الوحدة",
  "housekeeping.view": "عرض مهام النظافة",
  "housekeeping.manage": "إنشاء وتوزيع مهام النظافة",
  "housekeeping.complete": "إنهاء مهمة نظافة",
  "maintenance.view": "عرض بلاغات الصيانة",
  "maintenance.manage": "إدارة بلاغات الصيانة",
  "payments.view": "عرض المدفوعات",
  "payments.create": "تسجيل دفعة",
  "payments.refund": "تسجيل استرجاع مبلغ",
  "invoices.view": "عرض الفواتير",
  "invoices.issue": "إصدار فاتورة",
  "expenses.view": "عرض المصروفات",
  "expenses.manage": "إدارة المصروفات",
  "inventory.view": "عرض المخزون",
  "inventory.manage": "إدارة المخزون وحركاته",
  "outlets.view": "عرض منافذ الخدمة",
  "outlets.manage": "إدارة منافذ الخدمة",
  "employees.view": "عرض الموظفين",
  "employees.manage": "إدارة الموظفين",
  "users.view": "عرض المستخدمين",
  "users.manage": "إدارة المستخدمين والصلاحيات",
  "reports.view": "عرض التقارير التشغيلية",
  "reports.financial": "عرض التقارير المالية",
  "activity.view": "عرض سجل النشاط",
  "settings.view": "عرض الإعدادات",
  "settings.manage": "تعديل الإعدادات",
};

/**
 * Sign-in accounts. Passwords come from the environment so a real deployment never
 * inherits the demo one; the fallback exists only to keep local development and the
 * client demo working out of the box.
 */
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Demo@1234";

const SEED_USERS = [
  { name: "عبدالرحمن الشهري", email: "admin@nokhba-hotel.sa", roleKey: "admin" },
  { name: "ماجد العتيبي", email: "manager@nokhba-hotel.sa", roleKey: "hotel_manager" },
  { name: "نورة القحطاني", email: "reception@nokhba-hotel.sa", roleKey: "reception" },
  { name: "خالد الدوسري", email: "accountant@nokhba-hotel.sa", roleKey: "accountant" },
  { name: "سلمان الحربي", email: "housekeeping@nokhba-hotel.sa", roleKey: "housekeeping_supervisor" },
] as const;

async function seedPermissions() {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: {
        key,
        module: key.split(".")[0],
        description: PERMISSION_DESCRIPTIONS[key] ?? key,
      },
      update: {
        module: key.split(".")[0],
        description: PERMISSION_DESCRIPTIONS[key] ?? key,
      },
    });
  }
  console.log(`  permissions: ${PERMISSIONS.length}`);
}

async function seedRoles() {
  for (const roleKey of ROLES) {
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      create: {
        key: roleKey,
        name: ROLE_LABELS[roleKey],
        description: ROLE_DESCRIPTIONS[roleKey],
        isSystem: true,
      },
      update: {
        name: ROLE_LABELS[roleKey],
        description: ROLE_DESCRIPTIONS[roleKey],
      },
    });

    const granted = ROLE_PERMISSIONS[roleKey];
    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...granted] } },
      select: { id: true },
    });

    /*
     * The role's grants are replaced wholesale rather than merged. A permission
     * removed from the catalogue must actually disappear from the role — merging
     * would silently leave the old grant in place.
     */
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
    });

    console.log(`  role ${roleKey}: ${permissions.length} permissions`);
  }
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const seed of SEED_USERS) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: seed.roleKey },
      select: { id: true },
    });

    /*
     * The password is only set when the account is created. Re-running the seed must
     * never reset a password an administrator has since changed.
     */
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      create: { name: seed.name, email: seed.email, passwordHash },
      update: { name: seed.name },
      select: { id: true, email: true },
    });

    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  }

  console.log(`  users: ${SEED_USERS.length}`);
}

async function main() {
  console.log("Seeding system reference data…");
  await seedPermissions();
  await seedRoles();
  await seedUsers();
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
