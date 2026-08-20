/**
 * Date and time.
 *
 * The system deals with two different things that both look like dates, and mixing
 * them is the source of most timezone bugs in hospitality software:
 *
 *   Business dates — check-in, check-out, invoice issue date, expense date.
 *     A calendar day at the property. "20 August" means the same day to reception
 *     whether the browser is in Riyadh, London or a server set to UTC. Stored in
 *     MySQL DATE columns and represented here as a Date pinned to UTC midnight.
 *
 *   Instants — payment time, check-in time, task completion, audit timestamps.
 *     A specific moment. Stored in DATETIME(3) columns, always UTC, rendered in
 *     the property's timezone at the display edge.
 *
 * Nothing in the application constructs these by hand. Everything goes through the
 * helpers below, so there is exactly one place where the rules live.
 */

/** The property operates in Saudi Arabia; display and "today" are anchored here. */
export const PROPERTY_TIMEZONE = "Asia/Riyadh";

export type DateInput = Date | string | number;

/**
 * Normalises any input to a business date: UTC midnight of the calendar day.
 *
 * A bare "2026-08-20" is read as that calendar day directly. A full timestamp is
 * first shifted into the property's timezone, so a payment taken at 01:30 Riyadh
 * time belongs to that Riyadh day, not to the previous UTC one.
 */
export function businessDate(input: DateInput): Date {
  if (typeof input === "string") {
    const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
    if (isoDay) {
      return new Date(
        Date.UTC(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3])),
      );
    }
  }

  const instant = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`قيمة تاريخ غير صالحة: ${String(input)}`);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPERTY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

/** Today's business date at the property. */
export function businessToday(now: Date = new Date()): Date {
  return businessDate(now);
}

/** "2026-08-20" — the wire and form representation of a business date. */
export function toISODate(input: DateInput): string {
  return businessDate(input).toISOString().slice(0, 10);
}

export function addDays(input: DateInput, days: number): Date {
  const base = businessDate(input);
  return new Date(base.getTime() + days * 86_400_000);
}

/**
 * Nights between two business dates — the way hotels count them. Check-out is
 * exclusive: 20 → 22 is two nights, and the room is sellable again on the 22nd.
 */
export function nightsBetween(checkIn: DateInput, checkOut: DateInput): number {
  const start = businessDate(checkIn);
  const end = businessDate(checkOut);
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return nights > 0 ? nights : 0;
}

export function isSameBusinessDate(a: DateInput, b: DateInput): boolean {
  return businessDate(a).getTime() === businessDate(b).getTime();
}

export function isBeforeBusinessDate(a: DateInput, b: DateInput): boolean {
  return businessDate(a).getTime() < businessDate(b).getTime();
}

/**
 * Two half-open business-date ranges overlap when each starts before the other
 * ends. Shared by the reservation collision check and by availability queries so
 * both can never drift apart.
 */
export function rangesOverlap(
  aStart: DateInput,
  aEnd: DateInput,
  bStart: DateInput,
  bEnd: DateInput,
): boolean {
  return (
    businessDate(aStart).getTime() < businessDate(bEnd).getTime() &&
    businessDate(aEnd).getTime() > businessDate(bStart).getTime()
  );
}

/** The current instant. A single seam, so tests can freeze time. */
export function now(): Date {
  return new Date();
}

/** Start and end instants of a business day, for querying DATETIME columns. */
export function businessDayBounds(input: DateInput): { from: Date; to: Date } {
  const day = businessDate(input);
  const offsetMinutes = timezoneOffsetMinutes(day);
  const from = new Date(day.getTime() - offsetMinutes * 60_000);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

/** Property timezone offset in minutes for a given instant (+180 for Riyadh). */
function timezoneOffsetMinutes(at: Date): number {
  const utc = new Date(
    at.toLocaleString("en-US", { timeZone: "UTC" }),
  ).getTime();
  const local = new Date(
    at.toLocaleString("en-US", { timeZone: PROPERTY_TIMEZONE }),
  ).getTime();
  return Math.round((local - utc) / 60_000);
}
