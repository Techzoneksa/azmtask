import { Building2 } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "الموظفون" };

export default async function Page() {
  await requirePermission("employees.view", "/employees");

  return (
    <ModuleScaffold
      title="الموظفون"
      description="بيانات الموظفين وأقسامهم وربطهم بالمهام التشغيلية."
      icon={Building2}
      stage="مرحلة لاحقة"
      capabilities={[
        "سجل الموظفين مع القسم والمسمى الوظيفي والمنشأة",
        "ربط الموظف بمهام النظافة وبلاغات الصيانة",
        "حالة التوظيف ومتابعتها",
        "ربط الموظف بحساب مستخدم في النظام",
      ]}
    />
  );
}
