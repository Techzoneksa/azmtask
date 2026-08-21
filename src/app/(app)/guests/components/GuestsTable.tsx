import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui";
import { formatDateShort, formatMobile, formatNumber } from "@/lib/format";
import { identificationTypeLabel } from "@/lib/guest-identity";
import type { GuestRow } from "@/server/services/guest.service";

/**
 * The directory.
 *
 * A real table on desktop, stacked cards below `md` — eight columns compressed into
 * 390px is unreadable at any font size, so the small screen gets a different layout
 * rather than the same one shrunk with a horizontal scrollbar.
 *
 * The whole row is a link. Reception's most frequent action is "open this person",
 * and making that a small button at the end of the row would put a 44px target at the
 * end of a 1200px reach.
 */

const NONE = "—";

/** The masked document, plus a spoken form so masking is not conveyed by shape alone. */
function Document({ row }: { row: GuestRow }) {
  if (!row.identificationType || row.identificationMasked === NONE) {
    return <span className="text-content-subtle">{NONE}</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <span className="text-content-muted">{identificationTypeLabel(row.identificationType)}</span>{" "}
      <span className="tabular-nums" dir="ltr" aria-hidden>
        {row.identificationMasked}
      </span>
      <span className="sr-only">
        رقم الوثيقة مخفي، ينتهي بـ {row.identificationMasked?.replace(/^•+/, "")}
      </span>
    </span>
  );
}

function StayState({ row }: { row: GuestRow }) {
  if (row.inHouse) return <Badge tone="ok">نزيل حالي</Badge>;
  if (row.hasUpcoming) return <Badge tone="info">حجز قادم</Badge>;
  if (row.stayCount > 1) return <Badge tone="brand">متكرر</Badge>;
  if (row.stayCount === 1) return <Badge tone="neutral">أقام مرة</Badge>;
  return <span className="text-[12px] text-content-subtle">لم يقم بعد</span>;
}

export function GuestsTable({ rows }: { rows: GuestRow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13px]">
          <caption className="sr-only">قائمة النزلاء</caption>
          <thead>
            <tr className="border-b border-line text-[12px] text-content-muted">
              <th scope="col" className="pb-2 text-start font-medium">النزيل</th>
              <th scope="col" className="pb-2 text-start font-medium">الجنسية</th>
              <th scope="col" className="pb-2 text-start font-medium">الجوال</th>
              <th scope="col" className="pb-2 text-start font-medium">الوثيقة</th>
              <th scope="col" className="pb-2 text-start font-medium">الحالة</th>
              <th scope="col" className="pb-2 text-start font-medium">الإقامات</th>
              <th scope="col" className="pb-2 text-start font-medium">آخر إقامة</th>
              <th scope="col" className="pb-2 text-end font-medium">
                <span className="sr-only">فتح الملف</span>
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
                    href={`/guests/${row.id}`}
                    className="font-medium text-content hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    {row.fullName}
                  </Link>
                  {row.email && (
                    <span className="block truncate text-[12px] text-content-subtle" dir="ltr">
                      {row.email}
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-content-muted">{row.nationality ?? NONE}</td>
                <td className="py-2.5 tabular-nums" dir="ltr">
                  {formatMobile(row.mobile)}
                </td>
                <td className="py-2.5">
                  <Document row={row} />
                </td>
                <td className="py-2.5">
                  <StayState row={row} />
                </td>
                <td className="py-2.5 tabular-nums text-content-muted">
                  {formatNumber(row.stayCount)}
                </td>
                <td className="py-2.5 tabular-nums text-content-muted">
                  {row.lastStayDate ? formatDateShort(row.lastStayDate) : NONE}
                </td>
                <td className="py-2.5 text-end">
                  <Link
                    href={`/guests/${row.id}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-brand-700 transition-colors hover:bg-brand-50"
                  >
                    الملف
                    <ChevronLeft className="size-3.5" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below md: one card per guest, tapped as a whole. */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/guests/${row.id}`}
              className="block rounded-xl border border-line bg-surface p-3 transition-colors hover:bg-surface-inset"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-content">{row.fullName}</p>
                  <p className="mt-0.5 truncate text-[12px] tabular-nums text-content-muted" dir="ltr">
                    {formatMobile(row.mobile)}
                  </p>
                </div>
                <div className="shrink-0">
                  <StayState row={row} />
                </div>
              </div>

              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-2.5 text-[12px]">
                <div className="flex gap-1.5">
                  <dt className="text-content-subtle">الجنسية</dt>
                  <dd className="text-content-muted">{row.nationality ?? NONE}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-content-subtle">الإقامات</dt>
                  <dd className="tabular-nums text-content-muted">{formatNumber(row.stayCount)}</dd>
                </div>
                <div className="col-span-2 flex gap-1.5">
                  <dt className="text-content-subtle">الوثيقة</dt>
                  <dd className="min-w-0 truncate">
                    <Document row={row} />
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
