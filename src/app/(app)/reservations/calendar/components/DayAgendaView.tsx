import Link from "next/link";
import { ChevronLeft, ChevronRight, DoorOpen, LogIn, LogOut, Moon } from "lucide-react";

import { Badge } from "@/components/ui";
import { formatDate, formatDateShort } from "@/lib/format";
import { RESERVATION_STATUS, statusMeta } from "@/lib/status";
import type { CalendarSnapshot, DayEntry } from "@/server/services/calendar.service";

/**
 * The phone view.
 *
 * Not the desktop board made small — a fourteen-column room grid at 390px is
 * unreadable at any font size, and pinching to read a room number is not an
 * operational tool. This answers the same questions in the shape a phone can hold:
 * one day at a time, as three lists and a set of counts.
 *
 * It reads the same snapshot the desktop board does. Only the presentation differs;
 * there is no second set of rules deciding what "occupied" means down here.
 */

const UNASSIGNED = "لم تُحدّد الوحدة بعد";

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function Entry({ entry }: { entry: DayEntry }) {
  const status = statusMeta(RESERVATION_STATUS, entry.status);
  return (
    <li>
      <Link
        href={`/reservations/${entry.id}`}
        className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors hover:bg-surface-inset"
      >
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-content">{entry.guestName}</p>
          <p className="mt-0.5 truncate text-[12px] text-content-muted">
            {entry.unitNumber ? (
              <span className="tabular-nums">الوحدة {entry.unitNumber}</span>
            ) : (
              <span className="text-warn-fg">{UNASSIGNED}</span>
            )}
            {" · "}
            {formatDateShort(entry.checkInDate)} — {formatDateShort(entry.checkOutDate)}
          </p>
        </div>
        <Badge tone={status.tone as never}>{status.label}</Badge>
      </Link>
    </li>
  );
}

function Group({
  title,
  icon,
  entries,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  entries: DayEntry[];
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-3">
      <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-content">
        {icon}
        {title}
        <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] tabular-nums text-content-muted">
          {entries.length}
        </span>
      </h3>
      {entries.length === 0 ? (
        <p className="py-3 text-center text-[12px] text-content-subtle">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Tile({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-center">
      <p className={`text-[18px] font-semibold tabular-nums ${tone || "text-content"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-content-muted">{label}</p>
    </div>
  );
}

export function DayAgendaView({
  snapshot,
  hrefFor,
}: {
  snapshot: CalendarSnapshot;
  /** Builds a URL for another day, preserving the rest of the calendar state. */
  hrefFor: (day: string) => string;
}) {
  const { agenda } = snapshot;
  const { summary } = agenda;
  const isToday = summary.date === snapshot.businessDate;

  const navClass =
    "inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-medium text-content";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3">
        <Link href={hrefFor(shift(summary.date, -1))} className={navClass}>
          <ChevronRight className="size-4" aria-hidden />
          السابق
        </Link>

        <div className="min-w-0 text-center">
          <p className="truncate text-[13px] font-semibold text-content">
            {formatDate(summary.date)}
          </p>
          {isToday && <p className="text-[11px] text-brand-700">اليوم</p>}
        </div>

        <Link href={hrefFor(shift(summary.date, 1))} className={navClass}>
          التالي
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="مشغولة" value={summary.occupied} />
        <Tile label="متاحة" value={summary.available} tone="text-ok-fg" />
        <Tile label="وصول" value={summary.arrivals} />
        <Tile label="مغادرة" value={summary.departures} />
        <Tile
          label="موقوفة"
          value={summary.blocked}
          tone={summary.blocked > 0 ? "text-warn-fg" : ""}
        />
        <Tile
          label="صيانة"
          value={summary.maintenance}
          tone={summary.maintenance > 0 ? "text-danger-fg" : ""}
        />
      </div>

      {summary.unassignedArrivals > 0 && (
        <p className="rounded-xl border border-warn-fg/40 bg-warn-bg px-3 py-2.5 text-[12px] font-medium text-warn-fg">
          {summary.unassignedArrivals} وصول اليوم بلا وحدة محددة — يحتاج تحديد وحدة قبل الوصول.
        </p>
      )}

      <Group
        title="الوصول"
        icon={<LogIn className="size-4 text-content-muted" aria-hidden />}
        entries={agenda.arrivals}
        empty="لا وصول في هذا اليوم."
      />
      <Group
        title="المغادرة"
        icon={<LogOut className="size-4 text-content-muted" aria-hidden />}
        entries={agenda.departures}
        empty="لا مغادرة في هذا اليوم."
      />
      <Group
        title="مقيمون"
        icon={<Moon className="size-4 text-content-muted" aria-hidden />}
        entries={agenda.staying}
        empty="لا إقامات مستمرة في هذا اليوم."
      />

      <section className="rounded-xl border border-line bg-surface p-3">
        <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-content">
          <DoorOpen className="size-4 text-ok-fg" aria-hidden />
          وحدات متاحة
          <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] tabular-nums text-content-muted">
            {agenda.availableUnits.length}
          </span>
        </h3>
        {agenda.availableUnits.length === 0 ? (
          <p className="py-3 text-center text-[12px] text-content-subtle">
            لا توجد وحدات متاحة في هذا اليوم.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {agenda.availableUnits.map((unit) => (
              <li key={unit.id}>
                <Link
                  href={`/units/${unit.id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] tabular-nums text-content transition-colors hover:bg-surface-inset"
                >
                  {unit.unitNumber}
                  <span className="text-[10px] text-content-subtle">{unit.unitTypeName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
