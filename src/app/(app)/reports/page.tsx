import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "التقارير" };

export default async function Page() {
  await requirePermission("reports.view", "/reports");

  return (
    <ModuleScaffold
      title="التقارير"
      description="تقارير تشغيلية ومالية مبنية على بيانات النظام الفعلية."
      icon={ClipboardList}
      stage="المرحلة 20"
      capabilities={[
        "الإشغال، الحجوزات، الوصول، المغادرة، الإيرادات",
        "المدفوعات، الأرصدة المستحقة، المصروفات",
        "النظافة، الصيانة، النزلاء",
        "تصفية بفترة زمنية مع مجاميع وبنية جاهزة للتصدير",
      ]}
    />
  );
}
