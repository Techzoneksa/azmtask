import Link from "next/link";
import type { Metadata } from "next";
import { CalendarPlus } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { formatNumber } from "@/lib/format";
import { getBusinessDateContext } from "@/server/business-date";
import {
  ReservationFilterSchema,
  listReservations,
} from "@/server/services/reservation.service";
import {
  getAccessiblePropertyIds,
  getCurrentProperty,
} from "@/server/services/property.service";
import { listUnitTypes } from "@/server/services/unit.service";
import { toISODate } from "@/lib/datetime";

import { PagerLinks } from "./components/PagerLinks";
import { ReservationFilters } from "./components/ReservationFilters";
import { ReservationsTable } from "./components/ReservationsTable";

/**
 * The booking directory.
 *
 * Dynamic: a booking is confirmed or cancelled while someone is looking at this
 * screen, and a list cached for a minute sends the desk to argue with a guest about a
 * room that was released.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "الحجوزات" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReservationsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePermission("reservations.view", "/reservations");

  const [property, propertyIds, canCreate, businessDate] = await Promise.all([
    getCurrentProperty(),
    getAccessiblePropertyIds(),
    can("reservations.create"),
    getBusinessDateContext(),
  ]);

  if (!property) {
    return (
      <div className="space-y-6">
        <PageHeader title="الحجوزات" description="إدارة الحجوزات والتوفر والأسعار" />
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لا توجد منشأة مُهيّأة بعد</p>
        </div>
      </div>
    );
  }

  const raw = await searchParams;
  const value = (key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key]);

  /*
   * A hand-edited or stale URL falls back to defaults rather than erroring. Someone
   * arriving from an old bookmark should see the bookings, not a stack trace.
   */
  const parsed = ReservationFilterSchema.safeParse({
    q: value("q"),
    status: value("status"),
    paymentStatus: value("paymentStatus"),
    source: value("source"),
    unitTypeId: value("unitTypeId"),
    unitId: value("unitId"),
    arrival: value("arrival"),
    departure: value("departure"),
    from: value("from"),
    to: value("to"),
    unassigned: value("unassigned"),
    page: value("page") ?? 1,
    pageSize: 25,
  });

  const filters = parsed.success
    ? parsed.data
    : ReservationFilterSchema.parse({ page: 1, pageSize: 25 });

  const permissions = new Set(session.permissions);
  const showMoney = permissions.has("payments.view");

  const [{ rows, total, page, pageSize }, unitTypes] = await Promise.all([
    listReservations(propertyIds, filters, permissions),
    listUnitTypes(property.id),
  ]);

  const filtered = Boolean(
    filters.q || filters.status || filters.paymentStatus || filters.source ||
      filters.unitTypeId || filters.arrival || filters.departure || filters.from ||
      filters.to || filters.unassigned,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="الحجوزات"
        description={`${formatNumber(total)} حجز${filtered ? " مطابق للفلاتر" : ""} في ${property.name}`}
        actions={
          canCreate ? (
            <Link
              href="/reservations/new"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
            >
              <CalendarPlus className="size-4" aria-hidden />
              حجز جديد
            </Link>
          ) : undefined
        }
      />

      <ReservationFilters
        options={{
          unitTypes: unitTypes.map((type) => ({ id: type.id, name: type.name })),
          businessDate: toISODate(businessDate.date),
        }}
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          {filtered ? (
            <>
              <p className="text-[15px] font-medium text-content">لا يوجد حجز مطابق</p>
              <p className="mt-1.5 text-[13px] text-content-muted">
                جرّب توسيع الفترة أو إزالة بعض الفلاتر.
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-content">لم تُسجَّل حجوزات بعد</p>
              <p className="mt-1.5 text-[13px] text-content-muted">
                ابدأ بحجز جديد — اختر النزيل والتواريخ، وسيعرض النظام الوحدات المتاحة فعليًا.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-3 sm:p-4">
          <ReservationsTable rows={rows} showMoney={showMoney} />
          {total > pageSize && (
            <div className="mt-4 border-t border-line pt-4">
              <PagerLinks
                page={page}
                pageSize={pageSize}
                total={total}
                params={{
                  q: filters.q,
                  status: filters.status,
                  paymentStatus: filters.paymentStatus,
                  source: filters.source,
                  unitTypeId: filters.unitTypeId,
                  unassigned: filters.unassigned ? "true" : undefined,
                  arrival: filters.arrival ? toISODate(filters.arrival) : undefined,
                  departure: filters.departure ? toISODate(filters.departure) : undefined,
                  from: filters.from ? toISODate(filters.from) : undefined,
                  to: filters.to ? toISODate(filters.to) : undefined,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
