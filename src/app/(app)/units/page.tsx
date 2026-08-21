import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/guard";
import { getCurrentProperty } from "@/server/services/property.service";
import {
  UnitFilterSchema,
  listFloors,
  listUnitTypes,
  listUnits,
} from "@/server/services/unit.service";

import { AddUnitButton } from "./components/AddUnitButton";
import { UnitCard } from "./components/UnitCard";
import { UnitFilters } from "./components/UnitFilters";
import { PagerLinks } from "./components/PagerLinks";
import { UnitsTable } from "./components/UnitsTable";

/**
 * The units workspace.
 *
 * Two views over one query. The board is for sweeping the property at a glance; the
 * list is for finding one room and acting on it. Both read the same filters from the
 * URL, so switching view never changes which rooms are in front of you.
 *
 * Dynamic, not cached: a room's state changes when someone checks in, and a board
 * that is a minute stale sends a housekeeper to the wrong floor.
 */
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function UnitsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("units.view");

  const property = await getCurrentProperty();
  if (!property) {
    return (
      <div className="space-y-6">
        <PageHeader title="الوحدات" description="إدارة وحدات المنشأة وحالتها التشغيلية" />
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لا توجد منشأة مُهيّأة بعد</p>
        </div>
      </div>
    );
  }

  const raw = await searchParams;
  const value = (key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key]);

  const view = value("view") === "table" ? "table" : "board";
  const canManage = await can("units.manage");

  /*
   * Unparseable filters fall back to defaults rather than erroring: a hand-edited or
   * stale URL should show the property, not a stack trace.
   */
  const parsed = UnitFilterSchema.safeParse({
    q: value("q"),
    floor: value("floor"),
    unitTypeId: value("type"),
    status: value("status"),
    housekeeping: value("housekeeping"),
    maintenance: value("maintenance"),
    page: value("page") ?? 1,
    // The board shows the whole filtered set — a hotel floor is a spatial thing and
    // paging through it defeats the point. The list paginates on the server.
    pageSize: view === "board" ? 100 : 25,
  });

  const filters = parsed.success
    ? parsed.data
    : UnitFilterSchema.parse({ page: 1, pageSize: view === "board" ? 100 : 25 });

  const [{ rows, total, page, pageSize }, floors, unitTypes] = await Promise.all([
    listUnits(property.id, filters),
    listFloors(property.id),
    listUnitTypes(property.id),
  ]);

  const hasFilters = Boolean(
    filters.q || filters.floor !== undefined || filters.unitTypeId || filters.status || filters.housekeeping,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="الوحدات"
        description={`${total} ${total === 1 ? "وحدة" : "وحدة"} في ${property.name}`}
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <Link
                href="/units/types"
                className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-content transition-colors hover:bg-surface-inset"
              >
                أنواع الوحدات
              </Link>
              <AddUnitButton
                unitTypes={unitTypes
                  .filter((type) => type.status === "ACTIVE")
                  .map((type) => ({ id: type.id, name: type.name, capacity: type.capacity }))}
              />
            </div>
          ) : undefined
        }
      />

      <UnitFilters options={{ floors, unitTypes: unitTypes.map((t) => ({ id: t.id, name: t.name })) }} view={view} />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          {/* Two different situations, two different messages: an empty property
              needs a first unit, an empty filter needs a wider one. */}
          {hasFilters ? (
            <>
              <p className="text-[15px] font-medium text-content">لا توجد وحدات مطابقة للفلاتر</p>
              <p className="mt-1.5 text-[13px] text-content-muted">
                جرّب توسيع نطاق البحث أو إزالة بعض الفلاتر.
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-content">لم تُضَف وحدات بعد</p>
              <p className="mt-1.5 text-[13px] text-content-muted">
                ابدأ بإضافة أنواع الوحدات ثم الوحدات نفسها.
              </p>
            </>
          )}
        </div>
      ) : view === "board" ? (
        <section
          aria-label="لوحة الوحدات"
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
        >
          {rows.map((unit) => (
            <UnitCard key={unit.id} unit={unit} />
          ))}
        </section>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4">
          <UnitsTable rows={rows} />
          {total > pageSize && (
            <div className="mt-4 border-t border-line pt-4">
              <PagerLinks
                page={page}
                pageSize={pageSize}
                total={total}
                params={{
                  view: "table",
                  q: filters.q,
                  floor: filters.floor === undefined ? undefined : String(filters.floor),
                  type: filters.unitTypeId,
                  status: filters.status,
                  housekeeping: filters.housekeeping,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
