import { Skeleton } from "@/components/ui";

/** The booking directory, before its rows arrive. */
export default function ReservationsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">جارٍ تحميل الحجوزات…</span>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-[152px] w-full rounded-xl" />
      <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}
