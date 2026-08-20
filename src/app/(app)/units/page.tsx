import { BedDouble } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "الوحدات" };

export default async function Page() {
  await requirePermission("units.view", "/units");

  return (
    <ModuleScaffold
      title="الوحدات"
      description="إدارة الغرف والشقق وحالاتها التشغيلية ولوحة العرض المرئية."
      icon={BedDouble}
      stage="المرحلة 5"
      capabilities={[
        "قائمة الوحدات مع الحالة التشغيلية وحالة النظافة والنزيل الحالي",
        "لوحة مرئية للوحدات بألوان الحالات",
        "تفاصيل الوحدة: الحجز الحالي، السجل، النظافة، الصيانة",
        "تصفية حسب الدور ونوع الوحدة والحالة",
      ]}
    />
  );
}
