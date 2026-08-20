import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/guard";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, PERMISSIONS } from "@/lib/permissions";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "لوحة المعلومات" };

/**
 * Stage 1 dashboard.
 *
 * Deliberately shows no occupancy or revenue figures: those come from the database
 * in Stage 4, and inventing them here would make the demo lie. What it does show is
 * real — the signed-in identity, the permissions that identity actually holds, and
 * where the build currently stands.
 */

const ROADMAP = [
  { stage: "المرحلة 1", title: "الأساس وهيكل التطبيق", done: true },
  { stage: "المرحلة 2", title: "بنية قاعدة البيانات", done: false },
  { stage: "المرحلة 3", title: "بيانات العرض التجريبي", done: false },
  { stage: "المرحلة 4", title: "لوحة المعلومات التشغيلية", done: false },
  { stage: "المرحلة 5", title: "إدارة الوحدات واللوحة المرئية", done: false },
  { stage: "المرحلة 6", title: "إدارة النزلاء", done: false },
  { stage: "المرحلة 7", title: "محرك الحجوزات", done: false },
  { stage: "المرحلة 8", title: "تقويم الحجوزات", done: false },
];

export default async function DashboardPage() {
  const session = await requirePermission("dashboard.view", "/dashboard");

  const granted = session.permissions.length;
  const total = PERMISSIONS.length;

  return (
    <>
      <PageHeader
        title={`أهلًا، ${session.name}`}
        description="هذه لوحة المعلومات التشغيلية. تُعرض عليها أرقام الإشغال والإيرادات والوصول والمغادرة فور ربط قاعدة البيانات في المرحلة القادمة."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="حالة البناء"
            description="المراحل تُنفَّذ بالترتيب، ولا تبدأ مرحلة قبل اكتمال اختبار سابقتها."
          />
          <CardBody className="space-y-1">
            {ROADMAP.map((item) => (
              <div
                key={item.stage}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted"
              >
                {item.done ? (
                  <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-ok-fg" aria-hidden />
                ) : (
                  <CircleDashed
                    className="h-[18px] w-[18px] shrink-0 text-content-subtle"
                    aria-hidden
                  />
                )}
                <span
                  className={
                    item.done
                      ? "text-sm font-medium text-content"
                      : "text-sm text-content-muted"
                  }
                >
                  {item.title}
                </span>
                <span className="ms-auto shrink-0">
                  {item.done ? (
                    <Badge tone="ok">مكتملة</Badge>
                  ) : (
                    <span className="text-[12px] text-content-subtle">{item.stage}</span>
                  )}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="حسابك الحالي" />
          <CardBody className="space-y-4">
            <div>
              <p className="text-[12px] text-content-subtle">الدور الوظيفي</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-content">
                <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden />
                {ROLE_LABELS[session.role]}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-content-muted">
                {ROLE_DESCRIPTIONS[session.role]}
              </p>
            </div>

            <div className="border-t border-line pt-4">
              <p className="text-[12px] text-content-subtle">الصلاحيات الممنوحة</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-content">
                {formatNumber(granted)}
                <span className="text-base font-normal text-content-subtle">
                  {" "}
                  / {formatNumber(total)}
                </span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-inset">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.round((granted / total) * 100)}%` }}
                  aria-hidden
                />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-content-muted">
                القائمة الجانبية تعرض الشاشات المسموح بها لدورك فقط. جرّب تسجيل الدخول
                بحساب آخر لملاحظة اختلاف الواجهة.
              </p>
            </div>

            <div className="border-t border-line pt-4">
              <Link
                href="/units"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 hover:text-brand-800"
              >
                استعراض شاشات النظام
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="ما الذي ستعرضه هذه اللوحة"
          description="كل رقم سيُقرأ من قاعدة البيانات مباشرة — لا أرقام ثابتة ولا رسوم توضيحية بلا معنى."
        />
        <CardBody>
          <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "نسبة الإشغال والوحدات المشغولة والمتاحة",
              "الوصول والمغادرة اليوم",
              "النزلاء الحاليون وحجوزات اليوم",
              "الوحدات التي تحتاج تنظيف",
              "الوحدات تحت الصيانة",
              "إيراد اليوم وإيراد الشهر",
              "الدفعات المستلمة اليوم",
              "الأرصدة المستحقة على النزلاء",
              "اتجاه الإشغال والإيراد ومصادر الحجز",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5 py-1">
                <LayoutDashboard
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-subtle"
                  aria-hidden
                />
                <span className="text-[13px] leading-relaxed text-content-muted">{item}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
