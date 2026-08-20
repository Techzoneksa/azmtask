"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Pagination control.
 *
 * Chevrons point the way the reader moves in RTL: "previous" points to the right
 * (toward the start of the line), "next" to the left.
 */

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  if (total === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3",
        className,
      )}
    >
      <p className="text-[13px] text-content-muted">
        عرض <span className="font-medium text-content">{formatNumber(from)}</span>–
        <span className="font-medium text-content">{formatNumber(to)}</span> من أصل{" "}
        <span className="font-medium text-content">{formatNumber(total)}</span> سجل
      </p>

      <div className="flex items-center gap-1">
        <PageButton
          label="الصفحة السابقة"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </PageButton>

        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <span key={`gap-${index}`} className="px-1.5 text-content-subtle">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? "page" : undefined}
              className={cn(
                "h-8 min-w-8 rounded-md px-2 text-[13px] font-medium transition-colors",
                entry === page
                  ? "bg-brand-600 text-white"
                  : "text-content-muted hover:bg-surface-inset hover:text-content",
              )}
            >
              {formatNumber(entry)}
            </button>
          ),
        )}

        <PageButton
          label="الصفحة التالية"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-inset hover:text-content disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** Page numbers around the current page, with gaps standing in for long runs. */
function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: Array<number | "gap"> = [];
  let previous = 0;
  for (const current of sorted) {
    if (previous && current - previous > 1) result.push("gap");
    result.push(current);
    previous = current;
  }
  return result;
}
