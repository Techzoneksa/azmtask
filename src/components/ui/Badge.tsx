import type { ReactNode } from "react";

import { statusMeta, type StatusMeta, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

const TONES: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok-fg",
  warn: "bg-warn-bg text-warn-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  brand: "bg-brand-100 text-brand-800",
  neutral: "bg-surface-inset text-content-muted",
};

const DOT_TONES: Record<Tone, string> = {
  ok: "bg-ok-fg",
  warn: "bg-warn-fg",
  danger: "bg-danger-fg",
  info: "bg-info-fg",
  brand: "bg-brand-600",
  neutral: "bg-content-subtle",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT_TONES[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/** Renders a domain status straight from one of the maps in `lib/status`. */
export function StatusBadge({
  map,
  value,
  dot = true,
  className,
}: {
  map: Record<string, StatusMeta>;
  value: string | null | undefined;
  dot?: boolean;
  className?: string;
}) {
  const meta = statusMeta(map, value);
  return (
    <Badge tone={meta.tone} dot={dot} className={className}>
      {meta.label}
    </Badge>
  );
}
