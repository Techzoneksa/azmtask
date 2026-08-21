"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";

import { HOUSEKEEPING_STATUS, UNIT_STATUS } from "@/lib/status";

/**
 * Filters, held in the URL.
 *
 * The query string is the single source of truth, not component state. That is what
 * makes a filtered board survive a refresh, work as a bookmark, and let the
 * dashboard link straight to "the rooms that need cleaning" — the same mechanism
 * serving all three, rather than three implementations that drift.
 */

export type FilterOptions = {
  floors: number[];
  unitTypes: Array<{ id: string; name: string }>;
};

const STATUSES = ["AVAILABLE", "RESERVED", "OCCUPIED", "CLEANING", "MAINTENANCE", "BLOCKED"] as const;
const HOUSEKEEPING = ["CLEAN", "DIRTY", "CLEANING", "INSPECTED"] as const;

export function UnitFilters({ options, view }: { options: FilterOptions; view: "board" | "table" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      // Any filter change returns to the first page; page 4 of a new filter is
      // usually empty and always confusing.
      next.delete("page");
      router.replace(`/units${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router],
  );

  const set = (key: string, value: string) =>
    push((next) => (value ? next.set(key, value) : next.delete(key)));

  /*
   * Debounced so typing a room number issues one request rather than one per
   * keystroke. The timer is cleared on every change, so only the pause at the end
   * navigates.
   */
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;

    const timer = setTimeout(() => {
      push((next) => (query ? next.set("q", query) : next.delete("q")));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, params, push]);

  const active = ["q", "floor", "type", "status", "housekeeping"].filter((key) => params.get(key));

  const switchView = (target: "board" | "table") =>
    push((next) => (target === "board" ? next.delete("view") : next.set("view", "table")));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-content-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث برقم الوحدة"
            aria-label="ابحث برقم الوحدة"
            className="h-9 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-[13px] text-content placeholder:text-content-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          />
        </div>

        {/* View switch keeps every other filter — switching how you look at the
            rooms should not change which rooms you are looking at. */}
        <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="طريقة العرض">
          <button
            type="button"
            onClick={() => switchView("board")}
            aria-pressed={view === "board"}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${
              view === "board" ? "bg-brand-600 text-content-inverted" : "bg-surface text-content-muted hover:bg-surface-inset"
            }`}
          >
            <LayoutGrid className="size-3.5" aria-hidden />
            لوحة الوحدات
          </button>
          <button
            type="button"
            onClick={() => switchView("table")}
            aria-pressed={view === "table"}
            className={`flex items-center gap-1.5 border-s border-line px-3 py-1.5 text-[12px] font-medium transition-colors ${
              view === "table" ? "bg-brand-600 text-content-inverted" : "bg-surface text-content-muted hover:bg-surface-inset"
            }`}
          >
            <List className="size-3.5" aria-hidden />
            قائمة الوحدات
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          label="الطابق"
          value={params.get("floor") ?? ""}
          onChange={(value) => set("floor", value)}
          options={options.floors.map((floor) => ({ value: String(floor), label: `الطابق ${floor}` }))}
        />
        <Select
          label="النوع"
          value={params.get("type") ?? ""}
          onChange={(value) => set("type", value)}
          options={options.unitTypes.map((type) => ({ value: type.id, label: type.name }))}
        />
        <Select
          label="الحالة"
          value={params.get("status") ?? ""}
          onChange={(value) => set("status", value)}
          options={STATUSES.map((status) => ({
            value: status,
            label: UNIT_STATUS[status.toLowerCase() as keyof typeof UNIT_STATUS]?.label ?? status,
          }))}
        />
        <Select
          label="النظافة"
          value={params.get("housekeeping") ?? ""}
          onChange={(value) => set("housekeeping", value)}
          options={HOUSEKEEPING.map((state) => ({
            value: state,
            label: HOUSEKEEPING_STATUS[state.toLowerCase() as keyof typeof HOUSEKEEPING_STATUS]?.label ?? state,
          }))}
        />

        {active.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              router.replace(view === "table" ? "/units?view=table" : "/units", { scroll: false });
            }}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-content-muted hover:bg-surface-inset"
          >
            <X className="size-3.5" aria-hidden />
            إزالة الفلاتر ({active.length})
          </button>
        )}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={`h-8 rounded-lg border bg-surface px-2.5 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
          value ? "border-brand-300 text-content" : "border-line text-content-muted"
        }`}
      >
        <option value="">{label}: الكل</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
