import Link from "next/link";

import { Badge } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import { HOUSEKEEPING_STATUS, UNIT_STATUS } from "@/lib/status";
import type { UnitRow } from "@/server/services/unit.service";

/**
 * The list view.
 *
 * A real table on desktop, stacked cards below `md`. Ten columns squeezed into 390px
 * is unreadable at any font size, so the small screen gets a different layout rather
 * than the same one shrunk.
 */

const UNASSIGNED = "—";

function statusOf(value: string) {
  return UNIT_STATUS[value.toLowerCase() as keyof typeof UNIT_STATUS];
}

function housekeepingOf(value: string) {
  return HOUSEKEEPING_STATUS[value.toLowerCase() as keyof typeof HOUSEKEEPING_STATUS];
}

export function UnitsTable({ rows }: { rows: UnitRow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-[12px] text-content-muted">
              <th className="pb-2 text-start font-medium">الوحدة</th>
              <th className="pb-2 text-start font-medium">الطابق</th>
              <th className="pb-2 text-start font-medium">النوع</th>
              <th className="pb-2 text-start font-medium">الحالة</th>
              <th className="pb-2 text-start font-medium">النظافة</th>
              <th className="pb-2 text-start font-medium">النزيل الحالي</th>
              <th className="pb-2 text-start font-medium">المغادرة</th>
              <th className="pb-2 text-end font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const status = statusOf(row.status);
              const housekeeping = housekeepingOf(row.housekeepingStatus);

              return (
                <tr key={row.id} className="hover:bg-surface-muted">
                  <td className="py-2.5 font-medium tabular-nums text-content">{row.unitNumber}</td>
                  <td className="py-2.5 tabular-nums text-content-muted">
                    {row.floor === null ? UNASSIGNED : row.floor}
                  </td>
                  <td className="py-2.5 text-content-muted">{row.unitTypeName}</td>
                  <td className="py-2.5">
                    <Badge tone={(status?.tone ?? "neutral") as never}>
                      {status?.label ?? row.status}
                    </Badge>
                  </td>
                  <td className="py-2.5">
                    <Badge tone={(housekeeping?.tone ?? "neutral") as never}>
                      {housekeeping?.label ?? row.housekeepingStatus}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-content">
                    {row.currentGuest ?? <span className="text-content-subtle">{UNASSIGNED}</span>}
                  </td>
                  <td className="py-2.5 tabular-nums text-content-muted">
                    {row.checkOutDate ? formatDateShort(row.checkOutDate) : UNASSIGNED}
                  </td>
                  <td className="py-2.5 text-end">
                    <Link
                      href={`/units/${row.id}`}
                      className="rounded-md px-2 py-1 text-[12px] font-medium text-brand-700 hover:bg-brand-50"
                    >
                      عرض
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => {
          const status = statusOf(row.status);
          return (
            <li key={row.id}>
              <Link href={`/units/${row.id}`} className="block py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold tabular-nums text-content">
                      {row.unitNumber}
                      <span className="ms-2 text-[12px] font-normal text-content-subtle">
                        {row.floor === null ? "" : `ط${row.floor}`}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-content-muted">
                      {row.unitTypeName}
                    </p>
                  </div>
                  <Badge tone={(status?.tone ?? "neutral") as never}>
                    {status?.label ?? row.status}
                  </Badge>
                </div>
                {(row.currentGuest || row.checkOutDate) && (
                  <p className="mt-2 text-[12px] text-content-muted">
                    {row.currentGuest}
                    {row.checkOutDate && ` · مغادرة ${formatDateShort(row.checkOutDate)}`}
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
