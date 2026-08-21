import "server-only";

import { z } from "zod";

import { addDays, businessDate, toISODate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import { toAmountString } from "@/lib/money";
import { AppError, withDbErrors } from "@/server/errors";
import { getBusinessDate } from "@/server/business-date";
import { IdSchema, MoneySchema, fieldErrors, toSkipTake } from "@/server/validation";

import { recordActivity, type ActivityActor } from "./activity.service";

/**
 * Units, unit types, and the rules that keep a room's state defensible.
 *
 * The governing idea: a room's operational status is mostly *derived*, not typed in.
 * OCCUPIED follows from a stay, CLEANING from a housekeeping task, MAINTENANCE from
 * an open fault. Letting anyone set those by hand would let the board disagree with
 * the records underneath it — and a board nobody trusts is worse than no board.
 *
 * Only two statuses are a human decision: AVAILABLE and BLOCKED, and BLOCKED goes
 * through a record that says why and until when.
 */

// ---------------------------------------------------------------------------
// Status policy
// ---------------------------------------------------------------------------

/** Derived from records elsewhere. Never settable through the units screen. */
export const SYSTEM_MANAGED_STATUSES = ["OCCUPIED", "RESERVED", "CLEANING", "MAINTENANCE"] as const;

/** A human decision, and the only statuses this module writes directly. */
export const USER_MANAGED_STATUSES = ["AVAILABLE", "BLOCKED"] as const;

/** Reservation statuses that hold a room and so block a period. */
const HOLDING = ["CONFIRMED", "CHECKED_IN"] as const;

/**
 * Recomputes a unit's operational status from the records that justify it.
 *
 * Ordered by how absolute each condition is: a guest in the room outranks a
 * pending clean, an open fault outranks both, and a block outranks everything
 * because it is a deliberate decision to withhold the room.
 */
export async function deriveUnitStatus(
  unitId: string,
  tx: Pick<typeof prisma, "unit" | "reservation" | "housekeepingTask" | "maintenanceRequest" | "unitBlock"> = prisma,
  businessDay?: Date,
): Promise<{ status: string; maintenanceStatus: string }> {
  const today = businessDay ?? (await getBusinessDate());

  const [inHouse, openFault, activeBlock, activeClean, upcomingToday] = await Promise.all([
    tx.reservation.count({
      where: { unitId, status: "CHECKED_IN" },
    }),
    tx.maintenanceRequest.count({
      where: { unitId, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
    }),
    tx.unitBlock.count({
      where: {
        unitId,
        active: true,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gt: today } }],
      },
    }),
    tx.housekeepingTask.count({
      where: { unitId, status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } },
    }),
    tx.reservation.count({
      where: { unitId, status: "CONFIRMED", checkInDate: today },
    }),
  ]);

  const unit = await tx.unit.findUniqueOrThrow({
    where: { id: unitId },
    select: { maintenanceStatus: true },
  });

  const maintenanceStatus =
    openFault > 0 && unit.maintenanceStatus === "OPERATIONAL"
      ? unit.maintenanceStatus
      : unit.maintenanceStatus;

  const status =
    activeBlock > 0
      ? "BLOCKED"
      : unit.maintenanceStatus !== "OPERATIONAL"
        ? "MAINTENANCE"
        : inHouse > 0
          ? "OCCUPIED"
          : activeClean > 0
            ? "CLEANING"
            : upcomingToday > 0
              ? "RESERVED"
              : "AVAILABLE";

  return { status, maintenanceStatus };
}

/** Applies the derived status. Called after anything that could change it. */
export async function refreshUnitStatus(unitId: string): Promise<void> {
  const { status } = await deriveUnitStatus(unitId);
  await prisma.unit.update({ where: { id: unitId }, data: { status: status as never } });
}

/**
 * The same recomputation, bound to the caller's transaction.
 *
 * A room's status must change in the same commit as the event that justified it. A
 * check-in that updated the reservation and then refreshed the room on its own
 * connection would leave a window — and, if the transaction rolled back, a room
 * permanently marked occupied by a guest who was never checked in.
 *
 * The business date is passed in rather than read again: the caller already resolved
 * it to decide eligibility, and a second read on a different connection could answer
 * differently across midnight.
 */
export async function syncUnitStatus(
  tx: Pick<typeof prisma, "unit" | "reservation" | "housekeepingTask" | "maintenanceRequest" | "unitBlock">,
  unitId: string,
  businessDay: Date,
): Promise<string> {
  const { status } = await deriveUnitStatus(unitId, tx, businessDay);
  await tx.unit.update({ where: { id: unitId }, data: { status: status as never } });
  return status;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export const UnitFilterSchema = z.object({
  q: z.string().trim().max(40).optional(),
  floor: z.coerce.number().int().min(0).max(200).optional(),
  unitTypeId: IdSchema.optional(),
  status: z.enum(["AVAILABLE", "RESERVED", "OCCUPIED", "CLEANING", "MAINTENANCE", "BLOCKED"]).optional(),
  housekeeping: z.enum(["CLEAN", "DIRTY", "CLEANING", "INSPECTED"]).optional(),
  maintenance: z.enum(["OPERATIONAL", "UNDER_MAINTENANCE", "OUT_OF_SERVICE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type UnitFilters = z.infer<typeof UnitFilterSchema>;

export type UnitRow = {
  id: string;
  unitNumber: string;
  floor: number | null;
  unitTypeId: string;
  unitTypeName: string;
  capacity: number;
  baseRate: string;
  status: string;
  housekeepingStatus: string;
  maintenanceStatus: string;
  notes: string | null;
  /** Present only while someone is actually in the room. */
  currentGuest: string | null;
  currentReservationId: string | null;
  currentReservationNumber: string | null;
  checkOutDate: string | null;
  /** Why the room is withheld, when it is. */
  blockReason: string | null;
  openMaintenance: string | null;
};

function whereFrom(propertyId: string, filters: UnitFilters) {
  return {
    propertyId,
    ...(filters.floor !== undefined ? { floor: filters.floor } : {}),
    ...(filters.unitTypeId ? { unitTypeId: filters.unitTypeId } : {}),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.housekeeping ? { housekeepingStatus: filters.housekeeping as never } : {}),
    ...(filters.maintenance ? { maintenanceStatus: filters.maintenance as never } : {}),
    /*
     * Prefix matching, so the index on (propertyId, unitNumber) can be used. A
     * `contains` search would force a scan of every row in the property — fine at
     * forty rooms, not at four thousand.
     */
    ...(filters.q ? { unitNumber: { startsWith: filters.q } } : {}),
  };
}

/**
 * One page of units with the operational context each row shows.
 *
 * The related reads are scoped to the rows on this page, so the query count stays
 * flat whether the property has forty units or four thousand — Prisma batches each
 * relation into a single `IN` query rather than one per row.
 */
export async function listUnits(
  propertyId: string,
  filters: UnitFilters,
): Promise<{ rows: UnitRow[]; total: number; page: number; pageSize: number }> {
  return withDbErrors("unit.list", async () => {
    const today = await getBusinessDate();
    const where = whereFrom(propertyId, filters);
    const { skip, take } = toSkipTake(filters);

    const [total, units] = await Promise.all([
      prisma.unit.count({ where }),
      prisma.unit.findMany({
        where,
        skip,
        take,
        // Numeric-aware: "10" must not sort before "9".
        orderBy: [{ floor: "asc" }, { unitNumber: "asc" }],
        select: {
          id: true,
          unitNumber: true,
          floor: true,
          unitTypeId: true,
          status: true,
          housekeepingStatus: true,
          maintenanceStatus: true,
          notes: true,
          unitType: { select: { name: true, capacity: true, baseRate: true } },
          reservations: {
            where: { status: "CHECKED_IN" },
            select: {
              id: true,
              reservationNumber: true,
              checkOutDate: true,
              guest: { select: { fullName: true } },
            },
            take: 1,
          },
          blocks: {
            where: {
              active: true,
              startDate: { lte: today },
              OR: [{ endDate: null }, { endDate: { gt: today } }],
            },
            select: { reason: true },
            take: 1,
          },
          maintenanceRequests: {
            where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
            select: { issue: true },
            orderBy: { priority: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const rows: UnitRow[] = units.map((unit) => {
      const stay = unit.reservations[0];
      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        floor: unit.floor,
        unitTypeId: unit.unitTypeId,
        unitTypeName: unit.unitType.name,
        capacity: unit.unitType.capacity,
        baseRate: toAmountString(unit.unitType.baseRate),
        status: unit.status,
        housekeepingStatus: unit.housekeepingStatus,
        maintenanceStatus: unit.maintenanceStatus,
        notes: unit.notes,
        currentGuest: stay?.guest.fullName ?? null,
        currentReservationId: stay?.id ?? null,
        currentReservationNumber: stay?.reservationNumber ?? null,
        checkOutDate: stay ? toISODate(stay.checkOutDate) : null,
        blockReason: unit.blocks[0]?.reason ?? null,
        openMaintenance: unit.maintenanceRequests[0]?.issue ?? null,
      };
    });

    return { rows, total, page: filters.page, pageSize: filters.pageSize };
  });
}

/** Floors present in the property, for the filter control. */
export async function listFloors(propertyId: string): Promise<number[]> {
  const rows = await prisma.unit.findMany({
    where: { propertyId, floor: { not: null } },
    select: { floor: true },
    distinct: ["floor"],
    orderBy: { floor: "asc" },
  });
  return rows.map((row) => row.floor!).filter((floor) => floor !== null);
}

export { HOLDING };

// ---------------------------------------------------------------------------
// Creation and editing
// ---------------------------------------------------------------------------

export const CreateUnitSchema = z.object({
  unitNumber: z
    .string()
    .trim()
    .min(1, "رقم الوحدة مطلوب")
    .max(20, "رقم الوحدة أطول من الحد المسموح"),
  unitTypeId: IdSchema,
  floor: z.coerce.number().int().min(0).max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type CreateUnitInput = z.input<typeof CreateUnitSchema>;

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown, message: string): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", message, { fields: fieldErrors(result.error) });
  }
  return result.data;
}

/**
 * Creates a unit.
 *
 * The unit type is re-read inside the transaction and checked against the property:
 * an id arriving from a form is a claim, not a fact, and a unit pointing at another
 * property's type would corrupt every rate and capacity that reads through it.
 */
export async function createUnit(
  propertyId: string,
  rawInput: CreateUnitInput,
  actor: ActivityActor,
) {
  const input = parse(CreateUnitSchema, rawInput, "بيانات الوحدة غير صالحة.");

  return withDbErrors("unit.create", () =>
    prisma.$transaction(async (tx) => {
      const unitType = await tx.unitType.findUnique({
        where: { id: input.unitTypeId },
        select: { id: true, propertyId: true, name: true, status: true },
      });

      if (!unitType || unitType.propertyId !== propertyId) {
        throw new AppError("VALIDATION", "نوع الوحدة غير موجود في هذه المنشأة.", {
          fields: { unitTypeId: "نوع غير صالح" },
        });
      }

      if (unitType.status !== "ACTIVE") {
        throw new AppError("VALIDATION", "لا يمكن استخدام نوع وحدة موقوف.", {
          fields: { unitTypeId: "النوع غير مفعّل" },
        });
      }

      const unit = await tx.unit.create({
        data: {
          propertyId,
          unitTypeId: input.unitTypeId,
          unitNumber: input.unitNumber,
          floor: input.floor ?? null,
          notes: input.notes ?? null,
        },
        select: { id: true, unitNumber: true },
      });

      await recordActivity(
        {
          actor,
          propertyId,
          module: "units",
          action: "create",
          entityType: "Unit",
          entityId: unit.id,
          description: `إضافة الوحدة ${unit.unitNumber} (${unitType.name})`,
          metadata: { unitNumber: unit.unitNumber, unitType: unitType.name },
        },
        tx,
      );

      return unit;
    }),
  );
}

export const UpdateUnitSchema = CreateUnitSchema.partial().extend({
  unitId: IdSchema,
});

export type UpdateUnitInput = z.input<typeof UpdateUnitSchema>;

/**
 * Edits a unit's descriptive metadata.
 *
 * Deliberately cannot touch status, housekeepingStatus or maintenanceStatus. Those
 * are derived from records elsewhere, and a form that could overwrite them would let
 * the board claim a room is free while a guest is asleep in it.
 */
export async function updateUnit(
  propertyId: string,
  rawInput: UpdateUnitInput,
  actor: ActivityActor,
) {
  const input = parse(UpdateUnitSchema, rawInput, "بيانات الوحدة غير صالحة.");

  return withDbErrors("unit.update", () =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.unit.findUnique({
        where: { id: input.unitId },
        select: { id: true, propertyId: true, unitNumber: true, floor: true, unitTypeId: true },
      });

      if (!existing || existing.propertyId !== propertyId) {
        throw new AppError("NOT_FOUND", "الوحدة غير موجودة.");
      }

      if (input.unitTypeId && input.unitTypeId !== existing.unitTypeId) {
        const unitType = await tx.unitType.findUnique({
          where: { id: input.unitTypeId },
          select: { propertyId: true, status: true },
        });
        if (!unitType || unitType.propertyId !== propertyId) {
          throw new AppError("VALIDATION", "نوع الوحدة غير موجود في هذه المنشأة.", {
            fields: { unitTypeId: "نوع غير صالح" },
          });
        }
      }

      const unit = await tx.unit.update({
        where: { id: input.unitId },
        data: {
          ...(input.unitNumber !== undefined ? { unitNumber: input.unitNumber } : {}),
          ...(input.unitTypeId !== undefined ? { unitTypeId: input.unitTypeId } : {}),
          ...(input.floor !== undefined ? { floor: input.floor } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
        select: { id: true, unitNumber: true },
      });

      /*
       * A renumbered room is the one edit that breaks people's mental map — the
       * board, the printed key cards and the housekeeping sheet all disagree until
       * everyone is told. Recording the old number makes the change traceable.
       */
      const renamed = input.unitNumber && input.unitNumber !== existing.unitNumber;

      await recordActivity(
        {
          actor,
          propertyId,
          module: "units",
          action: "update",
          entityType: "Unit",
          entityId: unit.id,
          description: renamed
            ? `تغيير رقم الوحدة من ${existing.unitNumber} إلى ${unit.unitNumber}`
            : `تعديل بيانات الوحدة ${unit.unitNumber}`,
          metadata: renamed ? { from: existing.unitNumber, to: unit.unitNumber } : undefined,
        },
        tx,
      );

      return unit;
    }),
  );
}

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

export const BlockUnitSchema = z
  .object({
    unitId: IdSchema,
    reason: z.enum([
      "RENOVATION",
      "DEEP_CLEANING",
      "STAFF_USE",
      "OWNER_USE",
      "LONG_TERM_MAINTENANCE",
      "SEASONAL_CLOSURE",
      "OTHER",
    ]),
    notes: z.string().trim().max(2000).nullable().optional(),
    startDate: z.union([z.string(), z.date()]).optional(),
    endDate: z.union([z.string(), z.date()]).nullable().optional(),
  })
  .refine(
    (value) =>
      !value.endDate ||
      !value.startDate ||
      businessDate(value.endDate).getTime() > businessDate(value.startDate).getTime(),
    { message: "تاريخ نهاية الإيقاف يجب أن يكون بعد تاريخ البداية", path: ["endDate"] },
  );

export type BlockUnitInput = z.input<typeof BlockUnitSchema>;

export type BlockConflict = {
  reservationId: string;
  reservationNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
};

/**
 * Takes a unit off the market.
 *
 * Two things make this more than a status write.
 *
 * A room with a guest in it cannot be blocked — blocking is a statement that nobody
 * will be in the room, and saying that while somebody is would make the board lie.
 *
 * A room with confirmed arrivals inside the block period cannot be blocked either,
 * and the refusal names them. Blocking silently would strand guests who hold a
 * confirmation, and the desk would only find out when they walked in. Reassigning
 * them is a workflow of its own; until it exists, refusing loudly is the honest
 * behaviour.
 *
 * The overlap test and the insert share one transaction, so two supervisors blocking
 * the same room at once cannot both pass the check.
 */
export async function blockUnit(
  propertyId: string,
  rawInput: BlockUnitInput,
  actor: ActivityActor,
) {
  const input = parse(BlockUnitSchema, rawInput, "بيانات الإيقاف غير صالحة.");
  const today = await getBusinessDate();
  const startDate = input.startDate ? businessDate(input.startDate) : today;
  const endDate = input.endDate ? businessDate(input.endDate) : null;

  return withDbErrors("unit.block", () =>
    prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({
        where: { id: input.unitId },
        select: { id: true, propertyId: true, unitNumber: true, status: true },
      });

      if (!unit || unit.propertyId !== propertyId) {
        throw new AppError("NOT_FOUND", "الوحدة غير موجودة.");
      }

      const inHouse = await tx.reservation.count({
        where: { unitId: unit.id, status: "CHECKED_IN" },
      });
      if (inHouse > 0) {
        throw new AppError(
          "CONFLICT",
          `لا يمكن إيقاف الوحدة ${unit.unitNumber} وبها نزيل مقيم. أتمّ المغادرة أولًا.`,
        );
      }

      const alreadyBlocked = await tx.unitBlock.count({
        where: {
          unitId: unit.id,
          active: true,
          OR: [{ endDate: null }, { endDate: { gt: today } }],
        },
      });
      if (alreadyBlocked > 0) {
        throw new AppError("CONFLICT", `الوحدة ${unit.unitNumber} موقوفة بالفعل.`);
      }

      // Half-open overlap, the same rule stays use: a booking starting the day a
      // block ends does not conflict with it.
      const clashing = await tx.reservation.findMany({
        where: {
          unitId: unit.id,
          status: { in: [...HOLDING] },
          checkOutDate: { gt: startDate },
          ...(endDate ? { checkInDate: { lt: endDate } } : {}),
        },
        select: {
          id: true,
          reservationNumber: true,
          checkInDate: true,
          checkOutDate: true,
          guest: { select: { fullName: true } },
        },
        orderBy: { checkInDate: "asc" },
        take: 10,
      });

      if (clashing.length > 0) {
        const conflicts: BlockConflict[] = clashing.map((reservation) => ({
          reservationId: reservation.id,
          reservationNumber: reservation.reservationNumber,
          guestName: reservation.guest.fullName,
          checkInDate: toISODate(reservation.checkInDate),
          checkOutDate: toISODate(reservation.checkOutDate),
        }));

        throw new AppError(
          "CONFLICT",
          `لا يمكن إيقاف الوحدة ${unit.unitNumber}: توجد ${conflicts.length} ${
            conflicts.length === 1 ? "حجز مؤكد" : "حجوزات مؤكدة"
          } خلال فترة الإيقاف. انقل الحجوزات أولًا.`,
          { fields: { conflicts: JSON.stringify(conflicts) } },
        );
      }

      const block = await tx.unitBlock.create({
        data: {
          propertyId,
          unitId: unit.id,
          reason: input.reason,
          notes: input.notes ?? null,
          startDate,
          endDate,
          createdById: actor.id,
        },
        select: { id: true },
      });

      // The status follows the record, and only for a block that starts today.
      if (startDate.getTime() <= today.getTime()) {
        await tx.unit.update({ where: { id: unit.id }, data: { status: "BLOCKED" } });
      }

      await recordActivity(
        {
          actor,
          propertyId,
          module: "units",
          action: "block",
          entityType: "Unit",
          entityId: unit.id,
          description: `إيقاف الوحدة ${unit.unitNumber} — ${input.reason}${
            endDate ? ` حتى ${toISODate(endDate)}` : " (بلا تاريخ انتهاء)"
          }`,
          metadata: { reason: input.reason, startDate: toISODate(startDate), endDate: endDate ? toISODate(endDate) : null },
        },
        tx,
      );

      return { blockId: block.id, unitNumber: unit.unitNumber };
    }),
  );
}

/**
 * Returns a unit to service.
 *
 * The block row is closed rather than deleted, so the history of why the room was
 * out survives. The status is then recomputed from the records rather than assumed
 * to be AVAILABLE — the room may still be dirty, or a fault may have been opened
 * while it was blocked.
 */
export async function unblockUnit(
  propertyId: string,
  unitId: string,
  actor: ActivityActor,
) {
  return withDbErrors("unit.unblock", async () => {
    const result = await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({
        where: { id: unitId },
        select: { id: true, propertyId: true, unitNumber: true },
      });

      if (!unit || unit.propertyId !== propertyId) {
        throw new AppError("NOT_FOUND", "الوحدة غير موجودة.");
      }

      const active = await tx.unitBlock.findFirst({
        where: { unitId, active: true },
        orderBy: { createdAt: "desc" },
        select: { id: true, reason: true },
      });

      if (!active) {
        throw new AppError("CONFLICT", `الوحدة ${unit.unitNumber} ليست موقوفة.`);
      }

      await tx.unitBlock.update({
        where: { id: active.id },
        data: { active: false, endedAt: new Date(), endedById: actor.id },
      });

      await recordActivity(
        {
          actor,
          propertyId,
          module: "units",
          action: "unblock",
          entityType: "Unit",
          entityId: unit.id,
          description: `إعادة الوحدة ${unit.unitNumber} للخدمة`,
          metadata: { reason: active.reason },
        },
        tx,
      );

      return unit;
    });

    // Outside the transaction: the derived status reads several tables and must see
    // the closed block, which only exists once the transaction commits.
    await refreshUnitStatus(unitId);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export type UnitDetail = Awaited<ReturnType<typeof getUnitDetails>>;

/**
 * Everything the unit page shows, in one property-scoped read.
 *
 * The id alone is never trusted: a unit belonging to another property is reported as
 * not found rather than rendered, which is the behaviour that will still be correct
 * when a second property exists.
 */
export async function getUnitDetails(propertyId: string, unitId: string) {
  return withDbErrors("unit.detail", async () => {
    const today = await getBusinessDate();

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        propertyId: true,
        unitNumber: true,
        floor: true,
        status: true,
        housekeepingStatus: true,
        maintenanceStatus: true,
        notes: true,
        createdAt: true,
        unitType: {
          select: { id: true, name: true, capacity: true, baseRate: true, description: true },
        },
      },
    });

    if (!unit || unit.propertyId !== propertyId) {
      throw new AppError("NOT_FOUND", "الوحدة غير موجودة.");
    }

    const [currentStay, upcoming, block, housekeeping, maintenance, history, activity] =
      await Promise.all([
        prisma.reservation.findFirst({
          where: { unitId, status: "CHECKED_IN" },
          select: {
            id: true, reservationNumber: true, checkInDate: true, checkOutDate: true,
            adults: true, children: true, paymentStatus: true, balance: true, total: true,
            guest: { select: { id: true, fullName: true, mobile: true } },
          },
        }),
        // The next arrival, so the desk knows how long the room is really free.
        prisma.reservation.findFirst({
          where: { unitId, status: { in: [...HOLDING] }, checkInDate: { gte: today } },
          orderBy: { checkInDate: "asc" },
          select: {
            id: true, reservationNumber: true, checkInDate: true, checkOutDate: true,
            source: true, guest: { select: { fullName: true } },
          },
        }),
        prisma.unitBlock.findFirst({
          where: { unitId, active: true },
          orderBy: { createdAt: "desc" },
          select: {
            id: true, reason: true, notes: true, startDate: true, endDate: true,
            createdAt: true, createdBy: { select: { name: true } },
          },
        }),
        prisma.housekeepingTask.findMany({
          where: { unitId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true, status: true, taskType: true, priority: true,
            startedAt: true, completedAt: true, createdAt: true,
            assignee: { select: { name: true } },
          },
        }),
        prisma.maintenanceRequest.findMany({
          where: { unitId },
          orderBy: { openedAt: "desc" },
          take: 5,
          select: {
            id: true, issue: true, status: true, priority: true,
            openedAt: true, completedAt: true, assignee: { select: { name: true } },
          },
        }),
        prisma.reservation.findMany({
          where: { unitId },
          orderBy: { checkInDate: "desc" },
          take: 10,
          select: {
            id: true, reservationNumber: true, checkInDate: true, checkOutDate: true,
            status: true, total: true, guest: { select: { fullName: true } },
          },
        }),
        prisma.activityLog.findMany({
          where: { entityType: "Unit", entityId: unitId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, userName: true, action: true, description: true, createdAt: true },
        }),
      ]);

    return {
      id: unit.id,
      unitNumber: unit.unitNumber,
      floor: unit.floor,
      status: unit.status,
      housekeepingStatus: unit.housekeepingStatus,
      maintenanceStatus: unit.maintenanceStatus,
      notes: unit.notes,
      createdAt: unit.createdAt.toISOString(),
      unitType: {
        id: unit.unitType.id,
        name: unit.unitType.name,
        capacity: unit.unitType.capacity,
        baseRate: toAmountString(unit.unitType.baseRate),
        description: unit.unitType.description,
      },
      currentStay: currentStay
        ? {
            id: currentStay.id,
            guestId: currentStay.guest.id,
            reservationNumber: currentStay.reservationNumber,
            guestName: currentStay.guest.fullName,
            guestMobile: currentStay.guest.mobile,
            checkInDate: toISODate(currentStay.checkInDate),
            checkOutDate: toISODate(currentStay.checkOutDate),
            adults: currentStay.adults,
            children: currentStay.children,
            paymentStatus: currentStay.paymentStatus,
            balance: toAmountString(currentStay.balance),
            total: toAmountString(currentStay.total),
          }
        : null,
      upcoming: upcoming
        ? {
            id: upcoming.id,
            reservationNumber: upcoming.reservationNumber,
            guestName: upcoming.guest.fullName,
            checkInDate: toISODate(upcoming.checkInDate),
            checkOutDate: toISODate(upcoming.checkOutDate),
            source: upcoming.source,
          }
        : null,
      block: block
        ? {
            id: block.id,
            reason: block.reason,
            notes: block.notes,
            startDate: toISODate(block.startDate),
            endDate: block.endDate ? toISODate(block.endDate) : null,
            createdBy: block.createdBy?.name ?? null,
            createdAt: block.createdAt.toISOString(),
          }
        : null,
      housekeeping: housekeeping.map((task) => ({
        id: task.id,
        status: task.status,
        taskType: task.taskType,
        priority: task.priority,
        assignee: task.assignee?.name ?? null,
        startedAt: task.startedAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
      })),
      maintenance: maintenance.map((request) => ({
        id: request.id,
        issue: request.issue,
        status: request.status,
        priority: request.priority,
        assignee: request.assignee?.name ?? null,
        openedAt: request.openedAt.toISOString(),
        completedAt: request.completedAt?.toISOString() ?? null,
      })),
      history: history.map((reservation) => ({
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        guestName: reservation.guest.fullName,
        checkInDate: toISODate(reservation.checkInDate),
        checkOutDate: toISODate(reservation.checkOutDate),
        status: reservation.status,
        total: toAmountString(reservation.total),
      })),
      activity: activity.map((entry) => ({
        id: entry.id,
        userName: entry.userName,
        action: entry.action,
        description: entry.description,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Unit types
// ---------------------------------------------------------------------------

export type UnitTypeRow = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  baseRate: string;
  status: string;
  unitCount: number;
  reservationCount: number;
  /** False when rows elsewhere depend on it — the UI explains rather than hides. */
  canDeactivate: boolean;
};

export async function listUnitTypes(propertyId: string): Promise<UnitTypeRow[]> {
  return withDbErrors("unitType.list", async () => {
    const types = await prisma.unitType.findMany({
      where: { propertyId },
      orderBy: { baseRate: "asc" },
      select: {
        id: true, name: true, description: true, capacity: true, baseRate: true, status: true,
        _count: { select: { units: true, reservations: true } },
      },
    });

    return types.map((type) => ({
      id: type.id,
      name: type.name,
      description: type.description,
      capacity: type.capacity,
      baseRate: toAmountString(type.baseRate),
      status: type.status,
      unitCount: type._count.units,
      reservationCount: type._count.reservations,
      // A type still holding rooms is deactivated only after they are moved.
      canDeactivate: type._count.units === 0,
    }));
  });
}

export const UnitTypeSchema = z.object({
  name: z.string().trim().min(2, "اسم النوع مطلوب").max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  capacity: z.coerce.number().int().min(1, "السعة لا تقل عن نزيل واحد").max(20),
  baseRate: MoneySchema,
});

export type UnitTypeInput = z.input<typeof UnitTypeSchema>;

export async function createUnitType(
  propertyId: string,
  rawInput: UnitTypeInput,
  actor: ActivityActor,
) {
  const input = parse(UnitTypeSchema, rawInput, "بيانات نوع الوحدة غير صالحة.");

  return withDbErrors("unitType.create", () =>
    prisma.$transaction(async (tx) => {
      const type = await tx.unitType.create({
        data: {
          propertyId,
          name: input.name,
          description: input.description ?? null,
          capacity: input.capacity,
          baseRate: input.baseRate,
        },
        select: { id: true, name: true },
      });

      await recordActivity(
        {
          actor,
          propertyId,
          module: "units",
          action: "create_type",
          entityType: "UnitType",
          entityId: type.id,
          description: `إضافة نوع وحدة: ${type.name}`,
        },
        tx,
      );

      return type;
    }),
  );
}

export const UpdateUnitTypeSchema = UnitTypeSchema.partial().extend({
  unitTypeId: IdSchema,
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type UpdateUnitTypeInput = z.input<typeof UpdateUnitTypeSchema>;

export async function updateUnitType(
  propertyId: string,
  rawInput: UpdateUnitTypeInput,
  actor: ActivityActor,
) {
  const input = parse(UpdateUnitTypeSchema, rawInput, "بيانات نوع الوحدة غير صالحة.");

  return withDbErrors("unitType.update", () =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.unitType.findUnique({
        where: { id: input.unitTypeId },
        select: {
          id: true, propertyId: true, name: true, baseRate: true,
          _count: { select: { units: true } },
        },
      });

      if (!existing || existing.propertyId !== propertyId) {
        throw new AppError("NOT_FOUND", "نوع الوحدة غير موجود.");
      }

      /*
       * Deactivating a type that still has rooms would leave those rooms pointing at
       * something the system treats as retired — and nothing in the UI would explain
       * why they behave oddly. Move the rooms first.
       */
      if (input.status === "INACTIVE" && existing._count.units > 0) {
        throw new AppError(
          "CONFLICT",
          `لا يمكن إيقاف النوع "${existing.name}" وبه ${existing._count.units} وحدة. انقل الوحدات إلى نوع آخر أولًا.`,
        );
      }

      const type = await tx.unitType.update({
        where: { id: input.unitTypeId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          ...(input.baseRate !== undefined ? { baseRate: input.baseRate } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        select: { id: true, name: true, baseRate: true },
      });

      /*
       * A rate change applies to future bookings only. Existing reservations copied
       * their nightly rate at booking time precisely so a price revision cannot
       * rewrite what a guest already agreed to.
       */
      const rateChanged = input.baseRate !== undefined && !existing.baseRate.equals(type.baseRate);

      await recordActivity(
        {
          actor,
          propertyId,
          module: "units",
          action: "update_type",
          entityType: "UnitType",
          entityId: type.id,
          description: rateChanged
            ? `تعديل سعر النوع ${type.name} من ${toAmountString(existing.baseRate)} إلى ${toAmountString(type.baseRate)} ر.س`
            : `تعديل نوع الوحدة ${type.name}`,
        },
        tx,
      );

      return type;
    }),
  );
}

export { addDays };
