import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatNumber } from "@/lib/format";

/**
 * Link-based pagination.
 *
 * The shared Pagination component drives a client callback, which suits a list that
 * holds its page in component state. This screen holds it in the URL instead, so the
 * pager has to be real anchors: a page must survive a refresh, be shareable, and
 * work before any JavaScript has run.
 */
export function PagerLinks({
  page,
  pageSize,
  total,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** Current filters, carried through so paging never drops them. */
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const href = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    else next.delete("page");
    return `/housekeeping${next.size ? `?${next}` : ""}`;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="تنقل بين الصفحات">
      <p className="text-[12px] text-content-muted">
        {formatNumber(from)}–{formatNumber(to)} من {formatNumber(total)}
      </p>

      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            rel="prev"
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-content transition-colors hover:bg-surface-inset"
          >
            <ChevronRight className="size-3.5" aria-hidden />
            السابق
          </Link>
        ) : (
          <span className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-content-subtle">
            <ChevronRight className="size-3.5" aria-hidden />
            السابق
          </span>
        )}

        <span className="px-2 text-[12px] tabular-nums text-content-muted">
          {formatNumber(page)} / {formatNumber(pages)}
        </span>

        {page < pages ? (
          <Link
            href={href(page + 1)}
            rel="next"
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-content transition-colors hover:bg-surface-inset"
          >
            التالي
            <ChevronLeft className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <span className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-content-subtle">
            التالي
            <ChevronLeft className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
