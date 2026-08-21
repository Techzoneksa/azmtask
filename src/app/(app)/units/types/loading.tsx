import { Skeleton, TableSkeleton } from "@/components/ui";

/** The type catalogue, before its rows arrive. */
export default function UnitTypesLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">جارٍ تحميل أنواع الوحدات…</span>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <TableSkeleton rows={5} columns={6} />
      </div>
    </div>
  );
}
