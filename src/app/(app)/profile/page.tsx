import { Mail, ShieldCheck, UserCircle2 } from "lucide-react";
import type { Metadata } from "next";

import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth/guard";
import { initials } from "@/lib/format";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";

export const metadata: Metadata = { title: "الملف الشخصي" };

/** Read-only view of the signed-in account; editing arrives with the users table. */
export default async function ProfilePage() {
  const session = await requireSession("/profile");

  const permissionsByModule = groupPermissions([...session.permissions]);

  return (
    <>
      <PageHeader
        title="الملف الشخصي"
        description="بيانات حسابك والصلاحيات الممنوحة لدورك الحالي."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardBody className="flex flex-col items-center py-8 text-center">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-semibold text-brand-800"
              aria-hidden
            >
              {initials(session.name)}
            </span>
            <p className="mt-3 text-[15px] font-semibold text-content">{session.name}</p>
            <p className="mt-0.5 text-[13px] text-content-muted">
              {session.jobTitle || ROLE_LABELS[session.role]}
            </p>
            <div className="mt-3">
              <Badge tone="brand" dot>
                {ROLE_LABELS[session.role]}
              </Badge>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="بيانات الحساب" />
          <CardBody className="space-y-4">
            <DetailRow
              icon={<UserCircle2 className="h-4 w-4" aria-hidden />}
              label="الاسم"
              value={session.name}
            />
            <DetailRow
              icon={<Mail className="h-4 w-4" aria-hidden />}
              label="البريد الإلكتروني"
              value={session.email}
              ltr
            />
            <DetailRow
              icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
              label="الدور الوظيفي"
              value={ROLE_LABELS[session.role]}
              hint={ROLE_DESCRIPTIONS[session.role]}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="الصلاحيات الممنوحة"
          description="هذه هي الصلاحيات التي يتحقق منها الخادم عند كل طلب — وليست مجرد إخفاء أزرار في الواجهة."
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(permissionsByModule).map(([module, actions]) => (
              <div key={module} className="rounded-lg border border-line bg-surface-muted p-3">
                <p className="text-[13px] font-semibold text-content">
                  {MODULE_LABELS[module] ?? module}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {actions.map((action) => (
                    <li key={action} className="text-[12px] text-content-muted" dir="ltr">
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
  hint,
  ltr = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line pb-4 last:border-0 last:pb-0">
      <span className="mt-0.5 text-content-subtle">{icon}</span>
      <div className="min-w-0">
        <p className="text-[12px] text-content-subtle">{label}</p>
        <p
          className="mt-0.5 text-sm font-medium text-content"
          dir={ltr ? "ltr" : undefined}
          style={ltr ? { textAlign: "start" } : undefined}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-[12px] text-content-muted">{hint}</p>}
      </div>
    </div>
  );
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: "لوحة المعلومات",
  reservations: "الحجوزات",
  guests: "النزلاء",
  units: "الوحدات",
  housekeeping: "النظافة",
  maintenance: "الصيانة",
  payments: "المدفوعات",
  invoices: "الفواتير",
  expenses: "المصروفات",
  inventory: "المخزون",
  outlets: "منافذ الخدمة",
  employees: "الموظفون",
  users: "المستخدمون",
  reports: "التقارير",
  activity: "سجل النشاط",
  settings: "الإعدادات",
};

/** "reservations.checkin" → { reservations: ["checkin"] } */
function groupPermissions(permissions: string[]): Record<string, string[]> {
  return permissions.reduce<Record<string, string[]>>((groups, permission) => {
    const [module, ...rest] = permission.split(".");
    (groups[module] ??= []).push(rest.join("."));
    return groups;
  }, {});
}
