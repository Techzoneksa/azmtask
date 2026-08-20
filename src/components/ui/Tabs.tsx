"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TabItem = {
  key: string;
  label: string;
  count?: number;
  href?: string;
};

/** Controlled tab strip for in-page section switching. */
export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("scrollbar-thin overflow-x-auto border-b border-line", className)}>
      <div role="tablist" className="flex min-w-max gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === active}
            onClick={() => onChange(item.key)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
              item.key === active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-content-muted hover:border-line-strong hover:text-content",
            )}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span className="ms-1.5 rounded-full bg-surface-inset px-1.5 py-0.5 text-[11px] text-content-muted">
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Route-driven tabs, for sections that deserve their own URL. */
export function LinkTabs({ items, className }: { items: TabItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <div className={cn("scrollbar-thin overflow-x-auto border-b border-line", className)}>
      <div className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = item.href === pathname;
          return (
            <Link
              key={item.key}
              href={item.href ?? "#"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-content-muted hover:border-line-strong hover:text-content",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function TabPanel({ children }: { children: ReactNode }) {
  return <div role="tabpanel" className="pt-4">{children}</div>;
}
