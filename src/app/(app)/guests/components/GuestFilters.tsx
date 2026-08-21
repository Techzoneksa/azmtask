"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { IDENTIFICATION_TYPES } from "@/lib/guest-identity";

/**
 * Directory filters, held in the URL.
 *
 * The query string is the source of truth, so a search survives a refresh, works as a
 * bookmark, and can be linked to from elsewhere — one mechanism serving all three
 * rather than three that drift apart.
 */

const STATUSES = [
  { value: "current", label: "نزيل حالي" },
  { value: "upcoming", label: "لديه حجز قادم" },
  { value: "repeat", label: "نزيل متكرر" },
] as const;

export function GuestFilters({ nationalities }: { nationalities: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      // Any change returns to page one: page 4 of a new search is usually empty and
      // always confusing.
      next.delete("page");
      router.replace(`/guests${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router],
  );

  const set = (key: string, value: string) =>
    push((next) => (value ? next.set(key, value) : next.delete(key)));

  // The URL can change without this input — a back navigation, a link from elsewhere.
  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  // Debounced, so a phone number typed at speed issues one request, not ten.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;

    const timer = setTimeout(() => {
      push((next) => (query ? next.set("q", query) : next.delete("q")));
    }, 300);

    return () => clearTimeout(timer);
  }, [query, params, push]);

  const nationality = params.get("nationality") ?? "";
  const identificationType = params.get("identificationType") ?? "";
  const status = params.get("status") ?? "";
  const active = Boolean(query || nationality || identificationType || status);

  const selectClass =
    "h-9 rounded-lg border border-line bg-surface px-2.5 text-[12px] text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50";

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
          aria-label="ابحث بالاسم أو الجوال أو رقم الوثيقة"
          placeholder="ابحث بالاسم أو الجوال أو رقم الوثيقة"
          className="h-10 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-[13px] text-content placeholder:text-content-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(event) => set("status", event.target.value)}
          aria-label="الحالة"
          className={selectClass}
        >
          <option value="">كل النزلاء</option>
          {STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={nationality}
          onChange={(event) => set("nationality", event.target.value)}
          aria-label="الجنسية"
          className={selectClass}
        >
          <option value="">كل الجنسيات</option>
          {nationalities.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={identificationType}
          onChange={(event) => set("identificationType", event.target.value)}
          aria-label="نوع الوثيقة"
          className={selectClass}
        >
          <option value="">كل الوثائق</option>
          {IDENTIFICATION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        {active && (
          <button
            type="button"
            onClick={() => router.replace("/guests", { scroll: false })}
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
