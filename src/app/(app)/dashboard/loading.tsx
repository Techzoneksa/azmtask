/**
 * Dashboard skeleton.
 *
 * Mirrors the real layout's grid and block heights so the page does not jump when
 * data arrives. A skeleton that settles into a different shape is worse than none —
 * it teaches the eye to expect one thing and then moves it.
 */
function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-inset ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="جارٍ تحميل لوحة المعلومات">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Block className="h-7 w-44" />
          <Block className="h-4 w-72" />
        </div>
        <Block className="h-9 w-40" />
      </div>

      {[0, 1].map((row) => (
        <div key={row} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <Block key={card} className="h-[104px]" />
          ))}
        </div>
      ))}

      <Block className="h-[132px]" />

      <div className="grid gap-4 xl:grid-cols-3">
        {[0, 1, 2].map((panel) => (
          <Block key={panel} className="h-[320px]" />
        ))}
      </div>

      <Block className="h-[148px]" />

      <div className="grid gap-4 xl:grid-cols-3">
        <Block className="h-[248px] xl:col-span-2" />
        <Block className="h-[248px]" />
      </div>
    </div>
  );
}
