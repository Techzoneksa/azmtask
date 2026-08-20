import { Boxes } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "المخزون" };

export default async function Page() {
  await requirePermission("inventory.view", "/inventory");

  return (
    <ModuleScaffold
      title="المخزون"
      description="أصناف المستودع وحركات الإدخال والإخراج وتنبيهات النقص."
      icon={Boxes}
      stage="المرحلة 17"
      capabilities={[
        "تصنيفات وأصناف مع الكمية الحالية والحد الأدنى",
        "حركات إدخال وإخراج تُحدّث الكميات فعليًا",
        "تنبيهات انخفاض المخزون",
        "سجل حركة كامل لكل صنف",
      ]}
    />
  );
}
