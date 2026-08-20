import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 pb-1",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-content sm:text-[22px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-content-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Compact KPI tile used across the dashboard and module summaries. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "brand";
}) {
  const accents: Record<string, string> = {
    neutral: "bg-surface-inset text-content-muted",
    ok: "bg-ok-bg text-ok-fg",
    warn: "bg-warn-bg text-warn-fg",
    danger: "bg-danger-bg text-danger-fg",
    brand: "bg-brand-100 text-brand-700",
  };

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-content-muted">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              accents[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-content">{value}</p>
      {hint && <p className="mt-1 text-[12px] text-content-subtle">{hint}</p>}
    </div>
  );
}
