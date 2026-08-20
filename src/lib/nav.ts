import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BedDouble,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardList,
  Coffee,
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";

import type { Permission } from "./permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The visitor needs this permission for the item to appear and the route to open. */
  permission: Permission;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "التشغيل",
    items: [
      {
        href: "/dashboard",
        label: "لوحة المعلومات",
        icon: LayoutDashboard,
        permission: "dashboard.view",
      },
      {
        href: "/reservations",
        label: "الحجوزات",
        icon: CalendarDays,
        permission: "reservations.view",
      },
      { href: "/guests", label: "النزلاء", icon: Users, permission: "guests.view" },
      { href: "/units", label: "الوحدات", icon: BedDouble, permission: "units.view" },
      {
        href: "/housekeeping",
        label: "النظافة",
        icon: Sparkles,
        permission: "housekeeping.view",
      },
      {
        href: "/maintenance",
        label: "الصيانة",
        icon: Wrench,
        permission: "maintenance.view",
      },
    ],
  },
  {
    title: "المالية",
    items: [
      {
        href: "/payments",
        label: "المدفوعات",
        icon: CreditCard,
        permission: "payments.view",
      },
      { href: "/invoices", label: "الفواتير", icon: Receipt, permission: "invoices.view" },
      {
        href: "/expenses",
        label: "المصروفات",
        icon: FileText,
        permission: "expenses.view",
      },
    ],
  },
  {
    title: "الموارد",
    items: [
      { href: "/inventory", label: "المخزون", icon: Boxes, permission: "inventory.view" },
      {
        href: "/outlets",
        label: "منافذ الخدمة",
        icon: Coffee,
        permission: "outlets.view",
      },
      {
        href: "/employees",
        label: "الموظفون",
        icon: Building2,
        permission: "employees.view",
      },
    ],
  },
  {
    title: "الإدارة",
    items: [
      {
        href: "/users",
        label: "المستخدمون والصلاحيات",
        icon: ShieldCheck,
        permission: "users.view",
      },
      {
        href: "/reports",
        label: "التقارير",
        icon: ClipboardList,
        permission: "reports.view",
      },
      { href: "/activity", label: "سجل النشاط", icon: Activity, permission: "activity.view" },
      { href: "/settings", label: "الإعدادات", icon: Settings, permission: "settings.view" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** Sections with items the visitor cannot reach removed; empty sections drop out. */
export function visibleSections(granted: readonly Permission[]): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => granted.includes(item.permission)),
  })).filter((section) => section.items.length > 0);
}

/** The nav item owning a pathname, used for titles and active highlighting. */
export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

/** First landing page the visitor is actually allowed to open. */
export function defaultRouteFor(granted: readonly Permission[]): string {
  const item = ALL_NAV_ITEMS.find((entry) => granted.includes(entry.permission));
  return item?.href ?? "/no-access";
}
