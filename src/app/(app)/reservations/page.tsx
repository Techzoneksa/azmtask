import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "الحجوزات" };

export default async function Page() {
  await requirePermission("reservations.view", "/reservations");

  return (
    <ModuleScaffold
      title="الحجوزات"
      description="إنشاء الحجوزات ومتابعتها، والتقويم التشغيلي، وتسجيل الدخول والخروج."
      icon={CalendarDays}
      stage="المرحلة 7 و 8"
      capabilities={[
        "إنشاء حجز كامل مع اختيار النزيل والوحدة واحتساب السعر تلقائيًا",
        "منع تعارض الحجوزات على نفس الوحدة في تواريخ متداخلة",
        "تقويم حجوزات بالوحدات رأسيًا والتواريخ أفقيًا",
        "إجراءات مباشرة: تسجيل دخول، إضافة دفعة، طباعة فاتورة، مغادرة",
      ]}
    />
  );
}
