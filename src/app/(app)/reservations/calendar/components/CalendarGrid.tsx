import Link from "next/link";
import { Lock, Wrench } from "lucide-react";

import { RESERVATION_STATUS, statusMeta } from "@/lib/status";
import type { CalendarRow, CalendarSnapshot } from "@/server/services/calendar.service";

/**
 * The occupancy board.
 *
 * Rooms down, dates across, bookings as bars spanning the nights they hold. A CSS grid
 * rather than absolute positioning: the column count is the day count, so a bar is
 * placed by naming which column it starts in and how many it covers — which is exactly
 * the geometry the service computed, with no second arithmetic in the browser to drift
 * away from it.
 *
 * The room column is sticky. Reading a bar four weeks out is useless if the room
 * number it belongs to has scrolled off the screen.
 *
 * Colour never carries meaning alone: every bar states its status in text, and each one
 * has a screen-reader label naming the booking, the guest, the room and the dates —
 * because a position and a width communicate nothing to someone not looking at them.
 */

const DAY_WIDTH = "5.5rem";
const ROOM_WIDTH = "11rem";

/** Bar appearance per kind. Text carries the meaning; tone reinforces it. */
const KIND_STYLES: Record<string, string> = {
  committed: "bg-brand-100 border-brand-400 text-brand-900",
  historical: "bg-surface-inset border-line-strong text-content-muted",
  tentative: "border-dashed bg-warn-bg border-warn-fg/50 text-warn-fg",
};

const BLOCK_REASONS: Record<string, string> = {
  RENOVATION: "تجديد",
  DEEP_CLEANING: "تنظيف عميق",
  STAFF_USE: "استخدام الطاقم",
  OWNER_USE: "استخدام المالك",
  LONG_TERM_MAINTENANCE: "صيانة طويلة",
  SEASONAL_CLOSURE: "إغلاق موسمي",
  OTHER: "أخرى",
};

function RoomCell({ row, canOpenUnit }: { row: CalendarRow; canOpenUnit: boolean }) {
  return (
    <div
      className="sticky start-0 z-10 flex items-center justify-between gap-2 border-b border-e border-line bg-surface px-3 py-2"
      style={{ width: ROOM_WIDTH, minWidth: ROOM_WIDTH }}
    >
      <div className="min-w-0">
        {canOpenUnit ? (
          <Link
            href={`/units/${row.unitId}`}
            className="block truncate text-[13px] font-medium tabular-nums text-content transition-colors hover:text-brand-700"
          >
            {row.unitNumber}
          </Link>
        ) : (
          <span className="block truncate text-[13px] font-medium tabular-nums text-content">
            {row.unitNumber}
          </span>
        )}
        <span className="block truncate text-[11px] text-content-subtle">
          {row.floor === null ? row.unitTypeName : `ط${row.floor} · ${row.unitTypeName}`}
        </span>
      </div>

      {/* Present condition, for today only — never a claim about future nights. */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {row.outOfService && (
          <span
            className="flex items-center gap-1 rounded bg-danger-bg px-1.5 py-0.5 text-[10px] text-danger-fg"
            title="خارج الخدمة"
          >
            <Wrench className="size-3" aria-hidden />
            صيانة
          </span>
        )}
        {row.needsPreparationToday && (
          <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[10px] text-warn-fg">
            تحتاج تجهيزًا
          </span>
        )}
      </div>
    </div>
  );
}

export function CalendarGrid({
  snapshot,
  canOpenUnit,
}: {
  snapshot: CalendarSnapshot;
  canOpenUnit: boolean;
}) {
  const { columns, rows } = snapshot;
  const template = `${ROOM_WIDTH} repeat(${columns.length}, ${DAY_WIDTH})`;

  return (
    /*
     * The scroll lives here, inside the board — not on the page. A page that scrolls
     * sideways drags the whole application with it; a board that does keeps the shell
     * still and the room column pinned.
     */
    <div className="scrollbar-thin relative w-full overflow-x-auto rounded-xl border border-line bg-surface">
      {/*
        `width: max-content`, not `min-width`. Under RTL a min-width child is laid out
        from the container's right edge leftwards into negative coordinates, and the
        document counts that as scrollable area — so the whole application scrolled
        sideways even though the board itself was clipping correctly. Sizing the child
        to its content keeps the overflow inside the scroll container, where it belongs.
      */}
      <div style={{ width: "max-content" }}>
        {/* Header and body share one grid template, so they cannot drift apart. */}
        <div
          className="sticky top-0 z-20 grid border-b border-line bg-surface-muted"
          style={{ gridTemplateColumns: template }}
        >
          <div
            className="sticky start-0 z-10 border-e border-line bg-surface-muted px-3 py-2 text-[12px] font-semibold text-content-muted"
            style={{ width: ROOM_WIDTH, minWidth: ROOM_WIDTH }}
          >
            الوحدة
          </div>
          {columns.map((column) => (
            <div
              key={column.iso}
              className={`border-e border-line/60 px-1 py-2 text-center last:border-e-0 ${
                column.isBusinessDate
                  ? "bg-brand-50"
                  : column.isWeekend
                    ? "bg-surface-inset/60"
                    : ""
              }`}
            >
              <div
                className={`text-[11px] ${
                  column.isBusinessDate ? "font-semibold text-brand-700" : "text-content-subtle"
                }`}
              >
                {column.weekday}
              </div>
              <div
                className={`text-[13px] tabular-nums ${
                  column.isBusinessDate ? "font-semibold text-brand-800" : "text-content"
                }`}
              >
                {column.day}
              </div>
              <div className="text-[10px] text-content-subtle">{column.month}</div>
              {column.isBusinessDate && <span className="sr-only">اليوم</span>}
            </div>
          ))}
        </div>

        {rows.map((row) => (
          <div
            key={row.unitId}
            className="grid"
            style={{ gridTemplateColumns: template }}
          >
            <RoomCell row={row} canOpenUnit={canOpenUnit} />

            {/*
              The empty cells are laid down first as the grid's background, then bars
              are placed over them by column. Painting bars into cells instead would
              mean splitting a booking into one element per night.
            */}
            {columns.map((column) => (
              <div
                key={column.iso}
                className={`h-14 border-b border-e border-line/50 last:border-e-0 ${
                  column.isBusinessDate
                    ? "bg-brand-50/40"
                    : column.isWeekend
                      ? "bg-surface-inset/30"
                      : ""
                }`}
              />
            ))}

            {row.blocks.map((block) => (
              <div
                key={block.id}
                className="z-[1] my-1 flex items-center gap-1 self-center overflow-hidden rounded-md border border-content-subtle/40 bg-surface-inset px-2 py-1"
                style={{
                  gridRow: 1,
                  gridColumnStart: block.geometry.startIndex + 2,
                  gridColumnEnd: `span ${block.geometry.span}`,
                }}
                title={block.notes ?? undefined}
              >
                <Lock className="size-3 shrink-0 text-content-muted" aria-hidden />
                <span className="truncate text-[11px] text-content-muted">
                  {block.geometry.clippedStart && "… "}
                  موقوفة — {BLOCK_REASONS[block.reason] ?? block.reason}
                </span>
                <span className="sr-only">
                  الوحدة {row.unitNumber} موقوفة من {block.startDate}
                  {block.endDate ? ` حتى ${block.endDate}` : " بلا تاريخ انتهاء"}
                </span>
              </div>
            ))}

            {row.bars.map((bar) => {
              const status = statusMeta(RESERVATION_STATUS, bar.status);
              return (
                <Link
                  key={bar.id}
                  href={`/reservations/${bar.id}`}
                  className={`z-[2] my-1.5 flex flex-col justify-center overflow-hidden rounded-md border px-2 py-1 transition-shadow hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 ${
                    KIND_STYLES[bar.kind]
                  }`}
                  style={{
                    gridRow: 1,
                    gridColumnStart: bar.geometry.startIndex + 2,
                    gridColumnEnd: `span ${bar.geometry.span}`,
                  }}
                >
                  <span className="truncate text-[12px] font-medium leading-tight" aria-hidden>
                    {bar.geometry.clippedStart && "… "}
                    {bar.guestName}
                    {bar.geometry.clippedEnd && " …"}
                  </span>
                  {/* Status in words on any bar wide enough to hold them. */}
                  {bar.geometry.span > 1 && (
                    <span className="truncate text-[10px] leading-tight opacity-80" aria-hidden>
                      {status.label}
                      {bar.geometry.span > 2 && ` · ${bar.reservationNumber}`}
                    </span>
                  )}
                  {/*
                    Position and width say nothing to a screen reader, so everything the
                    bar means is written out once, here.
                  */}
                  <span className="sr-only">
                    حجز {bar.reservationNumber} باسم {bar.guestName} · الوحدة{" "}
                    {row.unitNumber} · من {bar.checkInDate} إلى {bar.checkOutDate} ·{" "}
                    {bar.nights} ليلة · {status.label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
