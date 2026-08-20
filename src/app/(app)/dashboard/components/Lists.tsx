import { AlertTriangle, Info, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui";
import { formatAmount, formatDateShort, formatMobile, formatRelative } from "@/lib/format";
import {
  HOUSEKEEPING_TASK_STATUS,
  MAINTENANCE_STATUS,
  PAYMENT_STATUS,
  RESERVATION_STATUS,
  PRIORITY,
  RESERVATION_SOURCE,
} from "@/lib/status";
import type {
  ActivityRow,
  ArrivalRow,
  DepartureRow,
  HousekeepingSnapshot,
  LowStockRow,
  MaintenanceSnapshot,
  OperationalAlert,
  RecentReservationRow,
} from "@/server/services/dashboard.service";

/**
 * The dashboard's lists.
 *
 * All of them share two habits. Tables become stacked cards below `md` rather than
 * shrinking to illegibility, and a missing room reads "لم تُحدّد الوحدة بعد" — a
 * reservation without an assigned room is normal, not an error to paper over with
 * a dash.
 */

const UNASSIGNED = "لم تُحدّد الوحدة بعد";

function statusLabel<T extends Record<string, { label: string; tone: string }>>(
  map: T,
  key: string,
): { label: string; tone: string } {
  return map[key.toLowerCase() as keyof T] ?? { label: key, tone: "neutral" };
}

// ---------------------------------------------------------------------------

export function ArrivalsList({ rows }: { rows: ArrivalRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const payment = statusLabel(PAYMENT_STATUS, row.paymentStatus);
        const source = statusLabel(RESERVATION_SOURCE, row.source);

        return (
          <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium text-content">
                  {row.guestName}
                </span>
                <Badge tone={payment.tone as never}>{payment.label}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-content-muted">
                <span className="tabular-nums">{row.reservationNumber}</span>
                <span>{row.unitTypeName}</span>
                <span>{source.label}</span>
                {row.guestMobile && (
                  <span className="tabular-nums">{formatMobile(row.guestMobile)}</span>
                )}
              </div>
            </div>

            <div className="text-end">
              {row.unitNumber ? (
                <span className="inline-flex items-center rounded-md bg-surface-inset px-2 py-1 text-[13px] font-medium tabular-nums text-content">
                  غرفة {row.unitNumber}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-warn-bg px-2 py-1 text-[12px] font-medium text-warn-fg">
                  {UNASSIGNED}
                </span>
              )}
              <div className="mt-1 text-[12px] tabular-nums text-content-subtle">
                {formatAmount(row.balance)} متبقٍ
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DeparturesList({ rows }: { rows: DepartureRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const payment = statusLabel(PAYMENT_STATUS, row.paymentStatus);
        const owes = Number(row.balance) > 0;

        return (
          <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium text-content">
                  {row.guestName}
                </span>
                <Badge tone={payment.tone as never}>{payment.label}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-content-muted">
                <span className="tabular-nums">{row.reservationNumber}</span>
                <span>منذ {formatDateShort(row.checkInDate)}</span>
              </div>
            </div>

            <div className="text-end">
              <span className="inline-flex items-center rounded-md bg-surface-inset px-2 py-1 text-[13px] font-medium tabular-nums text-content">
                {row.unitNumber ? `غرفة ${row.unitNumber}` : UNASSIGNED}
              </span>
              {/* An outstanding balance at checkout is the one thing on this list
                  that changes what reception does next, so it is the loudest. */}
              <div
                className={`mt-1 text-[12px] font-medium tabular-nums ${
                  owes ? "text-danger-fg" : "text-content-subtle"
                }`}
              >
                {owes ? `${formatAmount(row.balance)} مستحق` : "لا يوجد مستحق"}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------

const ALERT_ICON = { high: TriangleAlert, medium: AlertTriangle, low: Info } as const;

const ALERT_STYLE = {
  high: "border-danger-fg/20 bg-danger-bg/50 text-danger-fg",
  medium: "border-warn-fg/20 bg-warn-bg/50 text-warn-fg",
  low: "border-info-fg/20 bg-info-bg/50 text-info-fg",
} as const;

export function AlertsList({ alerts }: { alerts: OperationalAlert[] }) {
  return (
    <ul className="space-y-2">
      {alerts.map((alert) => {
        const Icon = ALERT_ICON[alert.priority];
        return (
          <li
            key={alert.id}
            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${ALERT_STYLE[alert.priority]}`}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-[13px] leading-relaxed text-content">{alert.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------

export function RecentReservationsTable({ rows }: { rows: RecentReservationRow[] }) {
  return (
    <>
      {/* Desktop: a real table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[12px] text-content-muted">
              <th className="pb-2 text-start font-medium">رقم الحجز</th>
              <th className="pb-2 text-start font-medium">النزيل</th>
              <th className="pb-2 text-start font-medium">الإقامة</th>
              <th className="pb-2 text-start font-medium">الوحدة</th>
              <th className="pb-2 text-start font-medium">الحالة</th>
              <th className="pb-2 text-end font-medium">الإجمالي</th>
              <th className="pb-2 text-end font-medium">المتبقي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const status = statusLabel(RESERVATION_STATUS, row.status);
              return (
                <tr key={row.id}>
                  <td className="py-2.5 tabular-nums text-content-muted">{row.reservationNumber}</td>
                  <td className="py-2.5 font-medium text-content">{row.guestName}</td>
                  <td className="py-2.5 tabular-nums text-content-muted">
                    {formatDateShort(row.checkInDate)} — {formatDateShort(row.checkOutDate)}
                  </td>
                  <td className="py-2.5 tabular-nums text-content-muted">
                    {row.unitNumber ?? <span className="text-content-subtle">{UNASSIGNED}</span>}
                  </td>
                  <td className="py-2.5">
                    <Badge tone={status.tone as never}>{status.label}</Badge>
                  </td>
                  <td className="py-2.5 text-end tabular-nums text-content">
                    {formatAmount(row.total)}
                  </td>
                  <td className="py-2.5 text-end tabular-nums text-content-muted">
                    {formatAmount(row.balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards. A seven-column table at 390px is unreadable however it
          is scaled, so it becomes a stack instead. */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => {
          const status = statusLabel(RESERVATION_STATUS, row.status);
          return (
            <li key={row.id} className="py-3 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-content">{row.guestName}</p>
                  <p className="mt-0.5 text-[12px] tabular-nums text-content-muted">
                    {row.reservationNumber}
                  </p>
                </div>
                <Badge tone={status.tone as never}>{status.label}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-content-muted">
                <span className="tabular-nums">
                  {formatDateShort(row.checkInDate)} — {formatDateShort(row.checkOutDate)}
                </span>
                <span>{row.unitNumber ? `غرفة ${row.unitNumber}` : UNASSIGNED}</span>
                <span className="tabular-nums">{formatAmount(row.total)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------

export function HousekeepingList({ snapshot }: { snapshot: HousekeepingSnapshot }) {
  return (
    <ul className="divide-y divide-line">
      {snapshot.tasks.map((task) => {
        const status = statusLabel(HOUSEKEEPING_TASK_STATUS, task.status);
        const priority = statusLabel(PRIORITY, task.priority);

        return (
          <li key={task.id} className="flex items-center gap-3 py-2.5 first:pt-0">
            <span className="inline-flex min-w-[3.25rem] justify-center rounded-md bg-surface-inset px-2 py-1 text-[13px] font-medium tabular-nums text-content">
              {task.unitNumber}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge tone={status.tone as never}>{status.label}</Badge>
                {(task.priority === "HIGH" || task.priority === "URGENT") && (
                  <Badge tone={priority.tone as never}>{priority.label}</Badge>
                )}
              </div>
              <p className="mt-1 truncate text-[12px] text-content-muted">
                {task.assignee ?? "لم يُسنَد بعد"}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function MaintenanceList({ snapshot }: { snapshot: MaintenanceSnapshot }) {
  return (
    <ul className="divide-y divide-line">
      {snapshot.tasks.map((task) => {
        const status = statusLabel(MAINTENANCE_STATUS, task.status);
        const priority = statusLabel(PRIORITY, task.priority);

        return (
          <li key={task.id} className="py-2.5 first:pt-0">
            <div className="flex items-start gap-3">
              <span className="inline-flex min-w-[3.25rem] shrink-0 justify-center rounded-md bg-surface-inset px-2 py-1 text-[12px] font-medium tabular-nums text-content">
                {/* Not every fault is in a room — a lobby lift has no unit. */}
                {task.unitNumber ?? "عام"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-content">{task.issue}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone={status.tone as never}>{status.label}</Badge>
                  {(task.priority === "HIGH" || task.priority === "URGENT") && (
                    <Badge tone={priority.tone as never}>{priority.label}</Badge>
                  )}
                  <span className="text-[12px] text-content-subtle">
                    {task.assignee ?? "لم يُسنَد بعد"}
                  </span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function LowStockList({ rows }: { rows: LowStockRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
          <span className="min-w-0 truncate text-[13px] text-content">{row.name}</span>
          <span className="shrink-0 text-[12px] tabular-nums">
            <span className="font-medium text-danger-fg">{Number(row.quantity)}</span>
            <span className="text-content-subtle">
              {" / "}
              {Number(row.minimumQuantity)} {row.unit}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ActivityList({ rows }: { rows: ActivityRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="flex gap-3">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] leading-snug text-content">{row.description}</p>
            <p className="mt-0.5 text-[12px] text-content-subtle">
              {/* The snapshot name from the log row, not a join to the users table. */}
              {row.userName} · {formatRelative(row.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
