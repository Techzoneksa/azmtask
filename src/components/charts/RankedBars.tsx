import { formatNumber } from "@/lib/format";

/**
 * Booking sources.
 *
 * Horizontal bars in one hue, not a pie or a six-colour donut. The question is
 * "which channels bring the most business, in order" — a magnitude comparison, which
 * bars answer at a glance and angles do not. It also sidesteps a real problem: six
 * status-style hues sitting next to each other fail colour-blind separation, and
 * identity here is carried by the label anyway.
 */

export type RankedItem = { label: string; value: number };

export function RankedBars({ items }: { items: RankedItem[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-[13px] text-content-subtle">لا توجد حجوزات بعد</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const share = total === 0 ? 0 : Math.round((item.value / total) * 100);
        return (
          <li key={item.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-content">{item.label}</span>
              <span className="shrink-0 tabular-nums text-content-muted">
                {formatNumber(item.value)}
                <span className="ms-1.5 text-content-subtle">({share}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-inset">
              <div
                className="h-full rounded-full bg-brand-500/75"
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
