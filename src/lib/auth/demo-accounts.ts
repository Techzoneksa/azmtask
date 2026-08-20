import type { Role } from "@/lib/permissions";

/**
 * Demo account roster — identity only, no credentials.
 *
 * Deliberately free of bcrypt and of any secret so the login screen can list the
 * accounts without pulling the password-verification code into the browser bundle.
 * Stage 2 replaces this with a query against the `users` table.
 */

export type DemoAccount = {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string;
  propertyId: string;
  active: boolean;
};

export const DEMO_PROPERTY_ID = "prop-nokhba-jed";

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "usr-001",
    name: "عبدالرحمن الشهري",
    email: "admin@nokhba-hotel.sa",
    role: "admin",
    jobTitle: "مدير النظام",
    propertyId: DEMO_PROPERTY_ID,
    active: true,
  },
  {
    id: "usr-002",
    name: "ماجد العتيبي",
    email: "manager@nokhba-hotel.sa",
    role: "hotel_manager",
    jobTitle: "مدير الفندق",
    propertyId: DEMO_PROPERTY_ID,
    active: true,
  },
  {
    id: "usr-003",
    name: "نورة القحطاني",
    email: "reception@nokhba-hotel.sa",
    role: "reception",
    jobTitle: "موظفة استقبال",
    propertyId: DEMO_PROPERTY_ID,
    active: true,
  },
  {
    id: "usr-004",
    name: "خالد الدوسري",
    email: "accountant@nokhba-hotel.sa",
    role: "accountant",
    jobTitle: "محاسب",
    propertyId: DEMO_PROPERTY_ID,
    active: true,
  },
  {
    id: "usr-005",
    name: "سلمان الحربي",
    email: "housekeeping@nokhba-hotel.sa",
    role: "housekeeping_supervisor",
    jobTitle: "مشرف النظافة",
    propertyId: DEMO_PROPERTY_ID,
    active: true,
  },
];
