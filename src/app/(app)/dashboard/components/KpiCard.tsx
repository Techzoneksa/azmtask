import type { LucideIcon } from "lucide-react";

/**
 * A headline figure.
 *
 * The number is the largest thing in the card and carries no colour of its own —
 * text stays in ink tokens, and the tinted icon beside it does the categorising.
 * Colouring the value itself would make every card look like a status.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "brand" | "ok" | "warn" | "danger" | "info";
  emphasis?: boolean;
}) {
  const tint: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700",
    ok: "bg-ok-bg text-ok-fg",
    warn: "bg-warn-bg text-warn-fg",
    danger: "bg-danger-bg text-danger-fg",
    info: "bg-info-bg text-info-fg",
  };

  return (
    <div
      className={`rounded-xl border bg-surface p-4 ${
        emphasis ? "border-brand-200 shadow-sm" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-content-muted">{label}</p>
          <p className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-content">
            {value}
          </p>
          {hint && <p className="mt-1.5 truncate text-[12px] text-content-subtle">{hint}</p>}
        </div>
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tint[tone]}`}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </div>
    </div>
  );
}
