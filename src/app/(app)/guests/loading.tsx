import { Skeleton } from "@/components/ui";

/** The directory, before its rows arrive. */
export default function GuestsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">جارٍ تحميل النزلاء…</span>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <Skeleton className="h-[104px] w-full rounded-xl" />

      <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}
