import { Users } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "النزلاء" };

export default async function Page() {
  await requirePermission("guests.view", "/guests");

  return (
    <ModuleScaffold
      title="النزلاء"
      description="سجل النزلاء وبياناتهم وتاريخ إقاماتهم وحساباتهم المالية."
      icon={Users}
      stage="المرحلة 6"
      capabilities={[
        "بحث سريع بالاسم أو الجوال أو رقم الهوية",
        "ملف نزيل بتبويبات: البيانات، الحجوزات، المدفوعات، الفواتير، الملاحظات",
        "منع تكرار إنشاء النزيل نفسه",
        "سجل إقامات كامل لكل نزيل",
      ]}
    />
  );
}
