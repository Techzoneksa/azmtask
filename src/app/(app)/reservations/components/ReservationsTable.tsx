import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui";
import { formatAmount, formatDateShort, formatMobile } from "@/lib/format";
import { PAYMENT_STATUS, RESERVATION_SOURCE, RESERVATION_STATUS, statusMeta } from "@/lib/status";
import type { ReservationRow } from "@/server/services/reservation.service";

/**
 * The booking directory.
 *
 * A table on desktop, stacked cards below `md` — twelve columns at 390px is
 * unreadable however it is scaled, so the small screen gets a different layout rather
 * than a horizontal scrollbar.
 *
 * A booking with no room says so in words. "لم تُحدّد الوحدة بعد" is a normal state
 * for a future arrival, and rendering it as a dash would make a deliberate decision
 * look like missing data.
 */

const UNASSIGNED = "لم تُحدّد الوحدة بعد";

function Status({ row }: { row: ReservationRow }) {
  const status = statusMeta(RESERVATION_STATUS, row.status);
  return <Badge tone={status.tone as never}>{status.label}</Badge>;
}

function Payment({ row }: { row: ReservationRow }) {
  if (!row.paymentStatus) return null;
  const payment = statusMeta(PAYMENT_STATUS, row.paymentStatus);
  return <Badge tone={payment.tone as never}>{payment.label}</Badge>;
}

export function ReservationsTable({
  rows,
  showMoney,
}: {
  rows: ReservationRow[];
  showMoney: boolean;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-[13px]">
          <caption className="sr-only">قائمة الحجوزات</caption>
          <thead>
            <tr className="border-b border-line text-[12px] text-content-muted">
              <th scope="col" className="pb-2 text-start font-medium">رقم الحجز</th>
              <th scope="col" className="pb-2 text-start font-medium">النزيل</th>
              <th scope="col" className="pb-2 text-start font-medium">الوحدة</th>
              <th scope="col" className="pb-2 text-start font-medium">النوع</th>
              <th scope="col" className="pb-2 text-start font-medium">الوصول</th>
              <th scope="col" className="pb-2 text-start font-medium">المغادرة</th>
              <th scope="col" className="pb-2 text-start font-medium">الليالي</th>
              <th scope="col" className="pb-2 text-start font-medium">الحالة</th>
              <th scope="col" className="pb-2 text-start font-medium">المصدر</th>
              {showMoney && (
                <>
                  <th scope="col" className="pb-2 text-start font-medium">السداد</th>
                  <th scope="col" className="pb-2 text-end font-medium">الإجمالي</th>
                  <th scope="col" className="pb-2 text-end font-medium">المتبقي</th>
                </>
              )}
              <th scope="col" className="pb-2 text-end font-medium">
                <span className="sr-only">فتح الحجز</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface-inset"
              >
                <td className="py-2.5">
                  <Link
                    href={`/reservations/${row.id}`}
                    className="font-medium tabular-nums text-content transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    dir="ltr"
                  >
                    {row.reservationNumber}
                  </Link>
                </td>
                <td className="py-2.5">
                  <span className="block max-w-[14rem] truncate text-content">{row.guestName}</span>
                  {row.guestMobile && (
                    <span className="block text-[12px] tabular-nums text-content-subtle" dir="ltr">
                      {formatMobile(row.guestMobile)}
                    </span>
                  )}
                </td>
                <td className="py-2.5">
                  {row.unitNumber ? (
                    <span className="tabular-nums text-content">{row.unitNumber}</span>
                  ) : (
                    <span className="text-[12px] text-warn-fg">{UNASSIGNED}</span>
                  )}
                </td>
                <td className="py-2.5 text-content-muted">{row.unitTypeName}</td>
                <td className="py-2.5 tabular-nums text-content-muted">
                  {formatDateShort(row.checkInDate)}
                </td>
                <td className="py-2.5 tabular-nums text-content-muted">
                  {formatDateShort(row.checkOutDate)}
                </td>
                <td className="py-2.5 tabular-nums text-content-muted">{row.nights}</td>
                <td className="py-2.5">
                  <Status row={row} />
                </td>
                <td className="py-2.5 text-content-muted">
                  {statusMeta(RESERVATION_SOURCE, row.source).label}
                </td>
                {showMoney && (
                  <>
                    <td className="py-2.5">
                      <Payment row={row} />
                    </td>
                    <td className="py-2.5 text-end tabular-nums text-content">
                      {formatAmount(row.total)}
                    </td>
                    <td className="py-2.5 text-end tabular-nums text-content-muted">
                      {formatAmount(row.balance)}
                    </td>
                  </>
                )}
                <td className="py-2.5 text-end">
                  <Link
                    href={`/reservations/${row.id}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-brand-700 transition-colors hover:bg-brand-50"
                  >
                    التفاصيل
                    <ChevronLeft className="size-3.5" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below lg: one card per booking, tapped as a whole. */}
      <ul className="space-y-2 lg:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/reservations/${row.id}`}
              className="block rounded-xl border border-line bg-surface p-3 transition-colors hover:bg-surface-inset"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-content">{row.guestName}</p>
                  <p className="mt-0.5 truncate text-[12px] tabular-nums text-content-muted" dir="ltr">
                    {row.reservationNumber}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Status row={row} />
                  {showMoney && <Payment row={row} />}
                </div>
              </div>

              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-2.5 text-[12px]">
                <div className="flex gap-1.5">
                  <dt className="text-content-subtle">الوصول</dt>
                  <dd className="tabular-nums text-content-muted">
                    {formatDateShort(row.checkInDate)}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-content-subtle">المغادرة</dt>
                  <dd className="tabular-nums text-content-muted">
                    {formatDateShort(row.checkOutDate)}
                  </dd>
                </div>
                <div className="col-span-2 flex gap-1.5">
                  <dt className="text-content-subtle">الوحدة</dt>
                  <dd className="min-w-0 truncate">
                    {row.unitNumber ? (
                      <span className="tabular-nums text-content-muted">
                        {row.unitNumber} · {row.unitTypeName}
                      </span>
                    ) : (
                      <span className="text-warn-fg">{UNASSIGNED}</span>
                    )}
                  </dd>
                </div>
                {showMoney && (
                  <div className="col-span-2 flex gap-1.5">
                    <dt className="text-content-subtle">الإجمالي</dt>
                    <dd className="tabular-nums text-content-muted">
                      {formatAmount(row.total)}
                      {row.balance && Number(row.balance) > 0 && (
                        <span className="ms-2 text-warn-fg">
                          متبقٍ {formatAmount(row.balance)}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
