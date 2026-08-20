import "server-only";

import { addDays, toISODate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { add, money, subtract, toAmountString, type Money } from "@/lib/money";
import type { Permission } from "@/lib/permissions";
import { getBusinessDateContext } from "@/server/business-date";
import { toAppError } from "@/server/errors";

import type { Prisma } from "@/generated/prisma/client";

/**
 * Dashboard data.
 *
 * Two principles run through this file.
 *
 * First, the database does the arithmetic. Counting occupied rooms by loading every
 * reservation into JavaScript would work today and fall over at ten thousand stays;
 * the aggregations below stay in SQL and return numbers, not rows.
 *
 * Second, permission filtering happens here, not in the view. A user without
 * financial access does not get financial figures hidden by CSS — the queries never
 * run and the values never enter the response. That was a Stage 1 guarantee and it
 * still holds.
 *
 * Every section is independently fallible: a widget that fails returns an error
 * marker rather than taking down the page, and never a zero. A zero and "could not
 * load" mean different things to someone deciding whether to chase a payment.
 */

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A section either loaded, or failed — never silently zero. */
export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): Section<T> => ({ ok: true, data });
const failed = (error: unknown): Section<never> => ({
  ok: false,
  error: toAppError(error).message,
});

/**
 * Wraps a section query. The technical detail is logged; the caller gets a message
 * safe to render.
 */
async function section<T>(name: string, query: () => Promise<T>): Promise<Section<T>> {
  try {
    return ok(await query());
  } catch (error) {
    console.error(`[dashboard:${name}]`, error);
    return failed(error);
  }
}

export type UnitStateCounts = {
  total: number;
  occupied: number;
  available: number;
  reserved: number;
  dirty: number;
  cleaning: number;
  maintenance: number;
  blocked: number;
  /** Rooms the hotel could sell tonight: everything not blocked or out of service. */
  sellable: number;
  /** occupied / sellable, as a percentage rounded to one decimal place. */
  occupancyRate: number;
};

export type ArrivalRow = {
  id: string;
  reservationNumber: string;
  guestName: string;
  guestMobile: string | null;
  unitNumber: string | null;
  unitTypeName: string;
  nights: number;
  adults: number;
  children: number;
  source: string;
  status: string;
  paymentStatus: string;
  balance: string;
};

export type DepartureRow = {
  id: string;
  reservationNumber: string;
  guestName: string;
  unitNumber: string | null;
  checkInDate: string;
  balance: string;
  paymentStatus: string;
};

export type FinancialSnapshot = {
  /** Payments banked today, refunds subtracted. Cash in, not revenue earned. */
  collectedToday: string;
  collectedThisMonth: string;
  /** Accommodation earned for tonight — nightly rates of stays in house. */
  accommodationEarnedToday: string;
  /** Owed by stays that are still open. Cancelled and no-show are excluded. */
  outstandingBalance: string;
  outstandingCount: number;
  expensesThisMonth: string;
  /** collected − expenses, month to date. Cash flow, deliberately not "profit". */
  netCashFlowThisMonth: string;
};

export type AlertPriority = "high" | "medium" | "low";

export type OperationalAlert = {
  id: string;
  kind: string;
  message: string;
  priority: AlertPriority;
  /** Where the alert came from, so a later phase can link to it. */
  entityType: string;
  entityId: string | null;
};

export type TrendPoint = { date: string; value: number; label?: string };

export type SourceSlice = { source: string; count: number };

export type RecentReservationRow = {
  id: string;
  reservationNumber: string;
  guestName: string;
  unitNumber: string | null;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  paymentStatus: string;
  total: string;
  balance: string;
  createdAt: string;
};

export type HousekeepingSnapshot = {
  pending: number;
  assigned: number;
  inProgress: number;
  urgent: number;
  tasks: Array<{
    id: string;
    unitNumber: string;
    status: string;
    priority: string;
    taskType: string;
    assignee: string | null;
  }>;
};

export type MaintenanceSnapshot = {
  open: number;
  active: number;
  tasks: Array<{
    id: string;
    unitNumber: string | null;
    issue: string;
    priority: string;
    status: string;
    assignee: string | null;
  }>;
};

export type LowStockRow = {
  id: string;
  name: string;
  quantity: string;
  minimumQuantity: string;
  unit: string;
};

export type ActivityRow = {
  id: string;
  userName: string;
  action: string;
  module: string;
  description: string;
  createdAt: string;
};

export type DashboardSnapshot = {
  propertyName: string;
  businessDate: string;
  isDemoDate: boolean;
  units: Section<UnitStateCounts>;
  arrivals: Section<ArrivalRow[]>;
  departures: Section<DepartureRow[]>;
  alerts: Section<OperationalAlert[]>;
  financial: Section<FinancialSnapshot> | null;
  occupancyTrend: Section<TrendPoint[]> | null;
  collectionTrend: Section<TrendPoint[]> | null;
  sources: Section<SourceSlice[]> | null;
  recentReservations: Section<RecentReservationRow[]> | null;
  housekeeping: Section<HousekeepingSnapshot> | null;
  maintenance: Section<MaintenanceSnapshot> | null;
  lowStock: Section<LowStockRow[]> | null;
  activity: Section<ActivityRow[]> | null;
};

/** Statuses that put a guest in the room tonight. */
const IN_HOUSE = ["CHECKED_IN"] as const;

/** Statuses that owe money worth chasing. A cancelled booking owes nothing. */
const OPEN_FOR_BILLING = ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] as const;

/** Statuses that occupied a room on a past night, for the history chart. */
const HISTORICALLY_OCCUPYING = ["CHECKED_IN", "CHECKED_OUT"] as const;

export const TREND_DAYS = 30;

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * Room state.
 *
 * Occupancy is occupied ÷ sellable, where sellable excludes rooms that could not be
 * sold tonight at any price — blocked rooms and rooms out of service. Dividing by
 * the full inventory instead would quietly punish a hotel for taking a room off the
 * market to fix it, which is the opposite of what the number is for. Rooms reserved
 * for tonight's arrivals are *not* counted as occupied: nobody is in them yet.
 */
async function loadUnitCounts(propertyId: string): Promise<UnitStateCounts> {
  const [byStatus, byHousekeeping, outOfService] = await Promise.all([
    prisma.unit.groupBy({
      by: ["status"],
      where: { propertyId },
      _count: { _all: true },
    }),
    prisma.unit.groupBy({
      by: ["housekeepingStatus"],
      where: { propertyId },
      _count: { _all: true },
    }),
    prisma.unit.count({
      where: { propertyId, maintenanceStatus: { not: "OPERATIONAL" } },
    }),
  ]);

  const status = (key: string) =>
    byStatus.find((row) => row.status === key)?._count._all ?? 0;
  const housekeeping = (key: string) =>
    byHousekeeping.find((row) => row.housekeepingStatus === key)?._count._all ?? 0;

  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  const blocked = status("BLOCKED");
  const maintenance = status("MAINTENANCE");
  const occupied = status("OCCUPIED");

  const sellable = Math.max(0, total - blocked - Math.max(maintenance, outOfService));

  return {
    total,
    occupied,
    available: status("AVAILABLE"),
    reserved: status("RESERVED"),
    dirty: housekeeping("DIRTY"),
    cleaning: housekeeping("CLEANING"),
    maintenance,
    blocked,
    sellable,
    // A property with nothing sellable has no occupancy rate — 0, not a division
    // by zero that renders as NaN%.
    occupancyRate: sellable === 0 ? 0 : Math.round((occupied / sellable) * 1000) / 10,
  };
}

async function loadArrivals(propertyId: string, date: Date): Promise<ArrivalRow[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      propertyId,
      checkInDate: date,
      status: { in: ["CONFIRMED", "PENDING"] },
    },
    select: {
      id: true,
      reservationNumber: true,
      checkInDate: true,
      checkOutDate: true,
      adults: true,
      children: true,
      source: true,
      status: true,
      paymentStatus: true,
      balance: true,
      guest: { select: { fullName: true, mobile: true } },
      unit: { select: { unitNumber: true } },
      unitType: { select: { name: true } },
    },
    orderBy: [{ unitId: "asc" }, { reservationNumber: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    reservationNumber: row.reservationNumber,
    guestName: row.guest.fullName,
    guestMobile: row.guest.mobile,
    // Null is legitimate: the room is chosen at the desk. The view labels it.
    unitNumber: row.unit?.unitNumber ?? null,
    unitTypeName: row.unitType.name,
    nights: Math.round(
      (row.checkOutDate.getTime() - row.checkInDate.getTime()) / 86_400_000,
    ),
    adults: row.adults,
    children: row.children,
    source: row.source,
    status: row.status,
    paymentStatus: row.paymentStatus,
    balance: toAmountString(row.balance),
  }));
}

async function loadDepartures(propertyId: string, date: Date): Promise<DepartureRow[]> {
  const rows = await prisma.reservation.findMany({
    where: { propertyId, checkOutDate: date, status: { in: [...IN_HOUSE] } },
    select: {
      id: true,
      reservationNumber: true,
      checkInDate: true,
      balance: true,
      paymentStatus: true,
      guest: { select: { fullName: true } },
      unit: { select: { unitNumber: true } },
    },
    // Guests who still owe money first — they are the ones reception must catch.
    orderBy: [{ balance: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    reservationNumber: row.reservationNumber,
    guestName: row.guest.fullName,
    unitNumber: row.unit?.unitNumber ?? null,
    checkInDate: toISODate(row.checkInDate),
    balance: toAmountString(row.balance),
    paymentStatus: row.paymentStatus,
  }));
}

async function loadFinancial(propertyId: string, date: Date): Promise<FinancialSnapshot> {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const nextDay = addDays(date, 1);
  const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

  const [today, month, expenses, outstanding, inHouse] = await Promise.all([
    // Summing signed amounts means refunds subtract themselves — no special case.
    prisma.payment.aggregate({
      where: { propertyId, paymentDate: { gte: date, lt: nextDay } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { propertyId, paymentDate: { gte: monthStart, lt: nextMonth } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { propertyId, date: { gte: monthStart, lt: nextMonth } },
      _sum: { amount: true },
    }),
    prisma.reservation.aggregate({
      where: {
        propertyId,
        status: { in: [...OPEN_FOR_BILLING] },
        balance: { gt: 0 },
      },
      _sum: { balance: true },
      _count: { _all: true },
    }),
    // Accommodation earned tonight: one night's rate for every occupied room.
    prisma.reservation.aggregate({
      where: {
        propertyId,
        status: { in: [...IN_HOUSE] },
        checkInDate: { lte: date },
        checkOutDate: { gt: date },
      },
      _sum: { nightlyRate: true },
    }),
  ]);

  const collectedToday = money(today._sum.amount);
  const collectedThisMonth = money(month._sum.amount);
  const expensesThisMonth = money(expenses._sum.amount);

  return {
    collectedToday: toAmountString(collectedToday),
    collectedThisMonth: toAmountString(collectedThisMonth),
    accommodationEarnedToday: toAmountString(inHouse._sum.nightlyRate),
    outstandingBalance: toAmountString(outstanding._sum.balance),
    outstandingCount: outstanding._count._all,
    expensesThisMonth: toAmountString(expensesThisMonth),
    netCashFlowThisMonth: toAmountString(subtract(collectedThisMonth, expensesThisMonth)),
  };
}

/**
 * Historical occupancy.
 *
 * Derived from stay intervals, never from today's room status — a room that is
 * clean now says nothing about whether it was sold three weeks ago. A stay occupies
 * a date when checkIn <= date < checkOut, the same exclusive-checkout rule the rest
 * of the system uses, so the two can never disagree.
 *
 * One query returns every stay overlapping the window; the per-day counting is a
 * scan over that array. The alternative — a query per day — is thirty round trips
 * for the same answer.
 */
async function loadOccupancyTrend(
  propertyId: string,
  date: Date,
  days: number,
  sellable: number,
): Promise<TrendPoint[]> {
  const start = addDays(date, -(days - 1));
  const end = addDays(date, 1);

  const stays = await prisma.reservation.findMany({
    where: {
      propertyId,
      status: { in: [...HISTORICALLY_OCCUPYING] },
      unitId: { not: null },
      checkInDate: { lt: end },
      checkOutDate: { gt: start },
    },
    select: { checkInDate: true, checkOutDate: true },
  });

  const points: TrendPoint[] = [];

  for (let offset = 0; offset < days; offset++) {
    const day = addDays(start, offset);
    const time = day.getTime();

    const occupied = stays.reduce(
      (count, stay) =>
        stay.checkInDate.getTime() <= time && stay.checkOutDate.getTime() > time
          ? count + 1
          : count,
      0,
    );

    points.push({
      date: toISODate(day),
      value: sellable === 0 ? 0 : Math.round((occupied / sellable) * 1000) / 10,
      label: `${occupied} من ${sellable}`,
    });
  }

  return points;
}

/** Daily collections. Grouped in SQL; refunds net themselves out of their day. */
async function loadCollectionTrend(
  propertyId: string,
  date: Date,
  days: number,
): Promise<TrendPoint[]> {
  const start = addDays(date, -(days - 1));
  const end = addDays(date, 1);

  const rows = await prisma.$queryRaw<Array<{ day: Date | string; total: Prisma.Decimal }>>`
    SELECT DATE(paymentDate) AS day, SUM(amount) AS total
    FROM payments
    WHERE propertyId = ${propertyId}
      AND paymentDate >= ${start}
      AND paymentDate < ${end}
    GROUP BY DATE(paymentDate)`;

  const byDay = new Map<string, Money>();
  for (const row of rows) {
    const key =
      typeof row.day === "string" ? row.day.slice(0, 10) : toISODate(row.day);
    byDay.set(key, add(byDay.get(key) ?? money(0), money(row.total)));
  }

  const points: TrendPoint[] = [];
  for (let offset = 0; offset < days; offset++) {
    const key = toISODate(addDays(start, offset));
    const amount = byDay.get(key) ?? money(0);
    // A day with no payments is a real zero, not a gap.
    points.push({ date: key, value: amount.toNumber() });
  }

  return points;
}

async function loadSources(propertyId: string): Promise<SourceSlice[]> {
  const rows = await prisma.reservation.groupBy({
    by: ["source"],
    where: { propertyId, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
  });

  return rows.map((row) => ({ source: row.source, count: row._count._all }));
}

async function loadRecentReservations(propertyId: string): Promise<RecentReservationRow[]> {
  const rows = await prisma.reservation.findMany({
    where: { propertyId },
    select: {
      id: true,
      reservationNumber: true,
      checkInDate: true,
      checkOutDate: true,
      status: true,
      paymentStatus: true,
      total: true,
      balance: true,
      createdAt: true,
      guest: { select: { fullName: true } },
      unit: { select: { unitNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return rows.map((row) => ({
    id: row.id,
    reservationNumber: row.reservationNumber,
    guestName: row.guest.fullName,
    unitNumber: row.unit?.unitNumber ?? null,
    checkInDate: toISODate(row.checkInDate),
    checkOutDate: toISODate(row.checkOutDate),
    status: row.status,
    paymentStatus: row.paymentStatus,
    total: toAmountString(row.total),
    balance: toAmountString(row.balance),
    createdAt: row.createdAt.toISOString(),
  }));
}

async function loadHousekeeping(propertyId: string): Promise<HousekeepingSnapshot> {
  const [counts, urgent, tasks] = await Promise.all([
    prisma.housekeepingTask.groupBy({
      by: ["status"],
      where: { propertyId, status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } },
      _count: { _all: true },
    }),
    prisma.housekeepingTask.count({
      where: {
        propertyId,
        status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] },
        priority: { in: ["HIGH", "URGENT"] },
      },
    }),
    prisma.housekeepingTask.findMany({
      where: { propertyId, status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } },
      select: {
        id: true,
        status: true,
        priority: true,
        taskType: true,
        unit: { select: { unitNumber: true } },
        assignee: { select: { name: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 6,
    }),
  ]);

  const count = (key: string) =>
    counts.find((row) => row.status === key)?._count._all ?? 0;

  return {
    pending: count("PENDING"),
    assigned: count("ASSIGNED"),
    inProgress: count("IN_PROGRESS"),
    urgent,
    tasks: tasks.map((task) => ({
      id: task.id,
      unitNumber: task.unit.unitNumber,
      status: task.status,
      priority: task.priority,
      taskType: task.taskType,
      assignee: task.assignee?.name ?? null,
    })),
  };
}

async function loadMaintenance(propertyId: string): Promise<MaintenanceSnapshot> {
  const [open, active, tasks] = await Promise.all([
    prisma.maintenanceRequest.count({ where: { propertyId, status: "OPEN" } }),
    prisma.maintenanceRequest.count({
      where: { propertyId, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
    }),
    prisma.maintenanceRequest.findMany({
      where: { propertyId, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
      select: {
        id: true,
        issue: true,
        priority: true,
        status: true,
        unit: { select: { unitNumber: true } },
        assignee: { select: { name: true } },
      },
      orderBy: [{ priority: "desc" }, { openedAt: "asc" }],
      take: 6,
    }),
  ]);

  return {
    open,
    active,
    tasks: tasks.map((task) => ({
      id: task.id,
      // Null where the fault is not in a room — a lobby lift, for instance.
      unitNumber: task.unit?.unitNumber ?? null,
      issue: task.issue,
      priority: task.priority,
      status: task.status,
      assignee: task.assignee?.name ?? null,
    })),
  };
}

async function loadLowStock(propertyId: string): Promise<LowStockRow[]> {
  // Column-to-column comparison, which Prisma's filter syntax cannot express.
  const rows = await prisma.$queryRaw<
    Array<{ id: string; name: string; quantity: Prisma.Decimal; minimumQuantity: Prisma.Decimal; unit: string }>
  >`
    SELECT id, name, quantity, minimumQuantity, unit
    FROM inventory_items
    WHERE propertyId = ${propertyId}
      AND status = 'ACTIVE'
      AND quantity < minimumQuantity
    ORDER BY (minimumQuantity - quantity) DESC
    LIMIT 8`;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    quantity: toAmountString(row.quantity),
    minimumQuantity: toAmountString(row.minimumQuantity),
    unit: row.unit,
  }));
}

async function loadActivity(propertyId: string): Promise<ActivityRow[]> {
  const rows = await prisma.activityLog.findMany({
    where: { propertyId },
    // The snapshot columns, deliberately — not a join to users. An entry must read
    // correctly after the person who made it is renamed or removed.
    select: {
      id: true,
      userName: true,
      action: true,
      module: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return rows.map((row) => ({
    id: row.id,
    userName: row.userName,
    action: row.action,
    module: row.module,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Alerts.
 *
 * Derived from operational records rather than stored as their own table: an alert
 * that outlives the condition that caused it is worse than no alert. Each rule
 * answers "what would a supervisor want chased before the end of the shift".
 */
async function loadAlerts(
  propertyId: string,
  date: Date,
  permissions: Set<string>,
): Promise<OperationalAlert[]> {
  const alerts: OperationalAlert[] = [];

  const [unassignedArrivals, departuresOwing, dirtyRooms, urgentTasks, urgentFaults, lowStock] =
    await Promise.all([
      prisma.reservation.findMany({
        where: { propertyId, checkInDate: date, status: "CONFIRMED", unitId: null },
        select: { id: true, reservationNumber: true, guest: { select: { fullName: true } } },
      }),
      permissions.has("payments.view")
        ? prisma.reservation.findMany({
            where: {
              propertyId,
              checkOutDate: date,
              status: { in: [...IN_HOUSE] },
              balance: { gt: 0 },
            },
            select: {
              id: true,
              balance: true,
              guest: { select: { fullName: true } },
              unit: { select: { unitNumber: true } },
            },
            orderBy: { balance: "desc" },
          })
        : Promise.resolve([]),
      prisma.unit.findMany({
        where: { propertyId, housekeepingStatus: "DIRTY" },
        select: { id: true, unitNumber: true },
        take: 6,
      }),
      permissions.has("housekeeping.view")
        ? prisma.housekeepingTask.findMany({
            where: {
              propertyId,
              status: { in: ["PENDING", "ASSIGNED"] },
              priority: { in: ["HIGH", "URGENT"] },
            },
            select: { id: true, priority: true, unit: { select: { unitNumber: true } } },
            take: 5,
          })
        : Promise.resolve([]),
      permissions.has("maintenance.view")
        ? prisma.maintenanceRequest.findMany({
            where: {
              propertyId,
              status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
              priority: { in: ["HIGH", "URGENT"] },
            },
            select: {
              id: true,
              issue: true,
              priority: true,
              unit: { select: { unitNumber: true } },
            },
            take: 5,
          })
        : Promise.resolve([]),
      permissions.has("inventory.view")
        ? prisma.$queryRaw<Array<{ id: string; name: string }>>`
            SELECT id, name FROM inventory_items
            WHERE propertyId = ${propertyId} AND status = 'ACTIVE'
              AND quantity < minimumQuantity
            LIMIT 5`
        : Promise.resolve([]),
    ]);

  for (const arrival of unassignedArrivals) {
    alerts.push({
      id: `arrival-unassigned-${arrival.id}`,
      kind: "arrival_without_unit",
      message: `وصول اليوم ${arrival.guest.fullName} (${arrival.reservationNumber}) لم تُحدّد له وحدة بعد`,
      priority: "high",
      entityType: "Reservation",
      entityId: arrival.id,
    });
  }

  for (const departure of departuresOwing) {
    alerts.push({
      id: `departure-balance-${departure.id}`,
      kind: "departure_with_balance",
      message: `مغادرة اليوم ${departure.guest.fullName}${
        departure.unit ? ` — الغرفة ${departure.unit.unitNumber}` : ""
      } عليها رصيد ${toAmountString(departure.balance)} ر.س`,
      priority: "high",
      entityType: "Reservation",
      entityId: departure.id,
    });
  }

  for (const fault of urgentFaults) {
    alerts.push({
      id: `maintenance-${fault.id}`,
      kind: "urgent_maintenance",
      message: `بلاغ صيانة ${fault.priority === "URGENT" ? "عاجل" : "مرتفع الأولوية"}${
        fault.unit ? ` — الغرفة ${fault.unit.unitNumber}` : " — منطقة عامة"
      }: ${fault.issue}`,
      priority: fault.priority === "URGENT" ? "high" : "medium",
      entityType: "MaintenanceRequest",
      entityId: fault.id,
    });
  }

  for (const task of urgentTasks) {
    alerts.push({
      id: `housekeeping-${task.id}`,
      kind: "urgent_housekeeping",
      message: `مهمة تنظيف ${task.priority === "URGENT" ? "عاجلة" : "ذات أولوية"} بانتظار الإنجاز — الغرفة ${task.unit.unitNumber}`,
      priority: "medium",
      entityType: "HousekeepingTask",
      entityId: task.id,
    });
  }

  if (dirtyRooms.length > 0) {
    alerts.push({
      id: "rooms-need-cleaning",
      kind: "rooms_need_cleaning",
      message: `${dirtyRooms.length} ${dirtyRooms.length === 1 ? "غرفة تحتاج" : "غرف تحتاج"} تنظيفًا: ${dirtyRooms
        .map((room) => room.unitNumber)
        .join("، ")}`,
      priority: "medium",
      entityType: "Unit",
      entityId: null,
    });
  }

  if (lowStock.length > 0) {
    alerts.push({
      id: "low-stock",
      kind: "low_stock",
      message: `${lowStock.length} من أصناف المخزون تحت الحد الأدنى: ${lowStock
        .map((item) => item.name)
        .join("، ")}`,
      priority: "low",
      entityType: "InventoryItem",
      entityId: null,
    });
  }

  const order: Record<AlertPriority, number> = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => order[a.priority] - order[b.priority]);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Builds the whole dashboard for one user.
 *
 * Sections the user may not see are not merely omitted from the render — their
 * queries never run, so the data never reaches the response body. Everything else
 * runs concurrently: these are independent reads, and thirty sequential round trips
 * would be thirty times the latency for no benefit.
 */
export async function getDashboardSnapshot(
  permissions: readonly Permission[],
  /** Explicit property, for tests and for a future property switcher. */
  propertyId?: string,
): Promise<DashboardSnapshot | null> {
  const granted = new Set<string>(permissions);
  const { date, isDemo } = await getBusinessDateContext();

  const property = propertyId
    ? await prisma.property.findUnique({
        where: { id: propertyId },
        select: { id: true, name: true },
      })
    : await prisma.property.findFirst({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });

  if (!property) return null;

  const id = property.id;

  const canSeeFinance = granted.has("payments.view");
  const canSeeReservations = granted.has("reservations.view");
  const canSeeHousekeeping = granted.has("housekeeping.view");
  const canSeeMaintenance = granted.has("maintenance.view");
  const canSeeInventory = granted.has("inventory.view");
  const canSeeActivity = granted.has("activity.view");
  const canSeeExpenses = granted.has("expenses.view");

  const units = await section("units", () => loadUnitCounts(id));
  const sellable = units.ok ? units.data.sellable : 0;

  const [
    arrivals,
    departures,
    alerts,
    financial,
    occupancyTrend,
    collectionTrend,
    sources,
    recentReservations,
    housekeeping,
    maintenance,
    lowStock,
    activity,
  ] = await Promise.all([
    canSeeReservations
      ? section("arrivals", () => loadArrivals(id, date))
      : Promise.resolve(ok<ArrivalRow[]>([])),
    canSeeReservations
      ? section("departures", () => loadDepartures(id, date))
      : Promise.resolve(ok<DepartureRow[]>([])),
    section("alerts", () => loadAlerts(id, date, granted)),
    canSeeFinance
      ? section("financial", async () => {
          const snapshot = await loadFinancial(id, date);
          // Expenses are a separate permission; blank the figures that depend on
          // them rather than withholding the whole financial card.
          return canSeeExpenses
            ? snapshot
            : { ...snapshot, expensesThisMonth: "0.00", netCashFlowThisMonth: "0.00" };
        })
      : null,
    section("occupancyTrend", () => loadOccupancyTrend(id, date, TREND_DAYS, sellable)),
    canSeeFinance
      ? section("collectionTrend", () => loadCollectionTrend(id, date, TREND_DAYS))
      : null,
    canSeeReservations ? section("sources", () => loadSources(id)) : null,
    canSeeReservations
      ? section("recentReservations", () => loadRecentReservations(id))
      : null,
    canSeeHousekeeping ? section("housekeeping", () => loadHousekeeping(id)) : null,
    canSeeMaintenance ? section("maintenance", () => loadMaintenance(id)) : null,
    canSeeInventory ? section("lowStock", () => loadLowStock(id)) : null,
    canSeeActivity ? section("activity", () => loadActivity(id)) : null,
  ]);

  return {
    propertyName: property.name,
    businessDate: toISODate(date),
    isDemoDate: isDemo,
    units,
    arrivals,
    departures,
    alerts,
    financial,
    occupancyTrend,
    collectionTrend,
    sources,
    recentReservations,
    housekeeping,
    maintenance,
    lowStock,
    activity,
  };
}
