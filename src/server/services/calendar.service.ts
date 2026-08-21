import "server-only";

import { ReservationStatus } from "@/generated/prisma/enums";
import { addDays, businessDate, toISODate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import type { Permission } from "@/lib/permissions";
import { AppError, withDbErrors } from "@/server/errors";
import { getBusinessDate } from "@/server/business-date";

import { INVENTORY_STATUSES } from "./availability.service";

/**
 * The reservation calendar.
 *
 * A **view** of the booking engine, never a second one. Every rule it draws with —
 * what counts as occupied, when a room is free again, which bookings hold inventory —
 * is imported from Stage 7, not restated here. If the calendar and the booking form
 * ever disagreed about whether a room is free, the calendar would be the one lying,
 * and a receptionist would trust it.
 *
 * Two properties keep it honest at scale. It queries only what intersects the visible
 * window, so a hotel with a hundred thousand historical bookings costs the same as one
 * with a hundred. And it issues a fixed number of statements regardless of how many
 * rooms are shown — four, not four hundred.
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** How many whole days from one business date to another. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export type BarGeometry = {
  /** Zero-based column the bar starts in. */
  startIndex: number;
  /** How many columns it covers. Always at least 1 when visible. */
  span: number;
  /** True when the interval began before the window — draw a continuation marker. */
  clippedStart: boolean;
  /** True when it continues past the window. */
  clippedEnd: boolean;
};

/**
 * Where an interval sits in the visible window, or null when it does not appear.
 *
 * Half-open throughout, exactly as the engine treats a stay: `checkIn <= day <
 * checkOut`. A booking of 20→22 covers the 20th and the 21st and leaves the 22nd free,
 * so a bar for it is two columns wide and the next guest's bar starts where it ends —
 * touching, never overlapping. Restating that rule with an inclusive end here would
 * paint one extra night per booking and make the board disagree with the database.
 *
 * Pure, and separated from the queries, because it is the part most worth testing on
 * its own: the boundaries are where a timeline goes wrong.
 */
export function barGeometry(
  intervalStart: Date,
  /** Exclusive. Null means open-ended — it runs to the end of the window. */
  intervalEnd: Date | null,
  rangeStart: Date,
  days: number,
): BarGeometry | null {
  const rangeEnd = addDays(rangeStart, days);
  const end = intervalEnd ?? rangeEnd;

  const visibleStart = intervalStart > rangeStart ? intervalStart : rangeStart;
  const visibleEnd = end < rangeEnd ? end : rangeEnd;

  // Touching the window without entering it is not appearing in it.
  if (visibleEnd.getTime() <= visibleStart.getTime()) return null;

  return {
    startIndex: daysBetween(rangeStart, visibleStart),
    span: Math.max(1, daysBetween(visibleStart, visibleEnd)),
    clippedStart: intervalStart.getTime() < rangeStart.getTime(),
    clippedEnd: intervalEnd !== null && end.getTime() > rangeEnd.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Bounded on purpose — a calendar is a working window, not an archive browser. */
export const ALLOWED_DAYS = [7, 14, 30] as const;
export const DEFAULT_DAYS = 14;

/**
 * Statuses that appear as bars, and what each one means on the board.
 *
 * `committed` rooms are sold — these are exactly Stage 7's inventory statuses.
 * `historical` is a stay that has ended; it explains why a past night was occupied.
 * `tentative` is a pending enquiry, drawn differently because it holds nothing, and
 * shown only when asked for.
 *
 * Cancelled and no-show bookings are absent by default. Drawing them across a room
 * would say the room is spoken for when it is on sale, which is the most expensive
 * thing this screen could get wrong.
 */
export type BarKind = "committed" | "historical" | "tentative";

const BAR_KIND: Partial<Record<ReservationStatus, BarKind>> = {
  CONFIRMED: "committed",
  CHECKED_IN: "committed",
  CHECKED_OUT: "historical",
  PENDING: "tentative",
};

export type CalendarColumn = {
  iso: string;
  /** Day of the month. */
  day: number;
  /** Short weekday name, in Arabic. */
  weekday: string;
  month: string;
  isBusinessDate: boolean;
  isWeekend: boolean;
};

export type CalendarBar = {
  id: string;
  reservationNumber: string;
  guestId: string;
  guestName: string;
  status: string;
  kind: BarKind;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  geometry: BarGeometry;
  /** Only for callers holding `payments.view`. */
  paymentStatus?: string;
};

export type CalendarBlock = {
  id: string;
  reason: string;
  notes: string | null;
  startDate: string;
  endDate: string | null;
  geometry: BarGeometry;
};

export type CalendarRow = {
  unitId: string;
  unitNumber: string;
  floor: number | null;
  unitTypeId: string;
  unitTypeName: string;
  status: string;
  housekeepingStatus: string;
  maintenanceStatus: string;
  /** Readiness on the business date only — never a claim about future nights. */
  needsPreparationToday: boolean;
  /** True when the room cannot be sold at all right now: a fault, not a booking. */
  outOfService: boolean;
  bars: CalendarBar[];
  blocks: CalendarBlock[];
};

export type UnassignedReservation = {
  id: string;
  reservationNumber: string;
  guestId: string;
  guestName: string;
  unitTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  status: string;
  /** The front-desk action item: confirmed, arriving today, still no room. */
  arrivesToday: boolean;
  paymentStatus?: string;
};

/** One booking as it appears in the day agenda. */
export type DayEntry = {
  id: string;
  reservationNumber: string;
  guestName: string;
  unitId: string | null;
  unitNumber: string | null;
  unitTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
};

/**
 * The selected day, described in full.
 *
 * Everything here comes from one query bounded to that single day. It is deliberately
 * not read off the drawn bars: a guest checking out this morning spent their last
 * night yesterday, so their booking does not intersect a window that opens today and
 * no bar exists for them — which is how "who is leaving today" comes back empty on the
 * one screen that has to answer it.
 */
export type DayAgenda = {
  summary: DaySummary;
  arrivals: DayEntry[];
  staying: DayEntry[];
  departures: DayEntry[];
  /** Rooms free that night, for the agenda's availability line. */
  availableUnits: Array<{ id: string; unitNumber: string; unitTypeName: string }>;
};

/**
 * The day's figures, named for what each one measures.
 *
 * Deliberately not called "occupied" and "available": those words already mean
 * something else on the dashboard, which reports the building's present state rather
 * than a night's inventory. See `@/server/occupancy` for the full vocabulary and why
 * the two families of question are kept apart.
 */
export type DaySummary = {
  date: string;
  units: number;
  /** Rooms sold for that night. A guest departing that morning is not among them. */
  soldOnDate: number;
  /** Everyone arriving that day, whether or not they have checked in. */
  allArrivals: number;
  /** Everyone leaving that day, including those already gone. */
  allDepartures: number;
  blocked: number;
  maintenance: number;
  /** Rooms not sold that night, whatever their housekeeping state. */
  sellableOnDate: number;
  unassignedArrivals: number;
  needsPreparation: number;
};

export type CalendarSnapshot = {
  from: string;
  to: string;
  days: number;
  businessDate: string;
  columns: CalendarColumn[];
  rows: CalendarRow[];
  unassigned: UnassignedReservation[];
  /** The business date by default; the agenda's selected day when one is given. */
  agenda: DayAgenda;
  /** Distinct floors present, for the filter. */
  floors: number[];
  unitTypes: Array<{ id: string; name: string }>;
  totalUnits: number;
};

export type CalendarFilters = {
  from?: string;
  days?: number;
  floor?: number;
  unitTypeId?: string;
  /** Include pending enquiries as tentative bars. Off by default. */
  includeTentative?: boolean;
  /** The day the agenda describes. Defaults to the property's business date. */
  day?: string;
};

const WEEKDAY = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  weekday: "short",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  month: "short",
  timeZone: "UTC",
});

/**
 * One calendar window.
 *
 * Four queries, whatever the room count: the rooms, the bookings that intersect the
 * window, the blocks that intersect it, and the bookings with no room yet. Everything
 * else — the geometry, the day's counts, the readiness flags — is computed over those
 * bounded sets in memory, where it costs nothing.
 */
export async function getReservationCalendar(
  propertyIds: string[],
  filters: CalendarFilters,
  permissions: ReadonlySet<Permission>,
): Promise<CalendarSnapshot> {
  const today = await getBusinessDate();
  const canSeeMoney = permissions.has("payments.view");

  /*
   * The window is clamped rather than trusted. `days=5000` is either a mistake or
   * someone probing, and both are answered the same way: a working window.
   */
  const days = (ALLOWED_DAYS as readonly number[]).includes(filters.days ?? DEFAULT_DAYS)
    ? (filters.days ?? DEFAULT_DAYS)
    : DEFAULT_DAYS;

  let from: Date;
  try {
    from = filters.from ? businessDate(filters.from) : addDays(today, -2);
  } catch {
    throw new AppError("VALIDATION", "تاريخ بداية التقويم غير صالح.", {
      fields: { from: "تاريخ غير صالح" },
    });
  }

  const to = addDays(from, days);

  /*
   * The agenda's day is its own parameter. The mobile view walks day by day through a
   * window the desktop view scrolls through, and both read the same description of
   * whichever day is selected.
   */
  let agendaDay: Date;
  try {
    agendaDay = filters.day ? businessDate(filters.day) : today;
  } catch {
    agendaDay = today;
  }

  return withDbErrors("calendar.snapshot", async () => {
    const unitWhere = {
      propertyId: { in: propertyIds },
      ...(filters.floor !== undefined ? { floor: filters.floor } : {}),
      ...(filters.unitTypeId ? { unitTypeId: filters.unitTypeId } : {}),
    };

    /*
     * The canonical intersection, the same one the availability service uses: a
     * booking is in the window when it starts before the window ends and ends after
     * the window starts. Anything else is not fetched — this is what keeps the query
     * bounded by the window rather than by the size of the reservations table.
     */
    const intersects = { checkInDate: { lt: to }, checkOutDate: { gt: from } };

    const visibleStatuses: ReservationStatus[] = [
      ...INVENTORY_STATUSES,
      ReservationStatus.CHECKED_OUT,
      ...(filters.includeTentative ? [ReservationStatus.PENDING] : []),
    ];

    const [units, reservations, blocks, unassignedRows, allTypes, allFloors] =
      await Promise.all([
        prisma.unit.findMany({
          where: unitWhere,
          orderBy: [{ floor: "asc" }, { unitNumber: "asc" }],
          select: {
            id: true,
            unitNumber: true,
            floor: true,
            status: true,
            housekeepingStatus: true,
            maintenanceStatus: true,
            unitType: { select: { id: true, name: true } },
          },
        }),

        prisma.reservation.findMany({
          where: {
            propertyId: { in: propertyIds },
            unitId: { not: null },
            status: { in: visibleStatuses },
            ...intersects,
            ...(filters.floor !== undefined || filters.unitTypeId
              ? { unit: { is: unitWhere } }
              : {}),
          },
          orderBy: { checkInDate: "asc" },
          // Narrow on purpose: a bar needs a name and a status, not a guest profile.
          select: {
            id: true,
            reservationNumber: true,
            unitId: true,
            status: true,
            checkInDate: true,
            checkOutDate: true,
            guest: { select: { id: true, fullName: true } },
            ...(canSeeMoney ? { paymentStatus: true } : {}),
          },
        }),

        prisma.unitBlock.findMany({
          where: {
            propertyId: { in: propertyIds },
            active: true,
            startDate: { lt: to },
            OR: [{ endDate: null }, { endDate: { gt: from } }],
          },
          select: {
            id: true,
            unitId: true,
            reason: true,
            notes: true,
            startDate: true,
            endDate: true,
          },
        }),

        prisma.reservation.findMany({
          where: {
            propertyId: { in: propertyIds },
            unitId: null,
            status: { in: [...INVENTORY_STATUSES] },
            ...intersects,
            ...(filters.unitTypeId ? { unitTypeId: filters.unitTypeId } : {}),
          },
          orderBy: { checkInDate: "asc" },
          select: {
            id: true,
            reservationNumber: true,
            status: true,
            checkInDate: true,
            checkOutDate: true,
            guest: { select: { id: true, fullName: true } },
            unitType: { select: { name: true } },
            ...(canSeeMoney ? { paymentStatus: true } : {}),
          },
        }),

        prisma.unitType.findMany({
          where: { propertyId: { in: propertyIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),

        prisma.unit.findMany({
          where: { propertyId: { in: propertyIds }, floor: { not: null } },
          distinct: ["floor"],
          orderBy: { floor: "asc" },
          select: { floor: true },
        }),
      ]);

    const columns: CalendarColumn[] = Array.from({ length: days }, (_, index) => {
      const date = addDays(from, index);
      // getUTCDay: 5 is Friday, 6 Saturday — the Saudi weekend.
      const weekday = date.getUTCDay();
      return {
        iso: toISODate(date),
        day: date.getUTCDate(),
        weekday: WEEKDAY.format(date),
        month: MONTH.format(date),
        isBusinessDate: date.getTime() === today.getTime(),
        isWeekend: weekday === 5 || weekday === 6,
      };
    });

    const barsByUnit = new Map<string, CalendarBar[]>();
    for (const reservation of reservations) {
      const geometry = barGeometry(
        reservation.checkInDate,
        reservation.checkOutDate,
        from,
        days,
      );
      if (!geometry || !reservation.unitId) continue;

      const kind = BAR_KIND[reservation.status];
      if (!kind) continue;

      const list = barsByUnit.get(reservation.unitId) ?? [];
      list.push({
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        guestId: reservation.guest.id,
        guestName: reservation.guest.fullName,
        status: reservation.status,
        kind,
        checkInDate: toISODate(reservation.checkInDate),
        checkOutDate: toISODate(reservation.checkOutDate),
        nights: daysBetween(reservation.checkInDate, reservation.checkOutDate),
        geometry,
        ...(canSeeMoney && "paymentStatus" in reservation
          ? { paymentStatus: reservation.paymentStatus as string }
          : {}),
      });
      barsByUnit.set(reservation.unitId, list);
    }

    const blocksByUnit = new Map<string, CalendarBlock[]>();
    for (const block of blocks) {
      const geometry = barGeometry(block.startDate, block.endDate, from, days);
      if (!geometry) continue;

      const list = blocksByUnit.get(block.unitId) ?? [];
      list.push({
        id: block.id,
        reason: block.reason,
        notes: block.notes,
        startDate: toISODate(block.startDate),
        endDate: block.endDate ? toISODate(block.endDate) : null,
        geometry,
      });
      blocksByUnit.set(block.unitId, list);
    }

    const todayIso = toISODate(today);

    const rows: CalendarRow[] = units.map((unit) => ({
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      floor: unit.floor,
      unitTypeId: unit.unitType.id,
      unitTypeName: unit.unitType.name,
      status: unit.status,
      housekeepingStatus: unit.housekeepingStatus,
      maintenanceStatus: unit.maintenanceStatus,
      /*
       * Readiness, and only for today. A room needing a clean this morning says
       * nothing about whether it can be sold next month — painting future cells from
       * it would stop a hotel selling the room a departing guest is about to vacate.
       */
      needsPreparationToday:
        unit.housekeepingStatus === "DIRTY" || unit.housekeepingStatus === "CLEANING",
      outOfService: unit.maintenanceStatus !== "OPERATIONAL",
      bars: barsByUnit.get(unit.id) ?? [],
      blocks: blocksByUnit.get(unit.id) ?? [],
    }));

    const unassigned: UnassignedReservation[] = unassignedRows.map((row) => ({
      id: row.id,
      reservationNumber: row.reservationNumber,
      guestId: row.guest.id,
      guestName: row.guest.fullName,
      unitTypeName: row.unitType.name,
      checkInDate: toISODate(row.checkInDate),
      checkOutDate: toISODate(row.checkOutDate),
      nights: daysBetween(row.checkInDate, row.checkOutDate),
      status: row.status,
      arrivesToday: toISODate(row.checkInDate) === todayIso,
      ...(canSeeMoney && "paymentStatus" in row
        ? { paymentStatus: row.paymentStatus as string }
        : {}),
    }));

    return {
      from: toISODate(from),
      to: toISODate(to),
      days,
      businessDate: todayIso,
      columns,
      rows,
      unassigned,
      agenda: await describeDay(
        propertyIds,
        unitWhere,
        rows,
        unassigned,
        agendaDay,
        toISODate(agendaDay),
        todayIso,
      ),
      floors: allFloors.map((row) => row.floor!).filter((floor) => floor !== null),
      unitTypes: allTypes,
      totalUnits: units.length,
    };
  });
}

/**
 * Everything about one day: its counts and its three lists.
 *
 * One query, bounded to that single day, is the source for all of it — including the
 * departures the drawn bars cannot supply. Reading it separately also means the
 * numbers stay true when the calendar window is scrolled to next month: the agenda
 * describes the day it names, not whatever happens to be on screen.
 */
async function describeDay(
  propertyIds: string[],
  unitWhere: Record<string, unknown>,
  rows: CalendarRow[],
  unassigned: UnassignedReservation[],
  day: Date,
  dayIso: string,
  todayIso: string,
): Promise<DayAgenda> {
  const nextDay = addDays(day, 1);
  const unitIds = rows.map((row) => row.unitId);
  const filteringUnits = Object.keys(unitWhere).length > 1;

  const [touching, blocked] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        propertyId: { in: propertyIds },
        // Everything that starts on, ends on, or spans the day.
        OR: [
          { checkInDate: { lte: day }, checkOutDate: { gt: day } },
          { checkOutDate: day },
        ],
        status: {
          in: [
            ...INVENTORY_STATUSES,
            // A departed guest still departed that day — that is the whole point.
            ReservationStatus.CHECKED_OUT,
          ],
        },
        ...(filteringUnits ? { unit: { is: unitWhere } } : {}),
      },
      orderBy: { checkInDate: "asc" },
      select: {
        id: true,
        reservationNumber: true,
        unitId: true,
        status: true,
        checkInDate: true,
        checkOutDate: true,
        guest: { select: { fullName: true } },
        unit: { select: { unitNumber: true } },
        unitType: { select: { name: true } },
      },
    }),

    prisma.unitBlock.findMany({
      where: {
        propertyId: { in: propertyIds },
        unitId: { in: unitIds },
        active: true,
        startDate: { lte: day },
        OR: [{ endDate: null }, { endDate: { gt: day } }],
      },
      select: { unitId: true },
    }),
  ]);

  const blockedUnits = new Set(blocked.map((block) => block.unitId));
  const occupiedUnits = new Set<string>();

  const arrivals: DayEntry[] = [];
  const staying: DayEntry[] = [];
  const departures: DayEntry[] = [];

  const entry = (row: (typeof touching)[number]): DayEntry => ({
    id: row.id,
    reservationNumber: row.reservationNumber,
    guestName: row.guest.fullName,
    unitId: row.unitId,
    unitNumber: row.unit?.unitNumber ?? null,
    unitTypeName: row.unitType.name,
    checkInDate: toISODate(row.checkInDate),
    checkOutDate: toISODate(row.checkOutDate),
    status: row.status,
  });

  for (const reservation of touching) {
    const checkIn = reservation.checkInDate.getTime();
    const checkOut = reservation.checkOutDate.getTime();

    if (checkOut === day.getTime()) {
      departures.push(entry(reservation));
      // Their last night was yesterday; they occupy nothing tonight.
      continue;
    }

    // A completed stay that is not leaving today has nothing to say about today.
    if (reservation.status === ReservationStatus.CHECKED_OUT) continue;

    if (checkIn === day.getTime()) arrivals.push(entry(reservation));
    else staying.push(entry(reservation));

    if (checkIn <= day.getTime() && checkOut >= nextDay.getTime() && reservation.unitId) {
      occupiedUnits.add(reservation.unitId);
    }
  }

  let maintenance = 0;
  let needsPreparation = 0;
  const availableUnits: Array<{ id: string; unitNumber: string; unitTypeName: string }> = [];

  for (const row of rows) {
    if (row.outOfService) maintenance += 1;

    const occupied = occupiedUnits.has(row.unitId);
    // Readiness is a property of today, so it only qualifies today's figures.
    if (occupied && row.needsPreparationToday && dayIso === todayIso) needsPreparation += 1;

    /*
     * Counted, not subtracted. A room can be blocked and out of service at once, and
     * three separate subtractions from the total would charge it twice — producing a
     * smaller availability figure than the hotel actually has, or a negative one.
     */
    if (!occupied && !blockedUnits.has(row.unitId) && !row.outOfService) {
      availableUnits.push({
        id: row.unitId,
        unitNumber: row.unitNumber,
        unitTypeName: row.unitTypeName,
      });
    }
  }

  const unassignedArrivals = unassigned.filter((row) => row.checkInDate === dayIso);

  return {
    summary: {
      date: dayIso,
      /*
       * `arrivals` already contains the bookings with no room: the day query filters
       * by property, not by unit, so a confirmed arrival without a room is in it like
       * any other. Adding the unassigned count on top counted those two guests twice
       * and reported eight arrivals where the hotel expects six.
       */
      units: rows.length,
      soldOnDate: occupiedUnits.size,
      allArrivals: arrivals.length,
      allDepartures: departures.length,
      blocked: rows.filter((row) => blockedUnits.has(row.unitId)).length,
      maintenance,
      sellableOnDate: availableUnits.length,
      unassignedArrivals: unassignedArrivals.length,
      needsPreparation,
    },
    arrivals,
    staying,
    departures,
    availableUnits,
  };
}
