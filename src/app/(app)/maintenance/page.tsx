import { Wrench } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "الصيانة" };

export default async function Page() {
  await requirePermission("maintenance.view", "/maintenance");

  return (
    <ModuleScaffold
      title="الصيانة"
      description="بلاغات الصيانة وإسنادها ومتابعتها حتى الإغلاق."
      icon={Wrench}
      stage="المرحلة 11"
      capabilities={[
        "فتح بلاغ صيانة على وحدة محددة مع وصف العطل والأولوية",
        "إسناد البلاغ لموظف ومتابعة حالته",
        "إيقاف الوحدة عن الخدمة عند الحاجة حتى إصلاح العطل",
        "سجل كامل للبلاغات المغلقة",
      ]}
    />
  );
}
