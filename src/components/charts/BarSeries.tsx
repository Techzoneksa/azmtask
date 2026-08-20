"use client";

import { useState } from "react";

import { formatAmount } from "@/lib/format";

/**
 * Daily collections.
 *
 * Bars rather than a line: each day's takings is a discrete quantity, and a line
 * between them would imply a continuity that money moving on separate days does not
 * have. One series, one hue, 4px rounded tops anchored to the baseline.
 *
 * Days with no payments render as a baseline tick rather than a gap — "nothing came
 * in" is a fact worth showing, not missing data.
 */

export type BarPoint = { date: string; value: number };

export function BarSeries({ points, height = 168 }: { points: BarPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-line text-[13px] text-content-subtle"
        style={{ height }}
      >
        لا توجد حركات مالية في هذه الفترة
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.value), 1);
  const active = hover === null ? null : points[hover];

  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {points.map((point, index) => {
          const ratio = Math.max(point.value, 0) / max;
          return (
            <button
              key={point.date}
              type="button"
              tabIndex={-1}
              aria-label={`${point.date}: ${formatAmount(point.value)}`}
              className="group relative flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
            >
              <span
                className={`w-full rounded-t transition-colors ${
                  hover === index ? "bg-brand-600" : "bg-brand-500/55"
                }`}
                /* A 2px floor keeps an empty day visible as a tick on the baseline. */
                style={{ height: `${Math.max(ratio * 100, point.value > 0 ? 3 : 1.2)}%` }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between text-[11px] text-content-subtle">
        <span>{points[0].date.slice(5)}</span>
        <span>{points[points.length - 1].date.slice(5)}</span>
      </div>

      {active && (
        <div
          className="pointer-events-none absolute -top-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-sm"
          style={{
            insetInlineStart: `${((hover! + 0.5) / points.length) * 100}%`,
            transform: "translateX(50%)",
          }}
        >
          <div className="font-medium text-content">{formatAmount(active.value)}</div>
          <div className="text-content-subtle">{active.date}</div>
        </div>
      )}
    </div>
  );
}
