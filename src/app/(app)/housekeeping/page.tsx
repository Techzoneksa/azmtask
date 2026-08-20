import { Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "النظافة" };

export default async function Page() {
  await requirePermission("housekeeping.view", "/housekeeping");

  return (
    <ModuleScaffold
      title="النظافة"
      description="مهام التنظيف وتوزيعها على الموظفين ومتابعة حالة كل وحدة."
      icon={Sparkles}
      stage="المرحلة 10"
      capabilities={[
        "إنشاء مهمة نظافة وإسنادها لموظف مع تحديد الأولوية",
        "بدء المهمة وإنهاؤها وتحديث حالة الوحدة تلقائيًا",
        "تحويل الوحدة تلقائيًا إلى «تحتاج تنظيف» بعد المغادرة",
        "إرجاع الوحدة إلى «متاحة» بعد اكتمال التنظيف",
      ]}
    />
  );
}
