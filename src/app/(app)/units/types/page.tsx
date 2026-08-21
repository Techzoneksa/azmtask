import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/guard";
import { getCurrentProperty } from "@/server/services/property.service";
import { listUnitTypes } from "@/server/services/unit.service";

import { UnitTypesManager } from "../components/UnitTypesManager";

/**
 * The unit type catalogue.
 *
 * Behind `units.manage` rather than `units.view`: reception reads types through the
 * rooms that use them, but changing a base rate moves money on every future booking.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "أنواع الوحدات" };

export default async function UnitTypesPage() {
  await requirePermission("units.manage");

  const property = await getCurrentProperty();
  if (!property) {
    return (
      <div className="space-y-6">
        <PageHeader title="أنواع الوحدات" description="السعة والسعر الأساسي لكل نوع" />
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لا توجد منشأة مُهيّأة بعد</p>
        </div>
      </div>
    );
  }

  const types = await listUnitTypes(property.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="أنواع الوحدات"
        description={`${types.length} نوع في ${property.name}`}
        actions={
          <Link
            href="/units"
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-content transition-colors hover:bg-surface-inset"
          >
            <ArrowRight className="size-4" aria-hidden />
            كل الوحدات
          </Link>
        }
      />

      <UnitTypesManager types={types} />
    </div>
  );
}
