"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PAYMENT_STATUS, RESERVATION_SOURCE, RESERVATION_STATUS } from "@/lib/status";

/**
 * Booking filters, held in the URL.
 *
 * The desk's two most frequent questions — who arrives today, who leaves today — are
 * one click each, because they are the reason anyone opens this screen in the morning.
 */

export type FilterOptions = {
  unitTypes: Array<{ id: string; name: string }>;
  /** The property's operating date, so "today" means the hotel's today. */
  businessDate: string;
};

const selectClass =
  "h-9 rounded-lg border border-line bg-surface px-2.5 text-[12px] text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50";

export function ReservationFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      // Any change returns to page one — page four of a new filter is usually empty.
      next.delete("page");
      router.replace(`/reservations${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router],
  );

  const set = (key: string, value: string) =>
    push((next) => (value ? next.set(key, value) : next.delete(key)));

  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => {
      push((next) => (query ? next.set("q", query) : next.delete("q")));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, params, push]);

  const arrival = params.get("arrival") ?? "";
  const departure = params.get("departure") ?? "";
  const status = params.get("status") ?? "";
  const paymentStatus = params.get("paymentStatus") ?? "";
  const source = params.get("source") ?? "";
  const unitTypeId = params.get("unitTypeId") ?? "";
  const unassigned = params.get("unassigned") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const active = Boolean(
    query || arrival || departure || status || paymentStatus || source || unitTypeId ||
      unassigned || from || to,
  );

  /** The two one-click questions. Toggling one clears the other. */
  const toggleDay = (key: "arrival" | "departure") =>
    push((next) => {
      const other = key === "arrival" ? "departure" : "arrival";
      next.delete(other);
      if (next.get(key) === options.businessDate) next.delete(key);
      else next.set(key, options.businessDate);
    });

  const chip = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
      on
        ? "bg-brand-600 text-white"
        : "border border-line bg-surface text-content-muted hover:bg-surface-inset"
    }`;

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-content-subtle"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="ابحث برقم الحجز أو اسم النزيل أو الجوال أو رقم الوحدة"
          placeholder="ابحث برقم الحجز أو اسم النزيل أو الجوال أو رقم الوحدة"
          className="h-10 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-[13px] text-content placeholder:text-content-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => toggleDay("arrival")}
          aria-pressed={arrival === options.businessDate}
          className={chip(arrival === options.businessDate)}
        >
          وصول اليوم
        </button>
        <button
          type="button"
          onClick={() => toggleDay("departure")}
          aria-pressed={departure === options.businessDate}
          className={chip(departure === options.businessDate)}
        >
          مغادرة اليوم
        </button>
        <button
          type="button"
          onClick={() => set("unassigned", unassigned ? "" : "true")}
          aria-pressed={Boolean(unassigned)}
          className={chip(Boolean(unassigned))}
        >
          بلا وحدة
        </button>

        <select
          value={status}
          onChange={(event) => set("status", event.target.value)}
          aria-label="حالة الحجز"
          className={selectClass}
        >
          <option value="">كل الحالات</option>
          {Object.entries(RESERVATION_STATUS).map(([key, meta]) => (
            <option key={key} value={key.toUpperCase()}>
              {meta.label}
            </option>
          ))}
        </select>

        <select
          value={paymentStatus}
          onChange={(event) => set("paymentStatus", event.target.value)}
          aria-label="حالة السداد"
          className={selectClass}
        >
          <option value="">كل حالات السداد</option>
          {Object.entries(PAYMENT_STATUS).map(([key, meta]) => (
            <option key={key} value={key.toUpperCase()}>
              {meta.label}
            </option>
          ))}
        </select>

        <select
          value={source}
          onChange={(event) => set("source", event.target.value)}
          aria-label="مصدر الحجز"
          className={selectClass}
        >
          <option value="">كل المصادر</option>
          {Object.entries(RESERVATION_SOURCE).map(([key, meta]) => (
            <option key={key} value={key.toUpperCase()}>
              {meta.label}
            </option>
          ))}
        </select>

        <select
          value={unitTypeId}
          onChange={(event) => set("unitTypeId", event.target.value)}
          aria-label="نوع الوحدة"
          className={selectClass}
        >
          <option value="">كل الأنواع</option>
          {options.unitTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-content-muted">
          إقامات تشمل من
          <input
            type="date"
            dir="ltr"
            value={from}
            onChange={(event) => set("from", event.target.value)}
            className={selectClass}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-content-muted">
          إلى
          <input
            type="date"
            dir="ltr"
            value={to}
            onChange={(event) => set("to", event.target.value)}
            className={selectClass}
          />
        </label>

        {active && (
          <button
            type="button"
            onClick={() => router.replace("/reservations", { scroll: false })}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-content-muted transition-colors hover:bg-surface-inset hover:text-content"
          >
            <X className="size-3.5" aria-hidden />
            مسح الفلاتر
          </button>
        )}
      </div>
    </div>
  );
}
