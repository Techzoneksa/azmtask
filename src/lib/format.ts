/**
 * Display formatting.
 *
 * Every user-facing date, amount and number in the system goes through here so the
 * interface stays consistent. Locale is Arabic (Saudi) but numerals stay Latin —
 * operational staff read room numbers and amounts faster that way.
 */

const LOCALE = "ar-SA-u-nu-latn";
const TIME_ZONE = "Asia/Riyadh";
export const CURRENCY = "SAR";

export type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 20 أغسطس 2026 */
export function formatDate(value: DateInput, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** 20/08/2026 — for dense tables where the long form does not fit. */
export function formatDateShort(value: DateInput, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** 20 أغسطس 2026، 3:45 م */
export function formatDateTime(value: DateInput, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** 3:45 م */
export function formatTime(value: DateInput, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** "قبل ٣ ساعات" style relative label, used in activity feeds. */
export function formatRelative(value: DateInput, fallback = "—"): string {
  const date = toDate(value);
  if (!date) return fallback;
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  if (abs < MINUTE) return "الآن";
  if (abs < HOUR) return rtf.format(Math.round(diffMs / MINUTE), "minute");
  if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), "hour");
  if (abs < 30 * DAY) return rtf.format(Math.round(diffMs / DAY), "day");
  return formatDate(date);
}

/** 1,250.00 ر.س */
export function formatCurrency(
  value: number | null | undefined,
  { decimals = 2 }: { decimals?: number } = {},
): string {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/** 1,250 — plain grouped number. */
export function formatNumber(
  value: number | null | undefined,
  { decimals = 0 }: { decimals?: number } = {},
): string {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/** 82% */
export function formatPercent(
  value: number | null | undefined,
  { decimals = 0 }: { decimals?: number } = {},
): string {
  const ratio = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(ratio / 100);
}

/** "3 ليالٍ" — Arabic plural rules for the most common operational unit. */
export function formatNights(count: number): string {
  if (count === 1) return "ليلة واحدة";
  if (count === 2) return "ليلتان";
  if (count >= 3 && count <= 10) return `${formatNumber(count)} ليالٍ`;
  return `${formatNumber(count)} ليلة`;
}

/** Whole nights between two dates, the way hotels count them. */
export function nightsBetween(checkIn: DateInput, checkOut: DateInput): number {
  const start = toDate(checkIn);
  const end = toDate(checkOut);
  if (!start || !end) return 0;
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = Math.round((endDay - startDay) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/** ISO yyyy-mm-dd, the value shape every <input type="date"> expects. */
export function toDateInputValue(value: DateInput): string {
  const date = toDate(value);
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Saudi mobile numbers, grouped for readability: 05X XXX XXXX */
export function formatMobile(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("05")) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length === 12 && digits.startsWith("966")) {
    const local = `0${digits.slice(3)}`;
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return value;
}

/** Two-letter initials for avatars, safe for Arabic names. */
export function initials(name: string | null | undefined): string {
  if (!name) return "؟";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}
