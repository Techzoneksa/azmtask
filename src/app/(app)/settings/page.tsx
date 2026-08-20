import { Settings } from "lucide-react";
import type { Metadata } from "next";

import { ModuleScaffold } from "@/components/layout/ModuleScaffold";
import { requirePermission } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "الإعدادات" };

export default async function Page() {
  await requirePermission("settings.view", "/settings");

  return (
    <ModuleScaffold
      title="الإعدادات"
      description="إعدادات المنشأة والضريبة وأنواع الوحدات ومركز التكاملات."
      icon={Settings}
      stage="المرحلة 2 و 20"
      capabilities={[
        "بيانات المنشأة: الاسم، المدينة، الرقم الضريبي، بيانات التواصل",
        "أنواع الوحدات والأسعار الأساسية",
        "إعدادات الضريبة والعملة وسياسات الحجز",
        "مركز التكاملات مع بيان حالة كل تكامل بوضوح ودون ادعاء ربط غير قائم",
      ]}
    />
  );
}
