"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Calendar navigation and filters, held in the URL.
 *
 * Everything that decides what is on screen — the window's start, its length, the
 * floor, the type — is a query parameter, so the board survives a refresh, works as a
 * bookmark, and moves under the browser's back button. A calendar whose position
 * lives in component state loses the operator's place every time they open a booking.
 */

export type ControlOptions = {
  floors: number[];
  unitTypes: Array<{ id: string; name: string }>;
  businessDate: string;
  from: string;
  days: number;
  allowedDays: readonly number[];
};

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const selectClass =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-[12px] text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50";

const navButton =
  "inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-medium text-content transition-colors hover:bg-surface-inset";

export function CalendarControls({ options }: { options: ControlOptions }) {
  const router = useRouter();
  const params = useSearchParams();

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      router.replace(`/reservations/calendar${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router],
  );

  const set = (key: string, value: string) =>
    push((next) => (value ? next.set(key, value) : next.delete(key)));

  const floor = params.get("floor") ?? "";
  const unitTypeId = params.get("unitTypeId") ?? "";
  const tentative = params.get("tentative") === "1";
  const filtered = Boolean(floor || unitTypeId || tentative);

  /* Stepping moves by the whole window, so paging never skips or repeats a day. */
  const step = (direction: -1 | 1) =>
    set("from", shift(options.from, direction * options.days));

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} className={navButton}>
            <ChevronRight className="size-4" aria-hidden />
            السابق
          </button>
          <button
            type="button"
            // Two days of context before today, so this morning's departure is visible.
            onClick={() => set("from", shift(options.businessDate, -2))}
            className={navButton}
          >
            <CalendarDays className="size-4" aria-hidden />
            اليوم
          </button>
          <button type="button" onClick={() => step(1)} className={navButton}>
            التالي
            <ChevronLeft className="size-4" aria-hidden />
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-[12px] text-content-muted">
          من
          <input
            type="date"
            dir="ltr"
            value={options.from}
            onChange={(event) => set("from", event.target.value)}
            aria-label="تاريخ بداية التقويم"
            className={selectClass}
          />
        </label>

        <div
          className="flex overflow-hidden rounded-lg border border-line"
          role="group"
          aria-label="طول الفترة"
        >
          {options.allowedDays.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => set("days", String(days))}
              aria-pressed={options.days === days}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                options.days === days
                  ? "bg-brand-600 text-white"
                  : "bg-surface text-content-muted hover:bg-surface-inset"
              }`}
            >
              {days} يومًا
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={floor}
          onChange={(event) => set("floor", event.target.value)}
          aria-label="الطابق"
          className={selectClass}
        >
          <option value="">كل الطوابق</option>
          {options.floors.map((value) => (
            <option key={value} value={value}>
              الطابق {value}
            </option>
          ))}
        </select>

        <select
          value={unitTypeId}
          onChange={(event) => set("unitTypeId", event.target.value)}
          aria-label="نوع الوحدة"
          className={selectClass}
        >
          <option value="">كل الأنواع</option>
          {options.unitTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-content-muted">
          <input
            type="checkbox"
            checked={tentative}
            onChange={(event) => set("tentative", event.target.checked ? "1" : "")}
            className="size-3.5 rounded border-line accent-brand-600"
          />
          إظهار الحجوزات المبدئية
        </label>

        {filtered && (
          <button
            type="button"
            onClick={() =>
              push((next) => {
                next.delete("floor");
                next.delete("unitTypeId");
                next.delete("tentative");
              })
            }
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-content-muted transition-colors hover:bg-surface-inset hover:text-content"
          >
            <X className="size-3.5" aria-hidden />
            مسح الفلاتر
          </button>
        )}
      </div>
    </div>
  );
}
