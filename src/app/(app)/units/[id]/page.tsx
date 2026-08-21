import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BedDouble, Lock, Users, Wallet } from "lucide-react";

import { Badge, PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { formatAmount, formatDate, formatDateShort, formatMobile, formatRelative } from "@/lib/format";
import {
  HOUSEKEEPING_STATUS,
  HOUSEKEEPING_TASK_STATUS,
  MAINTENANCE_STATUS,
  PAYMENT_STATUS,
  PRIORITY,
  RESERVATION_SOURCE,
  RESERVATION_STATUS,
  UNIT_STATUS,
} from "@/lib/status";
import { AppError } from "@/server/errors";
import { getCurrentProperty } from "@/server/services/property.service";
import { getUnitDetails, listUnitTypes } from "@/server/services/unit.service";

import { UnitActions } from "../components/UnitActions";

/**
 * One room, in full.
 *
 * Read-only apart from the two operational decisions this phase owns: taking the
 * room off the market and putting it back. Everything else — the stay, the cleaning
 * task, the fault — is shown as it stands and edited in the module that owns it.
 */
export const dynamic = "force-dynamic";

const BLOCK_REASONS: Record<string, string> = {
  RENOVATION: "تجديد",
  DEEP_CLEANING: "تنظيف عميق",
  STAFF_USE: "استخدام الطاقم",
  OWNER_USE: "استخدام المالك",
  LONG_TERM_MAINTENANCE: "صيانة طويلة",
  SEASONAL_CLOSURE: "إغلاق موسمي",
  OTHER: "أخرى",
};

function label<T extends Record<string, { label: string; tone: string }>>(map: T, key: string) {
  return map[key.toLowerCase() as keyof T] ?? { label: key, tone: "neutral" };
}

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-content">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-content-subtle">{children}</p>;
}

function Field({ label: name, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-content-muted">{name}</dt>
      <dd className="mt-0.5 text-[13px] text-content">{value}</dd>
    </div>
  );
}

export default async function UnitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("units.view");

  const property = await getCurrentProperty();
  if (!property) notFound();

  const { id } = await params;

  let unit;
  try {
    unit = await getUnitDetails(property.id, id);
  } catch (error) {
    // A unit from another property is indistinguishable from one that never
    // existed — deliberately, so an id cannot be probed for existence.
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const canChangeStatus = await can("units.status.change");
  const canManage = await can("units.manage");
  const canViewGuests = await can("guests.view");

  // Only fetched when editing is actually on offer — the list feeds the type select.
  const unitTypes = canManage
    ? (await listUnitTypes(property.id)).map((type) => ({
        id: type.id,
        name: type.name,
        capacity: type.capacity,
      }))
    : [];

  const status = label(UNIT_STATUS, unit.status);
  const housekeeping = label(HOUSEKEEPING_STATUS, unit.housekeepingStatus);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`الوحدة ${unit.unitNumber}`}
        description={`${unit.unitType.name}${unit.floor === null ? "" : ` · الطابق ${unit.floor}`}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/units"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-content transition-colors hover:bg-surface-inset"
            >
              <ArrowRight className="size-4" aria-hidden />
              كل الوحدات
            </Link>
            <UnitActions
              unitId={unit.id}
              unitNumber={unit.unitNumber}
              status={unit.status}
              isBlocked={unit.block !== null}
              canChangeStatus={canChangeStatus}
              canManage={canManage}
              unitTypes={unitTypes}
              unit={{
                unitId: unit.id,
                unitNumber: unit.unitNumber,
                unitTypeId: unit.unitType.id,
                floor: unit.floor,
                notes: unit.notes,
              }}
            />
          </div>
        }
      />

      {/* The reason a room is withheld belongs at the top — it is the first thing
          anyone opening this page needs to know. */}
      {unit.block && (
        <div className="flex items-start gap-3 rounded-xl border border-content-subtle/25 bg-surface-inset px-4 py-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-content-muted" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-content">
              الوحدة موقوفة — {BLOCK_REASONS[unit.block.reason] ?? unit.block.reason}
            </p>
            <p className="mt-1 text-[12px] text-content-muted">
              من {formatDate(unit.block.startDate)}
              {unit.block.endDate ? ` حتى ${formatDate(unit.block.endDate)}` : " (بلا تاريخ انتهاء)"}
              {unit.block.createdBy && ` · بواسطة ${unit.block.createdBy}`}
            </p>
            {unit.block.notes && (
              <p className="mt-1 text-[12px] text-content-muted">{unit.block.notes}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="بيانات الوحدة">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="رقم الوحدة" value={<span className="tabular-nums">{unit.unitNumber}</span>} />
            <Field label="الطابق" value={unit.floor === null ? "—" : unit.floor} />
            <Field label="النوع" value={unit.unitType.name} />
            <Field label="السعة" value={`${unit.unitType.capacity} أشخاص`} />
            <Field label="السعر الأساسي" value={formatAmount(unit.unitType.baseRate)} />
            <Field
              label="الحالة"
              value={<Badge tone={status.tone as never}>{status.label}</Badge>}
            />
            <Field
              label="النظافة"
              value={<Badge tone={housekeeping.tone as never}>{housekeeping.label}</Badge>}
            />
            <Field
              label="الصيانة"
              value={unit.maintenanceStatus === "OPERATIONAL" ? "صالحة للتشغيل" : "خارج الخدمة"}
            />
          </dl>
          {unit.notes && (
            <p className="mt-3 border-t border-line pt-3 text-[12px] text-content-muted">
              {unit.notes}
            </p>
          )}
        </Panel>

        <Panel title="الإقامة الحالية">
          {unit.currentStay ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <BedDouble className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-0">
                  {/* Linked only for a reader who may open the profile — a link that
                      lands on "غير مصرح" is worse than plain text. */}
                  {canViewGuests ? (
                    <Link
                      href={`/guests/${unit.currentStay.guestId}`}
                      className="block text-[14px] font-medium text-content transition-colors hover:text-brand-700 hover:underline"
                    >
                      {unit.currentStay.guestName}
                    </Link>
                  ) : (
                    <p className="text-[14px] font-medium text-content">
                      {unit.currentStay.guestName}
                    </p>
                  )}
                  <p className="text-[12px] tabular-nums text-content-muted">
                    {unit.currentStay.reservationNumber}
                    {unit.currentStay.guestMobile && ` · ${formatMobile(unit.currentStay.guestMobile)}`}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <Field label="الوصول" value={formatDateShort(unit.currentStay.checkInDate)} />
                <Field label="المغادرة" value={formatDateShort(unit.currentStay.checkOutDate)} />
                <Field
                  label="النزلاء"
                  value={
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5 text-content-subtle" aria-hidden />
                      {unit.currentStay.adults}
                      {unit.currentStay.children > 0 && ` + ${unit.currentStay.children} أطفال`}
                    </span>
                  }
                />
                <Field
                  label="السداد"
                  value={
                    <Badge tone={label(PAYMENT_STATUS, unit.currentStay.paymentStatus).tone as never}>
                      {label(PAYMENT_STATUS, unit.currentStay.paymentStatus).label}
                    </Badge>
                  }
                />
              </dl>
              {Number(unit.currentStay.balance) > 0 && (
                <p className="flex items-center gap-1.5 rounded-lg bg-warn-bg px-3 py-2 text-[12px] font-medium text-warn-fg">
                  <Wallet className="size-3.5" aria-hidden />
                  رصيد مستحق {formatAmount(unit.currentStay.balance)}
                </p>
              )}
            </div>
          ) : (
            <Empty>لا يوجد نزيل في الوحدة حاليًا</Empty>
          )}
        </Panel>

        <Panel title="الحجز القادم">
          {unit.upcoming ? (
            <div className="space-y-2.5">
              <p className="text-[14px] font-medium text-content">{unit.upcoming.guestName}</p>
              <p className="text-[12px] tabular-nums text-content-muted">
                {unit.upcoming.reservationNumber}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <Field label="الوصول" value={formatDateShort(unit.upcoming.checkInDate)} />
                <Field label="المغادرة" value={formatDateShort(unit.upcoming.checkOutDate)} />
                <Field
                  label="المصدر"
                  value={
                    RESERVATION_SOURCE[
                      unit.upcoming.source.toLowerCase() as keyof typeof RESERVATION_SOURCE
                    ]?.label ?? unit.upcoming.source
                  }
                />
              </dl>
            </div>
          ) : (
            <Empty>لا توجد حجوزات قادمة لهذه الوحدة</Empty>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="النظافة">
          {unit.housekeeping.length === 0 ? (
            <Empty>لا توجد مهام نظافة مسجّلة لهذه الوحدة</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {unit.housekeeping.map((task) => {
                const state = label(HOUSEKEEPING_TASK_STATUS, task.status);
                const priority = label(PRIORITY, task.priority);
                return (
                  <li key={task.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={state.tone as never}>{state.label}</Badge>
                        {(task.priority === "HIGH" || task.priority === "URGENT") && (
                          <Badge tone={priority.tone as never}>{priority.label}</Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[12px] text-content-muted">
                        {task.assignee ?? "لم يُسنَد"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-content-subtle">
                      {formatRelative(task.completedAt ?? task.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="الصيانة">
          {unit.maintenance.length === 0 ? (
            <Empty>لا توجد بلاغات صيانة لهذه الوحدة</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {unit.maintenance.map((request) => {
                const state = label(MAINTENANCE_STATUS, request.status);
                return (
                  <li key={request.id} className="py-2.5 first:pt-0">
                    <p className="text-[13px] leading-snug text-content">{request.issue}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone={state.tone as never}>{state.label}</Badge>
                      <span className="text-[11px] text-content-subtle">
                        {request.assignee ?? "لم يُسنَد"} · {formatRelative(request.openedAt)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="سجل الحجوزات">
        {unit.history.length === 0 ? (
          <Empty>لم تُسجَّل حجوزات على هذه الوحدة بعد</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-content-muted">
                  <th className="pb-2 text-start font-medium">رقم الحجز</th>
                  <th className="pb-2 text-start font-medium">النزيل</th>
                  <th className="pb-2 text-start font-medium">الإقامة</th>
                  <th className="pb-2 text-start font-medium">الحالة</th>
                  <th className="pb-2 text-end font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {unit.history.map((row) => {
                  const state = label(RESERVATION_STATUS, row.status);
                  return (
                    <tr key={row.id}>
                      <td className="py-2.5 tabular-nums text-content-muted">{row.reservationNumber}</td>
                      <td className="py-2.5 text-content">{row.guestName}</td>
                      <td className="py-2.5 tabular-nums text-content-muted">
                        {formatDateShort(row.checkInDate)} — {formatDateShort(row.checkOutDate)}
                      </td>
                      <td className="py-2.5">
                        <Badge tone={state.tone as never}>{state.label}</Badge>
                      </td>
                      <td className="py-2.5 text-end tabular-nums text-content">
                        {formatAmount(row.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="سجل النشاط">
        {unit.activity.length === 0 ? (
          <Empty>لا توجد أنشطة مسجّلة على هذه الوحدة</Empty>
        ) : (
          <ul className="space-y-3">
            {unit.activity.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-content">{entry.description}</p>
                  <p className="mt-0.5 text-[12px] text-content-subtle">
                    {entry.userName} · {formatRelative(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
