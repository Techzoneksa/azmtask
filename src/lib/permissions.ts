/**
 * Permission model.
 *
 * Permissions are the unit of authorization everywhere in the system: navigation,
 * page guards, server actions and API routes all resolve down to a permission key.
 * Roles are only a convenient bundle of permissions — never check a role directly
 * in feature code, check the permission it grants.
 */

export const PERMISSIONS = [
  "dashboard.view",

  "reservations.view",
  "reservations.create",
  "reservations.edit",
  "reservations.cancel",
  "reservations.checkin",
  "reservations.checkout",

  "guests.view",
  "guests.create",
  "guests.edit",

  "units.view",
  "units.manage",
  "units.status.change",

  "housekeeping.view",
  "housekeeping.manage",
  "housekeeping.complete",

  "maintenance.view",
  "maintenance.manage",

  "payments.view",
  "payments.create",
  "payments.refund",

  "invoices.view",
  "invoices.issue",

  "expenses.view",
  "expenses.manage",

  "inventory.view",
  "inventory.manage",

  "outlets.view",
  "outlets.manage",

  "employees.view",
  "employees.manage",

  "users.view",
  "users.manage",

  "reports.view",
  "reports.financial",

  "activity.view",

  "settings.view",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = [
  "admin",
  "hotel_manager",
  "reception",
  "accountant",
  "housekeeping_supervisor",
  "housekeeping",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "مدير النظام",
  hotel_manager: "مدير الفندق",
  reception: "موظف استقبال",
  accountant: "محاسب",
  housekeeping_supervisor: "مشرف النظافة",
  housekeeping: "موظف نظافة",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "صلاحية كاملة على النظام والإعدادات والمستخدمين",
  hotel_manager: "الإشراف على العمليات التشغيلية والتقارير",
  reception: "الحجوزات والنزلاء وتسجيل الدخول والخروج والمدفوعات",
  accountant: "الفواتير والمدفوعات والمصروفات والتقارير المالية",
  housekeeping_supervisor: "إدارة مهام النظافة وتوزيعها على الموظفين",
  housekeeping: "تنفيذ مهام النظافة الموكلة إليه",
};

const RECEPTION_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "reservations.view",
  "reservations.create",
  "reservations.edit",
  "reservations.cancel",
  "reservations.checkin",
  "reservations.checkout",
  "guests.view",
  "guests.create",
  "guests.edit",
  "units.view",
  "units.status.change",
  "housekeeping.view",
  "maintenance.view",
  "maintenance.manage",
  "payments.view",
  "payments.create",
  "invoices.view",
  "invoices.issue",
  "outlets.view",
  "reports.view",
];

const ACCOUNTANT_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "reservations.view",
  "guests.view",
  "units.view",
  "payments.view",
  "payments.create",
  "payments.refund",
  "invoices.view",
  "invoices.issue",
  "expenses.view",
  "expenses.manage",
  "inventory.view",
  "outlets.view",
  "reports.view",
  "reports.financial",
  "activity.view",
];

const HOUSEKEEPING_SUPERVISOR_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "units.view",
  "units.status.change",
  "housekeeping.view",
  "housekeeping.manage",
  "housekeeping.complete",
  "maintenance.view",
  "maintenance.manage",
  "inventory.view",
  "inventory.manage",
  "employees.view",
  "reports.view",
];

const HOUSEKEEPING_PERMISSIONS: Permission[] = [
  "units.view",
  "housekeeping.view",
  "housekeeping.complete",
  "maintenance.view",
];

const HOTEL_MANAGER_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "reservations.view",
  "reservations.create",
  "reservations.edit",
  "reservations.cancel",
  "reservations.checkin",
  "reservations.checkout",
  "guests.view",
  "guests.create",
  "guests.edit",
  "units.view",
  "units.manage",
  "units.status.change",
  "housekeeping.view",
  "housekeeping.manage",
  "housekeeping.complete",
  "maintenance.view",
  "maintenance.manage",
  "payments.view",
  "payments.create",
  "payments.refund",
  "invoices.view",
  "invoices.issue",
  "expenses.view",
  "expenses.manage",
  "inventory.view",
  "inventory.manage",
  "outlets.view",
  "outlets.manage",
  "employees.view",
  "employees.manage",
  "reports.view",
  "reports.financial",
  "activity.view",
  "settings.view",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  hotel_manager: HOTEL_MANAGER_PERMISSIONS,
  reception: RECEPTION_PERMISSIONS,
  accountant: ACCOUNTANT_PERMISSIONS,
  housekeeping_supervisor: HOUSEKEEPING_SUPERVISOR_PERMISSIONS,
  housekeeping: HOUSEKEEPING_PERMISSIONS,
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHas(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

/** True when the actor holds every one of the required permissions. */
export function hasAll(
  granted: readonly Permission[],
  required: readonly Permission[],
): boolean {
  return required.every((p) => granted.includes(p));
}

/** True when the actor holds at least one of the listed permissions. */
export function hasAny(
  granted: readonly Permission[],
  required: readonly Permission[],
): boolean {
  return required.some((p) => granted.includes(p));
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
