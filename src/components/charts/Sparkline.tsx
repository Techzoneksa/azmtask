"use client";

import { useId, useState } from "react";

import { formatNumber } from "@/lib/format";

/**
 * Occupancy over time.
 *
 * One series, so no legend — the card's title names it. Drawn as a 2px line over a
 * faint fill in the brand hue: a single measure's shape is what matters, and a
 * second colour would imply a second meaning.
 *
 * The hover layer is a crosshair with a tooltip rather than a label on every point.
 * Thirty labelled points is thirty pieces of text competing with the shape they are
 * meant to describe.
 */

export type SeriesPoint = { date: string; value: number; label?: string };

type Props = {
  points: SeriesPoint[];
  /** Rendered inside the tooltip after the value. */
  unit?: string;
  /** Fixed upper bound; otherwise the series maximum is used. */
  max?: number;
  height?: number;
};

const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

export function Sparkline({ points, unit = "%", max, height = 168 }: Props) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-line text-[13px] text-content-subtle"
        style={{ height }}
      >
        لا توجد بيانات كافية لعرض المنحنى
      </div>
    );
  }

  const width = 720;
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;

  const ceiling = Math.max(max ?? 0, ...points.map((p) => p.value), 1);
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const x = (index: number) => PAD.left + index * step;
  const y = (value: number) => PAD.top + plotHeight - (value / ceiling) * plotHeight;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const area = `${line} L ${x(points.length - 1)} ${PAD.top + plotHeight} L ${x(0)} ${PAD.top + plotHeight} Z`;

  const active = hover === null ? null : points[hover];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`منحنى بياني يغطي ${points.length} يومًا`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={clipId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2c8482" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#2c8482" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Recessive gridlines: present enough to read a value against, quiet
            enough that the series stays the loudest thing on the card. */}
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + plotHeight * fraction}
            y2={PAD.top + plotHeight * fraction}
            stroke="rgb(var(--line) / 1)"
            strokeWidth="1"
          />
        ))}

        <path d={area} fill={`url(#${clipId})`} />
        <path
          d={line}
          fill="none"
          stroke="#2c8482"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {active && hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
              stroke="rgb(var(--line-strong) / 1)"
              strokeWidth="1"
            />
            {/* A surface ring keeps the marker legible wherever the line sits. */}
            <circle
              cx={x(hover)}
              cy={y(active.value)}
              r="5"
              fill="#2c8482"
              stroke="rgb(var(--surface) / 1)"
              strokeWidth="2"
            />
          </>
        )}

        {/* Hit targets are full-height columns, far easier to land on than the line. */}
        {points.map((point, index) => (
          <rect
            key={point.date}
            x={x(index) - step / 2}
            y={PAD.top}
            width={Math.max(step, 6)}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}

        {/* Only the ends are labelled; a date under every point is unreadable. */}
        <text
          x={PAD.left}
          y={height - 6}
          fontSize="11"
          fill="rgb(var(--content-subtle) / 1)"
          textAnchor="start"
        >
          {points[0].date.slice(5)}
        </text>
        <text
          x={width - PAD.right}
          y={height - 6}
          fontSize="11"
          fill="rgb(var(--content-subtle) / 1)"
          textAnchor="end"
        >
          {points[points.length - 1].date.slice(5)}
        </text>
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-sm"
          style={{
            insetInlineStart: `${((hover! + 0.5) / points.length) * 100}%`,
            transform: "translateX(50%)",
          }}
        >
          <div className="font-medium text-content">
            {formatNumber(active.value)}
            {unit}
          </div>
          <div className="text-content-subtle">{active.label ?? active.date}</div>
        </div>
      )}
    </div>
  );
}
