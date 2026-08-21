"use client";

import { LayoutGrid, List, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  HOUSEKEEPING_STATUS,
  HOUSEKEEPING_TASK_STATUS,
  HOUSEKEEPING_TASK_TYPE,
  PRIORITY,
  statusMeta,
} from "@/lib/status";

/**
 * Filters, held in the URL.
 *
 * The query string is the single source of truth, not component state. That is what
 * lets a supervisor bookmark "urgent, third floor, unassigned", lets the dashboard
 * link straight to the rooms that need cleaning, and lets a refresh land back on the
 * same view — one mechanism serving all three rather than three that drift.
 */

export type FilterOptions = {
  floors: number[];
  unitTypes: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string }>;
};

const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;

const TASK_STATUSES = ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
const ROOM_STATUSES = ["DIRTY", "CLEANING", "CLEAN", "INSPECTED"] as const;
const TASK_TYPES = [
  "CHECKOUT_CLEANING",
  "STAY_OVER",
  "DEEP_CLEANING",
  "INSPECTION",
  "TURNDOWN",
  "OTHER",
] as const;

const FILTER_KEYS = [
  "q",
  "floor",
  "unitTypeId",
  "status",
  "housekeepingStatus",
  "taskType",
  "priority",
  "employeeId",
  "unassigned",
  "urgent",
  "activeOnly",
];

export function HousekeepingFilters({
  options,
  view,
}: {
  options: FilterOptions;
  view: "board" | "table";
}) {
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
      router.replace(`/housekeeping${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router],
  );

  const set = (key: string, value: string) =>
    push((next) => (value ? next.set(key, value) : next.delete(key)));

  const toggle = (key: string) =>
    push((next) => (next.get(key) === "true" ? next.delete(key) : next.set(key, "true")));

  /*
   * Debounced so typing a room number issues one request rather than one per
   * keystroke. The timer is cleared on every change, so only the pause navigates.
   */
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;

    const timer = setTimeout(() => {
      push((next) => (query ? next.set("q", query) : next.delete("q")));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, params, push]);

  const active = FILTER_KEYS.filter((key) => params.get(key));
  const chip = (on: boolean) =>
    `inline-flex h-9 items-center rounded-lg border px-3 text-[13px] transition-colors ${
      on
        ? "border-brand-500 bg-brand-50 text-brand-700"
        : "border-line text-content-muted hover:bg-surface-inset"
    }`;
  const select =
    "h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-content";

  const switchView = (target: "board" | "table") =>
    push((next) => (target === "board" ? next.delete("view") : next.set("view", "table")));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[9rem] flex-1">
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
            className="h-9 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-[13px] text-content placeholder:text-content-subtle"
          />
        </div>

        <button type="button" onClick={() => toggle("urgent")} aria-pressed={params.get("urgent") === "true"} className={chip(params.get("urgent") === "true")}>
          عاجلة فقط
        </button>
        <button type="button" onClick={() => toggle("unassigned")} aria-pressed={params.get("unassigned") === "true"} className={chip(params.get("unassigned") === "true")}>
          غير مسندة
        </button>
        <button
          type="button"
          onClick={() => push((next) => (next.get("activeOnly") === "false" ? next.delete("activeOnly") : next.set("activeOnly", "false")))}
          aria-pressed={params.get("activeOnly") === "false"}
          className={chip(params.get("activeOnly") === "false")}
        >
          شامل المنتهية
        </button>

        <div className="ms-auto flex items-center gap-1 rounded-lg border border-line p-0.5">
          <button
            type="button"
            onClick={() => switchView("board")}
            aria-pressed={view === "board"}
            aria-label="عرض البطاقات"
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] ${view === "board" ? "bg-surface-inset text-content" : "text-content-muted"}`}
          >
            <LayoutGrid className="size-4" aria-hidden />
            بطاقات
          </button>
          <button
            type="button"
            onClick={() => switchView("table")}
            aria-pressed={view === "table"}
            aria-label="عرض الجدول"
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] ${view === "table" ? "bg-surface-inset text-content" : "text-content-muted"}`}
          >
            <List className="size-4" aria-hidden />
            جدول
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={params.get("status") ?? ""}
          onChange={(event) => set("status", event.target.value)}
          aria-label="حالة المهمة"
          className={select}
        >
          <option value="">كل حالات المهام</option>
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusMeta(HOUSEKEEPING_TASK_STATUS, status).label}
            </option>
          ))}
        </select>

        <select
          value={params.get("housekeepingStatus") ?? ""}
          onChange={(event) => set("housekeepingStatus", event.target.value)}
          aria-label="حالة نظافة الوحدة"
          className={select}
        >
          <option value="">كل حالات النظافة</option>
          {ROOM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusMeta(HOUSEKEEPING_STATUS, status).label}
            </option>
          ))}
        </select>

        <select
          value={params.get("priority") ?? ""}
          onChange={(event) => set("priority", event.target.value)}
          aria-label="الأولوية"
          className={select}
        >
          <option value="">كل الأولويات</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {statusMeta(PRIORITY, priority).label}
            </option>
          ))}
        </select>

        <select
          value={params.get("taskType") ?? ""}
          onChange={(event) => set("taskType", event.target.value)}
          aria-label="نوع المهمة"
          className={select}
        >
          <option value="">كل الأنواع</option>
          {TASK_TYPES.map((type) => (
            <option key={type} value={type}>
              {statusMeta(HOUSEKEEPING_TASK_TYPE, type).label}
            </option>
          ))}
        </select>

        <select
          value={params.get("employeeId") ?? ""}
          onChange={(event) => set("employeeId", event.target.value)}
          aria-label="الموظف"
          className={select}
        >
          <option value="">كل الموظفين</option>
          {options.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>

        <select
          value={params.get("floor") ?? ""}
          onChange={(event) => set("floor", event.target.value)}
          aria-label="الطابق"
          className={select}
        >
          <option value="">كل الطوابق</option>
          {options.floors.map((floor) => (
            <option key={floor} value={String(floor)}>
              الطابق {floor}
            </option>
          ))}
        </select>

        <select
          value={params.get("unitTypeId") ?? ""}
          onChange={(event) => set("unitTypeId", event.target.value)}
          aria-label="نوع الوحدة"
          className={select}
        >
          <option value="">كل أنواع الوحدات</option>
          {options.unitTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>

        {active.length > 0 && (
          <button
            type="button"
            onClick={() => router.replace("/housekeeping", { scroll: false })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-content-muted hover:bg-surface-inset"
          >
            <X className="size-3.5" aria-hidden />
            مسح الفلاتر
          </button>
        )}
      </div>
    </div>
  );
}
