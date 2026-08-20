import { Coffee } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "منافذ الخدمة" };

export default async function Page() {
  await requirePermission("outlets.view", "/outlets");

  return (
    <ModuleScaffold
      title="منافذ الخدمة"
      description="الخدمات الإضافية التي تُضاف على حساب النزيل."
      icon={Coffee}
      stage="المرحلة 14"
      capabilities={[
        "إضافة رسوم خدمة على حساب النزيل: مطعم، غسيل، نقل، سرير إضافي",
        "احتساب الكمية والسعر والضريبة لكل خدمة",
        "تحديث رصيد الحجز تلقائيًا",
        "ظهور الخدمات في فاتورة النزيل",
      ]}
    />
  );
}
