import type { ReactNode } from "react";

import { Card } from "@/components/ui";
import type { Section } from "@/server/services/dashboard.service";

/**
 * Shared dashboard building blocks.
 *
 * The important one is SectionBody: a widget whose query failed says so, rather
 * than rendering a zero. On an operations screen those are very different claims —
 * "no guest owes you anything" and "we could not check" must never look alike.
 */

export function SectionBody<T>({
  section,
  children,
  empty,
  isEmpty,
}: {
  section: Section<T>;
  children: (data: T) => ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
}) {
  if (!section.ok) {
    return (
      <div className="rounded-lg border border-dashed border-danger-fg/25 bg-danger-bg/40 px-4 py-6 text-center">
        <p className="text-[13px] font-medium text-danger-fg">تعذّر تحميل هذا القسم</p>
        <p className="mt-1 text-[12px] text-content-muted">{section.error}</p>
      </div>
    );
  }

  if (isEmpty?.(section.data)) {
    return (
      <p className="py-8 text-center text-[13px] text-content-subtle">
        {empty ?? "لا توجد بيانات لعرضها"}
      </p>
    );
  }

  return <>{children(section.data)}</>;
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-content">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-content-subtle">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}

/** Small count with a status dot. Identity comes from the label, never the colour. */
export function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "danger" | "info" | "neutral" | "brand";
}) {
  const dot: Record<string, string> = {
    ok: "bg-ok-fg",
    warn: "bg-warn-fg",
    danger: "bg-danger-fg",
    info: "bg-info-fg",
    neutral: "bg-content-subtle",
    brand: "bg-brand-600",
  };

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
      <span className={`size-2 shrink-0 rounded-full ${dot[tone]}`} aria-hidden />
      <div className="min-w-0">
        <div className="text-[17px] font-semibold leading-none tabular-nums text-content">
          {value}
        </div>
        <div className="mt-1 truncate text-[12px] text-content-muted">{label}</div>
      </div>
    </div>
  );
}
