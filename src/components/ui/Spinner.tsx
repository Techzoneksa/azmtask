import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("h-5 w-5 animate-spin text-content-subtle", className)}
      aria-hidden
    />
  );
}

/** Full-panel loading state, used by route-level `loading.tsx` files. */
export function LoadingPanel({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-content-muted"
    >
      <Spinner className="h-6 w-6" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-surface-inset", className)} aria-hidden />
  );
}

/** Placeholder matching the shape of a data table while its rows load. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-px" aria-hidden>
      <Skeleton className="h-11 w-full rounded-t-card" />
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-line px-4 py-3.5">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn("h-4", colIndex === 0 ? "w-1/4" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
