import Link from "next/link";

/**
 * Profile tabs, addressed by the URL.
 *
 * Server-rendered links rather than client state, so every tab is deep-linkable, the
 * back button moves between them, and a refresh lands where the reader was. A tab the
 * caller has no permission for is not rendered at all — an empty "المدفوعات" tab would
 * advertise data they cannot see.
 */
export type GuestTab = {
  key: string;
  label: string;
  count?: number;
};

export function GuestTabs({
  tabs,
  active,
  guestId,
  query,
}: {
  tabs: GuestTab[];
  active: string;
  guestId: string;
  /** Filters to carry across a tab change — the history page, chiefly. */
  query?: Record<string, string | undefined>;
}) {
  const href = (key: string) => {
    const params = new URLSearchParams();
    if (key !== tabs[0].key) params.set("tab", key);
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value) params.set(name, value);
    }
    return `/guests/${guestId}${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="scrollbar-thin overflow-x-auto border-b border-line">
      <nav className="flex min-w-max gap-1" aria-label="أقسام ملف النزيل">
        {tabs.map((tab) => {
          const current = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={href(tab.key)}
              aria-current={current ? "page" : undefined}
              className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                current
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-content-muted hover:border-line-strong hover:text-content"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                    current ? "bg-brand-100 text-brand-800" : "bg-surface-inset text-content-subtle"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
