import { FileText } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "المصروفات" };

export default async function Page() {
  await requirePermission("expenses.view", "/expenses");

  return (
    <ModuleScaffold
      title="المصروفات"
      description="تسجيل مصروفات التشغيل وتصنيفها ومتابعتها."
      icon={FileText}
      stage="المرحلة 16"
      capabilities={[
        "تسجيل مصروف بتصنيف وطريقة دفع ومرفق اختياري",
        "تصنيفات: صيانة، خدمات، مستلزمات، نظافة، رواتب، أخرى",
        "ربط المصروف بالمنشأة والمستخدم",
        "تقرير مصروفات بفترة زمنية",
      ]}
    />
  );
}
