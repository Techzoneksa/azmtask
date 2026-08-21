import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, BedDouble } from "lucide-react";

import { Badge, PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { formatDateTime } from "@/lib/format";
import {
  HOUSEKEEPING_SOURCE,
  HOUSEKEEPING_STATUS,
  HOUSEKEEPING_TASK_STATUS,
  HOUSEKEEPING_TASK_TYPE,
  PRIORITY,
  statusMeta,
} from "@/lib/status";
import { AppError } from "@/server/errors";
import { HOUSEKEEPING_PERMISSIONS } from "@/server/housekeeping-rules";
import {
  getHousekeepingTask,
  listHousekeepingEmployees,
} from "@/server/services/housekeeping.service";
import { getAccessiblePropertyIds } from "@/server/services/property.service";

import { ReadinessActions } from "../components/ReadinessActions";
import { TaskActions } from "../components/TaskActions";

/**
 * One cleaning task, in full.
 *
 * The page that answers "what happened to this room": every transition with its time
 * and the person behind it, the reason the work exists, and — when the origin was a
 * departure — a link to the booking that caused it. That last one is the difference
 * between a note saying "clean after checkout" and a record that can be followed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "مهمة نظافة" };

const NONE = "—";

export default async function HousekeepingTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(HOUSEKEEPING_PERMISSIONS.view);
  const { id } = await params;

  const propertyIds = await getAccessiblePropertyIds();

  let task;
  try {
    task = await getHousekeepingTask(id, propertyIds);
  } catch (error) {
    // A task outside the caller's properties is indistinguishable from one that never
    // existed — deliberately, so an id cannot be probed.
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [canManage, canWork, canViewUnits, canViewReservations, employees] =
    await Promise.all([
      can(HOUSEKEEPING_PERMISSIONS.manage),
      can(HOUSEKEEPING_PERMISSIONS.work),
      can("units.view"),
      can("reservations.view"),
      listHousekeepingEmployees(propertyIds),
    ]);

  const room = statusMeta(HOUSEKEEPING_STATUS, task.housekeepingStatus);
  const work = statusMeta(HOUSEKEEPING_TASK_STATUS, task.status);
  const priority = statusMeta(PRIORITY, task.priority);
  const type = statusMeta(HOUSEKEEPING_TASK_TYPE, task.taskType);
  const source = statusMeta(HOUSEKEEPING_SOURCE, task.source);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`تنظيف الوحدة ${task.unitNumber}`}
        description={`${type.label} · ${source.label}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/housekeeping"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-content transition-colors hover:bg-surface-inset"
            >
              <ArrowRight className="size-4" aria-hidden />
              كل المهام
            </Link>
            <TaskActions
              task={{
                id: task.id,
                unitNumber: task.unitNumber,
                status: task.status,
                assigneeId: task.assigneeId,
              }}
              employees={employees}
              capabilities={{ canManage, canWork }}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={work.tone as never}>المهمة: {work.label}</Badge>
        <Badge tone={room.tone as never}>الوحدة: {room.label}</Badge>
        <Badge tone={priority.tone as never}>{priority.label}</Badge>
        {canManage && (
          <ReadinessActions
            unit={{
              id: task.unitId,
              unitNumber: task.unitNumber,
              housekeepingStatus: task.housekeepingStatus,
            }}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-[14px] font-semibold text-content">الوحدة</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Row
              label="رقم الوحدة"
              value={
                canViewUnits ? (
                  <Link
                    href={`/units/${task.unitId}`}
                    className="inline-flex items-center gap-1.5 tabular-nums text-brand-700 hover:underline"
                  >
                    <BedDouble className="size-3.5" aria-hidden />
                    {task.unitNumber}
                  </Link>
                ) : (
                  <span className="tabular-nums">{task.unitNumber}</span>
                )
              }
            />
            <Row label="الطابق" value={task.floor === null ? NONE : task.floor} />
            <Row label="نوع الوحدة" value={task.unitTypeName} />
            <Row label="حالة النظافة" value={room.label} />
            <Row
              label="اعتماد الجاهزية"
              value={
                task.unitInspectedAt
                  ? `${formatDateTime(task.unitInspectedAt)}${task.unitInspectedByName ? ` · ${task.unitInspectedByName}` : ""}`
                  : "لم تُعتمد"
              }
            />
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-[14px] font-semibold text-content">المهمة</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Row label="النوع" value={type.label} />
            <Row label="الأولوية" value={priority.label} />
            <Row
              label="الموظف"
              value={task.assigneeName ?? <span className="text-warn-fg">غير مسندة</span>}
            />
            <Row
              label="السبب"
              value={
                task.sourceReservation ? (
                  canViewReservations ? (
                    <Link
                      href={`/reservations/${task.sourceReservation.id}`}
                      className="tabular-nums text-brand-700 hover:underline"
                    >
                      {task.sourceReservation.reservationNumber}
                    </Link>
                  ) : (
                    <span className="tabular-nums">{task.sourceReservation.reservationNumber}</span>
                  )
                ) : (
                  source.label
                )
              }
            />
          </dl>

          {task.notes && (
            <p className="mt-3 whitespace-pre-line rounded-lg bg-surface-inset px-3 py-2 text-[12px] leading-relaxed text-content-muted">
              {task.notes}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-[14px] font-semibold text-content">التسلسل الزمني</h2>
          <dl className="space-y-3">
            <Stamp label="أُنشئت" at={task.createdAt} by={task.createdByName} />
            <Stamp label="أُسندت" at={task.assignedAt} by={task.assignedByName} />
            <Stamp label="بدأت" at={task.startedAt} by={task.startedByName} />
            <Stamp label="اكتملت" at={task.completedAt} by={task.completedByName} />
            <Stamp label="أُلغيت" at={task.cancelledAt} by={task.cancelledByName} />
          </dl>

          {task.cancellationReason && (
            <p className="mt-3 rounded-lg border border-line bg-surface-inset px-3 py-2 text-[12px] leading-relaxed text-content-muted">
              سبب الإلغاء: {task.cancellationReason}
            </p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-[14px] font-semibold text-content">سجل النشاط</h2>
        {task.activity.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-content-subtle">
            لا يوجد نشاط مسجَّل على هذه المهمة بعد.
          </p>
        ) : (
          <ol className="space-y-3">
            {task.activity.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] text-content">{entry.description}</p>
                  <p className="mt-0.5 text-[12px] text-content-subtle">
                    {entry.userName} · {formatDateTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-content-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-content">{value}</dd>
    </div>
  );
}

/** A transition that may not have happened yet — absent is a legitimate answer. */
function Stamp({
  label,
  at,
  by,
}: {
  label: string;
  at: string | null;
  by: string | null;
}) {
  if (!at) return null;
  return (
    <div>
      <dt className="text-[12px] text-content-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] tabular-nums text-content">
        {formatDateTime(at)}
        {by && <span className="ms-2 text-[12px] text-content-subtle">{by}</span>}
      </dd>
    </div>
  );
}
