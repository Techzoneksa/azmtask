import { Receipt } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "الفواتير" };

export default async function Page() {
  await requirePermission("invoices.view", "/invoices");

  return (
    <ModuleScaffold
      title="الفواتير"
      description="إصدار فواتير الإقامة والخدمات بصيغة جاهزة للطباعة."
      icon={Receipt}
      stage="المرحلة 13"
      capabilities={[
        "فاتورة تفصيلية: الإقامة، الخدمات، الخصم، الضريبة، المدفوع، المتبقي",
        "عرض جاهز للطباعة وتصدير PDF",
        "ربط الفاتورة بالحجز والنزيل",
        "متابعة حالة السداد لكل فاتورة",
      ]}
    />
  );
}
