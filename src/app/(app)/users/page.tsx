import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "المستخدمون والصلاحيات" };

export default async function Page() {
  await requirePermission("users.view", "/users");

  return (
    <ModuleScaffold
      title="المستخدمون والصلاحيات"
      description="حسابات الدخول والأدوار والصلاحيات الممنوحة لكل دور."
      icon={ShieldCheck}
      stage="المرحلة 18"
      capabilities={[
        "إنشاء مستخدم وربطه بموظف ودور وظيفي",
        "تعديل صلاحيات كل دور بشكل تفصيلي",
        "تفعيل وإيقاف الحسابات",
        "تطبيق الصلاحيات على الخادم وليس بإخفاء الأزرار فقط",
      ]}
    />
  );
}
