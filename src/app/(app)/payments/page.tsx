import { CreditCard } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "المدفوعات" };

export default async function Page() {
  await requirePermission("payments.view", "/payments");

  return (
    <ModuleScaffold
      title="المدفوعات"
      description="تسجيل دفعات الحجوزات وتحديث الأرصدة تلقائيًا."
      icon={CreditCard}
      stage="المرحلة 12"
      capabilities={[
        "تسجيل دفعة بطرق متعددة: نقدًا، شبكة، تحويل بنكي",
        "تحديث المبلغ المدفوع والرصيد المتبقي للحجز تلقائيًا",
        "منع إدخال مبالغ غير صحيحة أو سالبة",
        "ربط كل دفعة بالحجز والنزيل والمستخدم الذي سجّلها",
      ]}
    />
  );
}
