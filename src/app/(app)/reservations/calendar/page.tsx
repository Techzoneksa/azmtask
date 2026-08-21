import Link from "next/link";
import type { Metadata } from "next";
import { CalendarPlus, List } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { formatNumber } from "@/lib/format";
import {
  ALLOWED_DAYS,
  DEFAULT_DAYS,
  getReservationCalendar,
} from "@/server/services/calendar.service";
import { getAccessiblePropertyIds, getCurrentProperty } from "@/server/services/property.service";

import { CalendarControls } from "./components/CalendarControls";
import { CalendarGrid } from "./components/CalendarGrid";
import { DayAgendaView } from "./components/DayAgendaView";
import { UnassignedPanel } from "./components/UnassignedPanel";

/**
 * The occupancy board.
 *
 * A view of the Stage 7 engine, never a second one. Every bar on it exists because a
 * row in the database says so, and every rule it draws with — what holds a room, when
 * a room is free again — is imported rather than restated. There is no drag-to-move
 * here on purpose: dragging a booking is an edit, and an edit needs an availability
 * re-check, locks, pricing, invoice protection and an audit entry. Those exist, on the
 * booking page, and a shortcut past them would be a second engine with none of it.
 *
 * Dynamic: a booking is confirmed while somebody is looking at this screen, and a
 * board cached for a minute sends the desk to a room that has just been sold.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "تقويم الحجوزات" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePermission("reservations.view", "/reservations/calendar");

  const [property, propertyIds, canCreate, canOpenUnit] = await Promise.all([
    getCurrentProperty(),
    getAccessiblePropertyIds(),
    can("reservations.create"),
    can("units.view"),
  ]);

  if (!property) {
    return (
      <div className="space-y-6">
        <PageHeader title="تقويم الحجوزات" description="الإشغال والتوفر على محور زمني" />
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لا توجد منشأة مُهيّأة بعد</p>
        </div>
      </div>
    );
  }

  const raw = await searchParams;
  const value = (key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key]);

  const requestedDays = Number.parseInt(value("days") ?? "", 10);
  const floor = Number.parseInt(value("floor") ?? "", 10);

  const snapshot = await getReservationCalendar(
    propertyIds,
    {
      from: value("from"),
      days: Number.isFinite(requestedDays) ? requestedDays : DEFAULT_DAYS,
      floor: Number.isFinite(floor) ? floor : undefined,
      unitTypeId: value("unitTypeId"),
      includeTentative: value("tentative") === "1",
      day: value("day"),
    },
    new Set(session.permissions),
  );

  /** Preserves the whole calendar state while changing one parameter. */
  const hrefWith = (key: string, next: string) => {
    const params = new URLSearchParams();
    for (const [name, raw_] of Object.entries(raw)) {
      const single = Array.isArray(raw_) ? raw_[0] : raw_;
      if (single) params.set(name, single);
    }
    params.set(key, next);
    return `/reservations/calendar?${params}`;
  };

  const { summary } = snapshot.agenda;

  return (
    <div className="space-y-5">
      <PageHeader
        title="تقويم الحجوزات"
        description={`${formatNumber(snapshot.totalUnits)} وحدة · ${snapshot.from} إلى ${snapshot.to}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/reservations"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-content transition-colors hover:bg-surface-inset"
            >
              <List className="size-4" aria-hidden />
              قائمة الحجوزات
            </Link>
            {canCreate && (
              <Link
                href="/reservations/new"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
              >
                <CalendarPlus className="size-4" aria-hidden />
                حجز جديد
              </Link>
            )}
          </div>
        }
      />

      {/* Today's operational figures, always about the business date on desktop. */}
      <section
        aria-label="ملخص اليوم"
        className="hidden grid-cols-3 gap-2 sm:grid lg:grid-cols-6"
      >
        <Stat label="مشغولة" value={summary.occupied} />
        <Stat label="متاحة" value={summary.available} tone="text-ok-fg" />
        <Stat label="وصول اليوم" value={summary.arrivals} />
        <Stat label="مغادرة اليوم" value={summary.departures} />
        <Stat
          label="موقوفة"
          value={summary.blocked}
          tone={summary.blocked > 0 ? "text-warn-fg" : undefined}
        />
        <Stat
          label="صيانة"
          value={summary.maintenance}
          tone={summary.maintenance > 0 ? "text-danger-fg" : undefined}
        />
      </section>

      {/* Desktop and tablet: the board. */}
      <div className="hidden sm:block">
        <CalendarControls
          options={{
            floors: snapshot.floors,
            unitTypes: snapshot.unitTypes,
            businessDate: snapshot.businessDate,
            from: snapshot.from,
            days: snapshot.days,
            allowedDays: ALLOWED_DAYS,
          }}
        />
      </div>

      <div className="hidden sm:block">
        {snapshot.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
            <p className="text-[15px] font-medium text-content">
              لا توجد وحدات لعرضها في التقويم
            </p>
            <p className="mt-1.5 text-[13px] text-content-muted">
              {snapshot.totalUnits === 0
                ? "أضِف وحدات للمنشأة أولًا."
                : "جرّب إزالة الفلاتر لعرض بقية الوحدات."}
            </p>
          </div>
        ) : (
          /*
           * No "no reservations" empty state here on purpose: an empty grid is the
           * answer. Replacing it with a message would hide the very thing the
           * receptionist came to see — which rooms are free.
           */
          <CalendarGrid snapshot={snapshot} canOpenUnit={canOpenUnit} />
        )}
      </div>

      <div className="hidden sm:block">
        <UnassignedPanel rows={snapshot.unassigned} />
      </div>

      {/* Phone: the same data, one day at a time. */}
      <div className="sm:hidden">
        <DayAgendaView snapshot={snapshot} hrefFor={(day) => hrefWith("day", day)} />
        {snapshot.unassigned.length > 0 && (
          <div className="mt-3">
            <UnassignedPanel rows={snapshot.unassigned} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className={`text-[20px] font-semibold tabular-nums ${tone ?? "text-content"}`}>
        {formatNumber(value)}
      </p>
      <p className="mt-0.5 truncate text-[12px] text-content-muted">{label}</p>
    </div>
  );
}
