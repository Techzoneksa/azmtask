import { Skeleton } from "@/components/ui";

/** The board's shape, before its data arrives — same columns, so nothing jumps. */
export default function CalendarLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">جارٍ تحميل التقويم…</span>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-52" />
      </div>

      <div className="hidden grid-cols-3 gap-2 sm:grid lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-[104px] w-full rounded-xl" />

      <div className="space-y-px rounded-xl border border-line bg-surface p-2">
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 10 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
