import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import { PAYMENT_STATUS, statusMeta } from "@/lib/status";
import type { UnassignedReservation } from "@/server/services/calendar.service";

/**
 * Confirmed bookings that have no room yet.
 *
 * These hold inventory but sit on no row, so a board built purely from rooms drops
 * them silently — and the desk learns about the guest when they walk in. The ones
 * arriving today come first and are marked, because that is the item somebody has to
 * act on before this evening.
 *
 * The action is "open the booking", not "assign a room here". Assignment re-checks
 * availability, takes locks and writes an audit entry; a shortcut on this screen would
 * either skip all of that or duplicate it.
 */
export function UnassignedPanel({ rows }: { rows: UnassignedReservation[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-content-subtle">
        كل الحجوزات المؤكدة لها وحدات محددة.
      </p>
    );
  }

  const arrivingToday = rows.filter((row) => row.arrivesToday);
  const later = rows.filter((row) => !row.arrivesToday);

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-content">
          <CalendarClock className="size-4 text-content-muted" aria-hidden />
          حجوزات مؤكدة بانتظار تحديد وحدة
          <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] tabular-nums text-content-muted">
            {rows.length}
          </span>
        </h2>
        {arrivingToday.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-lg bg-warn-bg px-2.5 py-1 text-[12px] font-medium text-warn-fg">
            <AlertTriangle className="size-3.5" aria-hidden />
            {arrivingToday.length} منها تصل اليوم
          </span>
        )}
      </div>

      <ul className="space-y-2">
        {[...arrivingToday, ...later].map((row) => (
          <li key={row.id}>
            <Link
              href={`/reservations/${row.id}`}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                row.arrivesToday
                  ? "border-warn-fg/40 bg-warn-bg/50 hover:bg-warn-bg"
                  : "border-line bg-surface hover:bg-surface-inset"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-content">
                  {row.guestName}
                  {row.arrivesToday && (
                    <span className="ms-2 rounded bg-warn-fg px-1.5 py-0.5 text-[10px] text-white">
                      وصول اليوم — لم تُحدّد الوحدة
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-content-muted">
                  <span className="tabular-nums" dir="ltr">
                    {row.reservationNumber}
                  </span>
                  {" · "}
                  {row.unitTypeName}
                  {" · "}
                  {formatDateShort(row.checkInDate)} — {formatDateShort(row.checkOutDate)}
                  {" · "}
                  <span className="tabular-nums">{row.nights}</span> ليلة
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {row.paymentStatus && (
                  <Badge tone={statusMeta(PAYMENT_STATUS, row.paymentStatus).tone as never}>
                    {statusMeta(PAYMENT_STATUS, row.paymentStatus).label}
                  </Badge>
                )}
                <span className="text-[12px] text-brand-700">فتح الحجز</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
