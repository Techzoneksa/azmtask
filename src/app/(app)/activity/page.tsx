import { Activity } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "سجل النشاط" };

export default async function Page() {
  await requirePermission("activity.view", "/activity");

  return (
    <ModuleScaffold
      title="سجل النشاط"
      description="تتبّع العمليات المهمة ومن نفّذها ومتى."
      icon={Activity}
      stage="المرحلة 19"
      capabilities={[
        "تسجيل: إنشاء حجز، تعديل، تسجيل دخول وخروج، دفعة، إصدار فاتورة",
        "تسجيل تغيير حالة الوحدة وإنشاء المستخدمين وتعديل الصلاحيات",
        "بحث وتصفية حسب المستخدم والوحدة والفترة",
        "إمكانية تتبّع أي تغيير مهم في النظام",
      ]}
    />
  );
}
