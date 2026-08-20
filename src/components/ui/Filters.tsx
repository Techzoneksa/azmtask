"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./Button";

/**
 * Search and filter controls shared by every list screen.
 *
 * `SearchInput` debounces so typing a guest name does not fire a query per keystroke.
 */

export function SearchInput({
  value,
  onChange,
  placeholder = "بحث…",
  delay = 300,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
  className?: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);

  // Keep the field in sync when the parent resets filters externally.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), delay);
    return () => clearTimeout(timer);
    // `value` is intentionally omitted: including it would cancel the pending debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, delay]);

  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-content-subtle"
        aria-hidden
      />
      <input
        type="search"
        role="searchbox"
        value={draft}
        autoFocus={autoFocus}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-lg border border-line-strong bg-surface ps-9 pe-9 text-sm text-content transition-colors placeholder:text-content-subtle hover:border-content-subtle focus:border-brand-500"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          aria-label="مسح البحث"
          className="absolute inset-y-0 end-2 my-auto flex h-6 w-6 items-center justify-center rounded-md text-content-subtle transition-colors hover:bg-surface-inset hover:text-content"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Toolbar hosting a search field, filter controls and an active-filter count. */
export function FilterBar({
  children,
  activeCount = 0,
  onReset,
  className,
}: {
  children: ReactNode;
  activeCount?: number;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-line px-4 py-3",
        className,
      )}
    >
      {children}
      {activeCount > 0 && onReset && (
        <Button variant="ghost" size="sm" icon={X} onClick={onReset}>
          إزالة التصفية ({activeCount})
        </Button>
      )}
    </div>
  );
}

/** Small labelled select used inside a `FilterBar`. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "الكل",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex items-center gap-2", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={cn(
          "h-10 rounded-lg border bg-surface px-3 text-sm transition-colors hover:border-content-subtle focus:border-brand-500",
          value
            ? "border-brand-300 bg-brand-50 text-brand-800"
            : "border-line-strong text-content-muted",
        )}
      >
        <option value="">
          {label}: {allLabel}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {label}: {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export { SlidersHorizontal as FilterIcon };
