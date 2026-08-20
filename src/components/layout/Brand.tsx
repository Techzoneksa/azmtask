import { cn } from "@/lib/utils";

/** Property mark used in the sidebar and on the login screen. */
export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M4 20V9.5L12 4l8 5.5V20"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 20v-5.5h5V20"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10.5" r="1.15" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold text-content">فندق النخبة</p>
          <p className="truncate text-[11px] text-content-subtle">نظام إدارة الفنادق</p>
        </div>
      )}
    </div>
  );
}
