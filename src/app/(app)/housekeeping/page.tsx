import { Suspense } from "react";
import type { Metadata } from "next";
import { BadgeCheck, Brush, ClipboardList, Sparkles, TriangleAlert } from "lucide-react";

import { PageHeader, StatTile } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { formatNumber } from "@/lib/format";
import { HOUSEKEEPING_PERMISSIONS } from "@/server/housekeeping-rules";
import {
  HousekeepingFilterSchema,
  getHousekeepingSummary,
  getMyHousekeepingTasks,
  listHousekeepingEmployees,
  listHousekeepingTasks,
  listUnattendedRooms,
} from "@/server/services/housekeeping.service";
import {
  getAccessiblePropertyIds,
  getCurrentProperty,
} from "@/server/services/property.service";
import { listFloors, listUnitTypes } from "@/server/services/unit.service";

import { HousekeepingFilters } from "./components/HousekeepingFilters";
import { MyTasks } from "./components/MyTasks";
import { PagerLinks } from "./components/PagerLinks";
import { TaskCard } from "./components/TaskCard";
import { TasksTable } from "./components/TasksTable";
import { UnattendedRooms } from "./components/UnattendedRooms";

/**
 * The housekeeping workspace.
 *
 * One screen serving two very different people. A supervisor at a desk wants the whole
 * floor at once — what is outstanding, who is carrying it, what is urgent. An attendant
 * on a phone wants the three rooms they have been given and a button on each. Both are
 * here, and which one leads is decided by what the signed-in user may actually do
 * rather than by their job title.
 *
 * Dynamic, never cached: a room changes state when somebody finishes a clean, and a
 * board a minute stale sends a housekeeper to a room that is already done.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "النظافة" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HousekeepingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requirePermission(HOUSEKEEPING_PERMISSIONS.view, "/housekeeping");

  const property = await getCurrentProperty();
  if (!property) {
    return (
      <div className="space-y-6">
        <PageHeader title="النظافة" description="مهام التنظيف وجاهزية الوحدات" />
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لا توجد منشأة مُهيّأة بعد</p>
        </div>
      </div>
    );
  }

  const propertyIds = await getAccessiblePropertyIds();
  const [canManage, canWork] = await Promise.all([
    can(HOUSEKEEPING_PERMISSIONS.manage),
    can(HOUSEKEEPING_PERMISSIONS.work),
  ]);

  const raw = await searchParams;
  const value = (key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key]);
  const view = value("view") === "table" ? "table" : "board";

  /*
   * A hand-edited or stale URL falls back to defaults rather than erroring: somebody
   * arriving from an old bookmark should see the floor, not a stack trace.
   */
  const parsed = HousekeepingFilterSchema.safeParse({
    q: value("q"),
    status: value("status"),
    housekeepingStatus: value("housekeepingStatus"),
    taskType: value("taskType"),
    priority: value("priority"),
    floor: value("floor"),
    unitTypeId: value("unitTypeId"),
    employeeId: value("employeeId"),
    unassigned: value("unassigned"),
    urgent: value("urgent"),
    activeOnly: value("activeOnly") ?? true,
    page: value("page") ?? 1,
    pageSize: 24,
  });

  const filters = parsed.success
    ? parsed.data
    : HousekeepingFilterSchema.parse({ page: 1, pageSize: 24 });

  const [summary, list, unattended, employees, floors, unitTypes, myTasks] =
    await Promise.all([
      getHousekeepingSummary(propertyIds),
      listHousekeepingTasks(propertyIds, filters),
      canManage ? listUnattendedRooms(propertyIds) : Promise.resolve([]),
      listHousekeepingEmployees(propertyIds),
      listFloors(property.id),
      listUnitTypes(property.id),
      getMyHousekeepingTasks(session.employeeId, propertyIds),
    ]);

  const capabilities = { canManage, canWork };
  const filtered = Boolean(
    filters.q ||
      filters.status ||
      filters.housekeepingStatus ||
      filters.taskType ||
      filters.priority ||
      filters.floor !== undefined ||
      filters.unitTypeId ||
      filters.employeeId ||
      filters.unassigned ||
      filters.urgent,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="النظافة"
        description={`${property.name} · ${formatNumber(summary.cleanRooms)} من ${formatNumber(summary.totalUnits)} وحدة نظيفة`}
      />

      {/*
        Rooms and work counted separately and named separately. "كم وحدة تحتاج تنظيفًا"
        is not "كم مهمة مفتوحة" — one room may carry no task, and a screen that blurs
        the two produces exactly the two-numbers-one-name confusion Stage 8 fixed.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="تحتاج تنظيف"
          value={formatNumber(summary.dirty)}
          hint="وحدات غير صالحة لاستقبال نزيل الآن"
          icon={<Brush className="size-4" aria-hidden />}
          tone={summary.dirty > 0 ? "warn" : "neutral"}
        />
        <StatTile
          label="جارٍ التنظيف"
          value={formatNumber(summary.cleaning)}
          hint="وحدات يعمل عليها أحد الآن"
          icon={<Sparkles className="size-4" aria-hidden />}
          tone="brand"
        />
        {/*
          "نظيفة" counts physical readiness, not sellability: an occupied room is
          clean, and so is a blocked one. What can actually be sold is a different
          question with a different owner, and the hint says so rather than leaving
          the reader to discover it from a number that will not add up.
        */}
        <StatTile
          label="نظيفة"
          value={formatNumber(summary.cleanRooms)}
          hint={`منها ${formatNumber(summary.inspected)} معتمدة بعد الفحص · التوفر للبيع يحدده الحجز والإيقاف والصيانة`}
          icon={<BadgeCheck className="size-4" aria-hidden />}
          tone="ok"
        />
        <StatTile
          label="مهام عاجلة"
          value={formatNumber(summary.urgent)}
          hint={`${formatNumber(summary.unassigned)} مهمة بلا موظف`}
          icon={<TriangleAlert className="size-4" aria-hidden />}
          tone={summary.urgent > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="بانتظار الإسناد"
          value={formatNumber(summary.pending)}
          icon={<ClipboardList className="size-4" aria-hidden />}
        />
        <StatTile label="مسندة" value={formatNumber(summary.assigned)} />
        <StatTile label="قيد التنفيذ" value={formatNumber(summary.inProgress)} />
        <StatTile
          label="أُنجزت اليوم"
          value={formatNumber(summary.completedToday)}
          tone="ok"
        />
      </div>

      {/* An attendant's own work leads, when they have any. */}
      {canWork && session.employeeId && <MyTasks tasks={myTasks} />}

      {canManage && (
        <UnattendedRooms rooms={unattended} employees={employees} canManage={canManage} />
      )}

      {/*
        Suspense around the one component that reads the query string, which is what
        Next asks for: a client component calling `useSearchParams` outside a boundary
        opts the whole route into client-side rendering.
        
        It does *not* fix the filter defect recorded in the Stage 10 report — filter
        navigations are dropped by the router in the production build on all three
        filtered screens, and this boundary changed nothing about that. It is here
        because it is correct on its own terms.
      */}
      <Suspense fallback={<div className="h-20 rounded-lg bg-surface-muted" aria-hidden />}>
        <HousekeepingFilters
          options={{
            floors,
            unitTypes: unitTypes.map((type) => ({ id: type.id, name: type.name })),
            employees: employees.map((employee) => ({ id: employee.id, name: employee.name })),
          }}
          view={view}
        />
      </Suspense>

      {list.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          {filtered ? (
            <>
              <p className="text-[15px] font-medium text-content">لا توجد مهمة مطابقة</p>
              <p className="mt-1.5 text-[13px] text-content-muted">
                جرّب إزالة بعض الفلاتر أو اعرض المهام المنتهية أيضًا.
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-content">لا توجد مهام نظافة مفتوحة</p>
              <p className="mt-1.5 text-[13px] text-content-muted">
                كل الوحدات التي تحتاج تنظيفًا تمت تغطيتها. تُنشأ مهمة تلقائيًا عند كل مغادرة.
              </p>
            </>
          )}
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="sr-only">قائمة مهام النظافة</h2>

          {view === "board" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.rows.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  employees={employees}
                  capabilities={capabilities}
                />
              ))}
            </div>
          ) : (
            <TasksTable rows={list.rows} employees={employees} capabilities={capabilities} />
          )}

          {list.total > list.pageSize && (
            <PagerLinks
              page={list.page}
              pageSize={list.pageSize}
              total={list.total}
              params={{
                q: filters.q,
                status: filters.status,
                housekeepingStatus: filters.housekeepingStatus,
                taskType: filters.taskType,
                priority: filters.priority,
                floor: filters.floor === undefined ? undefined : String(filters.floor),
                unitTypeId: filters.unitTypeId,
                employeeId: filters.employeeId,
                unassigned: filters.unassigned ? "true" : undefined,
                urgent: filters.urgent ? "true" : undefined,
                activeOnly: filters.activeOnly ? undefined : "false",
                view: view === "table" ? "table" : undefined,
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}
