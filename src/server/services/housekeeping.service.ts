import "server-only";

import { z } from "zod";

import {
  HousekeepingSource,
  HousekeepingStatus,
  HousekeepingTaskStatus,
  HousekeepingTaskType,
  TaskPriority,
} from "@/generated/prisma/enums";
import type { Db } from "@/lib/db";
import { prisma } from "@/lib/db";
import { getBusinessDate } from "@/server/business-date";
import { READY_HOUSEKEEPING_STATUSES } from "@/server/checkin-rules";
import { AppError, withDbErrors } from "@/server/errors";
import {
  ACTIVE_TASK_STATUSES,
  canAssignTask,
  canCancelTask,
  canCompleteTask,
  canCreateTaskFor,
  canInspectUnit,
  canReopenCleaning,
  canStartTask,
  housekeepingStatusAfterCompletion,
  housekeepingStatusAfterStart,
} from "@/server/housekeeping-rules";
import { IdSchema, fieldErrors, toSkipTake } from "@/server/validation";

import { recordActivity, type ActivityActor } from "./activity.service";
import { syncUnitStatus } from "./unit.service";

/**
 * Housekeeping.
 *
 * The module that decides whether a room is physically fit for a guest — and nothing
 * else. It never decides whether a room can be sold: that follows from blocks, faults
 * and bookings, and this module reaches it by calling the same derivation everything
 * else calls rather than by writing `unit.status` itself.
 *
 * ## Lock order
 *
 * Two tables are involved, and they are always taken in this order:
 *
 *     unit → housekeeping task
 *
 * It composes with the booking engine's order (unit types → units) without a cycle,
 * because no path anywhere locks a housekeeping task before a unit. A room is the
 * thing several people compete for; the task is an attribute of it.
 *
 * As in Stage 9, the lock is the transaction's **first statement**. MySQL fixes a
 * transaction's snapshot at its first read, so an ordinary lookup taken before the
 * lock would freeze the world as it was before a competing transaction committed —
 * and twenty attendants pressing "start" would each read PENDING and each believe
 * they were first. Anything the transaction needs in order to know *what* to lock is
 * therefore read outside it, and treated as a hint that is re-verified afterwards.
 *
 * ## Idempotency
 *
 * No key, no second framework. Every transition here is one-way and the lock
 * serialises it: a repeated start finds the task already in progress and returns it
 * unchanged, preserving the original `startedAt` and writing no second audit entry.
 * The same holds for completion, cancellation and inspection.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const TASK_SELECT = {
  id: true,
  propertyId: true,
  unitId: true,
  taskType: true,
  status: true,
  priority: true,
  notes: true,
  source: true,
  sourceReservationId: true,
  assignedEmployeeId: true,
  assignedAt: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  unit: {
    select: {
      id: true,
      unitNumber: true,
      floor: true,
      status: true,
      housekeepingStatus: true,
      maintenanceStatus: true,
      unitType: { select: { id: true, name: true } },
    },
  },
  assignee: { select: { id: true, name: true } },
} as const;

export type HousekeepingTaskRow = {
  id: string;
  unitId: string;
  unitNumber: string;
  floor: number | null;
  unitTypeId: string;
  unitTypeName: string;
  unitStatus: string;
  housekeepingStatus: string;
  taskType: string;
  status: string;
  priority: string;
  source: string;
  notes: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Minutes since the task was raised — the number a supervisor actually scans for. */
  ageMinutes: number;
  /** True while somebody still owes work on it. */
  active: boolean;
};

function toRow(task: {
  id: string;
  unitId: string;
  taskType: string;
  status: string;
  priority: string;
  source: string;
  notes: string | null;
  assignedEmployeeId: string | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  unit: {
    unitNumber: string;
    floor: number | null;
    status: string;
    housekeepingStatus: string;
    unitType: { id: string; name: string };
  };
  assignee: { id: string; name: string } | null;
}): HousekeepingTaskRow {
  return {
    id: task.id,
    unitId: task.unitId,
    unitNumber: task.unit.unitNumber,
    floor: task.unit.floor,
    unitTypeId: task.unit.unitType.id,
    unitTypeName: task.unit.unitType.name,
    unitStatus: task.unit.status,
    housekeepingStatus: task.unit.housekeepingStatus,
    taskType: task.taskType,
    status: task.status,
    priority: task.priority,
    source: task.source,
    notes: task.notes,
    assigneeId: task.assignee?.id ?? null,
    assigneeName: task.assignee?.name ?? null,
    assignedAt: task.assignedAt?.toISOString() ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    ageMinutes: Math.max(0, Math.round((Date.now() - task.createdAt.getTime()) / 60_000)),
    active: (ACTIVE_TASK_STATUSES as string[]).includes(task.status),
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type HousekeepingSummary = {
  /** Rooms, by physical readiness. */
  dirty: number;
  cleaning: number;
  clean: number;
  inspected: number;
  /**
   * Rooms that are physically clean — the Stage 9 readiness set, CLEAN plus INSPECTED.
   *
   * Deliberately *not* "rooms you can sell tonight". An occupied room is clean; so is
   * a blocked one and one with an open fault. Housekeeping counts readiness, and
   * availability is decided by bookings, blocks and faults elsewhere. Naming this
   * `ready` and putting it under "جاهزة لاستقبال نزيل" was the Stage 8 mistake in a
   * new costume: one number, two meanings, and a manager who trusts neither.
   */
  cleanRooms: number;
  /** Tasks, by where the work has got to. */
  pending: number;
  assigned: number;
  inProgress: number;
  urgent: number;
  unassigned: number;
  completedToday: number;
  totalUnits: number;
};

/**
 * The counts a supervisor opens the screen for.
 *
 * Rooms and tasks are counted separately and named separately, because they answer
 * different questions: "how many rooms still need attention" is not "how many pieces
 * of work are open", and a screen that blurs the two produces the kind of two-numbers-
 * one-name confusion Stage 8 spent itself fixing.
 */
export async function getHousekeepingSummary(
  propertyIds: string[],
): Promise<HousekeepingSummary> {
  return withDbErrors("housekeeping.summary", async () => {
    const today = await getBusinessDate();
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const scope = { propertyId: { in: propertyIds } };

    const [byHousekeeping, byTaskStatus, urgent, unassigned, completedToday, totalUnits] =
      await Promise.all([
        prisma.unit.groupBy({
          by: ["housekeepingStatus"],
          where: scope,
          _count: { _all: true },
        }),
        prisma.housekeepingTask.groupBy({
          by: ["status"],
          where: { ...scope, status: { in: ACTIVE_TASK_STATUSES } },
          _count: { _all: true },
        }),
        prisma.housekeepingTask.count({
          where: {
            ...scope,
            status: { in: ACTIVE_TASK_STATUSES },
            priority: { in: [TaskPriority.HIGH, TaskPriority.URGENT] },
          },
        }),
        prisma.housekeepingTask.count({
          where: { ...scope, status: { in: ACTIVE_TASK_STATUSES }, assignedEmployeeId: null },
        }),
        prisma.housekeepingTask.count({
          where: {
            ...scope,
            status: HousekeepingTaskStatus.COMPLETED,
            completedAt: { gte: today, lt: tomorrow },
          },
        }),
        prisma.unit.count({ where: scope }),
      ]);

    const rooms = (status: HousekeepingStatus) =>
      byHousekeeping.find((row) => row.housekeepingStatus === status)?._count._all ?? 0;
    const tasks = (status: HousekeepingTaskStatus) =>
      byTaskStatus.find((row) => row.status === status)?._count._all ?? 0;

    const clean = rooms(HousekeepingStatus.CLEAN);
    const inspected = rooms(HousekeepingStatus.INSPECTED);

    return {
      dirty: rooms(HousekeepingStatus.DIRTY),
      cleaning: rooms(HousekeepingStatus.CLEANING),
      clean,
      inspected,
      // One definition of physically ready, shared with check-in rather than
      // re-derived here.
      cleanRooms: READY_HOUSEKEEPING_STATUSES.reduce(
        (sum, status) => sum + rooms(status),
        0,
      ),
      pending: tasks(HousekeepingTaskStatus.PENDING),
      assigned: tasks(HousekeepingTaskStatus.ASSIGNED),
      inProgress: tasks(HousekeepingTaskStatus.IN_PROGRESS),
      urgent,
      unassigned,
      completedToday,
      totalUnits,
    };
  });
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export const HousekeepingFilterSchema = z.object({
  q: z.string().trim().max(40).optional(),
  housekeepingStatus: z.nativeEnum(HousekeepingStatus).optional(),
  status: z.nativeEnum(HousekeepingTaskStatus).optional(),
  taskType: z.nativeEnum(HousekeepingTaskType).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  floor: z.coerce.number().int().optional(),
  unitTypeId: IdSchema.optional(),
  employeeId: IdSchema.optional(),
  unassigned: z.coerce.boolean().optional(),
  urgent: z.coerce.boolean().optional(),
  /** Open work only. The default view: a supervisor is not here for last week. */
  activeOnly: z.coerce.boolean().optional().default(true),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type HousekeepingFilters = z.infer<typeof HousekeepingFilterSchema>;

/**
 * The task list.
 *
 * Two queries per page regardless of page size — a count and a page — with the unit,
 * its type and the assignee joined in the same statement rather than fetched per row.
 *
 * Ordered the way the floor is worked: the most urgent first, then the oldest, so a
 * room that has been waiting since this morning does not sit under one raised a minute
 * ago.
 */
export async function listHousekeepingTasks(
  propertyIds: string[],
  rawFilters: unknown,
): Promise<{ rows: HousekeepingTaskRow[]; total: number; page: number; pageSize: number }> {
  const parsed = HousekeepingFilterSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "معايير البحث غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const filters = parsed.data;

  return withDbErrors("housekeeping.list", async () => {
    const conditions: Array<Record<string, unknown>> = [
      { propertyId: { in: propertyIds } },
    ];

    if (filters.status) conditions.push({ status: filters.status });
    else if (filters.activeOnly) conditions.push({ status: { in: ACTIVE_TASK_STATUSES } });

    if (filters.taskType) conditions.push({ taskType: filters.taskType });
    if (filters.priority) conditions.push({ priority: filters.priority });
    if (filters.employeeId) conditions.push({ assignedEmployeeId: filters.employeeId });
    if (filters.unassigned) conditions.push({ assignedEmployeeId: null });
    if (filters.urgent) {
      conditions.push({ priority: { in: [TaskPriority.HIGH, TaskPriority.URGENT] } });
    }

    const unitWhere: Record<string, unknown> = {};
    if (filters.floor !== undefined) unitWhere.floor = filters.floor;
    if (filters.unitTypeId) unitWhere.unitTypeId = filters.unitTypeId;
    if (filters.housekeepingStatus) unitWhere.housekeepingStatus = filters.housekeepingStatus;
    // A room number typed at speed — a prefix, not a wildcard scan.
    if (filters.q) unitWhere.unitNumber = { startsWith: filters.q };
    if (Object.keys(unitWhere).length > 0) conditions.push({ unit: unitWhere });

    const where = { AND: conditions };
    const { skip, take } = toSkipTake({ page: filters.page, pageSize: filters.pageSize });

    const [tasks, total] = await Promise.all([
      prisma.housekeepingTask.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        skip,
        take,
        select: TASK_SELECT,
      }),
      prisma.housekeepingTask.count({ where }),
    ]);

    return {
      rows: tasks.map(toRow),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  });
}

/**
 * Rooms that need attention but have no open task.
 *
 * The gap the task list cannot show: a room left DIRTY with nobody assigned and no work
 * item raised is invisible on a board built only from tasks, and it is exactly the room
 * that will be discovered at check-in time by a guest standing at the desk.
 */
export type UnattendedRoom = {
  unitId: string;
  unitNumber: string;
  floor: number | null;
  unitTypeName: string;
  housekeepingStatus: string;
  unitStatus: string;
  occupied: boolean;
};

export async function listUnattendedRooms(
  propertyIds: string[],
): Promise<UnattendedRoom[]> {
  return withDbErrors("housekeeping.unattended", async () => {
    const units = await prisma.unit.findMany({
      where: {
        propertyId: { in: propertyIds },
        housekeepingStatus: {
          in: [HousekeepingStatus.DIRTY, HousekeepingStatus.CLEANING],
        },
        housekeepingTasks: { none: { status: { in: ACTIVE_TASK_STATUSES } } },
      },
      orderBy: [{ floor: "asc" }, { unitNumber: "asc" }],
      select: {
        id: true,
        unitNumber: true,
        floor: true,
        status: true,
        housekeepingStatus: true,
        unitType: { select: { name: true } },
      },
    });

    return units.map((unit) => ({
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      floor: unit.floor,
      unitTypeName: unit.unitType.name,
      housekeepingStatus: unit.housekeepingStatus,
      unitStatus: unit.status,
      occupied: unit.status === "OCCUPIED",
    }));
  });
}

export type HousekeepingTaskDetail = HousekeepingTaskRow & {
  propertyId: string;
  sourceReservation: { id: string; reservationNumber: string } | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdByName: string | null;
  assignedByName: string | null;
  startedByName: string | null;
  completedByName: string | null;
  cancelledByName: string | null;
  unitInspectedAt: string | null;
  unitInspectedByName: string | null;
  activity: Array<{
    id: string;
    action: string;
    description: string;
    userName: string;
    createdAt: string;
  }>;
};

export async function getHousekeepingTask(
  taskId: string,
  propertyIds: string[],
): Promise<HousekeepingTaskDetail> {
  const parsed = IdSchema.safeParse(taskId);
  if (!parsed.success) throw new AppError("NOT_FOUND", "مهمة النظافة غير موجودة.");

  return withDbErrors("housekeeping.detail", async () => {
    const task = await prisma.housekeepingTask.findUnique({
      where: { id: parsed.data },
      select: {
        ...TASK_SELECT,
        createdBy: { select: { name: true } },
        assignedBy: { select: { name: true } },
        startedBy: { select: { name: true } },
        completedBy: { select: { name: true } },
        cancelledBy: { select: { name: true } },
        sourceReservation: { select: { id: true, reservationNumber: true } },
        unit: {
          select: {
            ...TASK_SELECT.unit.select,
            inspectedAt: true,
            inspectedBy: { select: { name: true } },
          },
        },
      },
    });

    if (!task || !propertyIds.includes(task.propertyId)) {
      // Missing, not forbidden: "you may not see this" still confirms it exists.
      throw new AppError("NOT_FOUND", "مهمة النظافة غير موجودة.");
    }

    const activity = await prisma.activityLog.findMany({
      where: { entityType: "HousekeepingTask", entityId: task.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, description: true, userName: true, createdAt: true },
    });

    return {
      ...toRow(task),
      propertyId: task.propertyId,
      sourceReservation: task.sourceReservation,
      cancellationReason: task.cancellationReason,
      cancelledAt: task.cancelledAt?.toISOString() ?? null,
      createdByName: task.createdBy?.name ?? null,
      assignedByName: task.assignedBy?.name ?? null,
      startedByName: task.startedBy?.name ?? null,
      completedByName: task.completedBy?.name ?? null,
      cancelledByName: task.cancelledBy?.name ?? null,
      unitInspectedAt: task.unit.inspectedAt?.toISOString() ?? null,
      unitInspectedByName: task.unit.inspectedBy?.name ?? null,
      activity: activity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        description: entry.description,
        userName: entry.userName,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  });
}

/**
 * The work one attendant owes.
 *
 * Filtered by the employee record attached to the signed-in user, never by their role.
 * A supervisor who also cleans rooms sees their own list here; a user with no employee
 * record sees an empty one, which is the honest answer rather than everybody's work.
 */
export async function getMyHousekeepingTasks(
  employeeId: string | null,
  propertyIds: string[],
): Promise<HousekeepingTaskRow[]> {
  if (!employeeId) return [];

  return withDbErrors("housekeeping.mine", async () => {
    const tasks = await prisma.housekeepingTask.findMany({
      where: {
        propertyId: { in: propertyIds },
        assignedEmployeeId: employeeId,
        status: { in: ACTIVE_TASK_STATUSES },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      select: TASK_SELECT,
    });

    return tasks.map(toRow);
  });
}

/** Housekeeping staff a task may be assigned to. */
export async function listHousekeepingEmployees(propertyIds: string[]) {
  return withDbErrors("housekeeping.employees", async () => {
    const employees = await prisma.employee.findMany({
      where: {
        propertyId: { in: propertyIds },
        department: "HOUSEKEEPING",
        employmentStatus: "ACTIVE",
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, position: true },
    });

    const workload = await prisma.housekeepingTask.groupBy({
      by: ["assignedEmployeeId"],
      where: {
        propertyId: { in: propertyIds },
        status: { in: ACTIVE_TASK_STATUSES },
        assignedEmployeeId: { in: employees.map((employee) => employee.id) },
      },
      _count: { _all: true },
    });

    const openBy = new Map(
      workload.map((row) => [row.assignedEmployeeId, row._count._all]),
    );

    return employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      position: employee.position,
      openTasks: openBy.get(employee.id) ?? 0,
    }));
  });
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

/**
 * Takes the locks a housekeeping write needs, in the one order every path uses.
 *
 * **Unit first, then task. Always.**
 *
 * The unit is what several people compete for — two attendants on the same room, a
 * supervisor reassigning while somebody starts. The task is an attribute of it. Nothing
 * anywhere locks a task before a unit, so this order composes with the booking engine's
 * (unit types → units) without ever closing a cycle.
 */
async function lockUnitAndTask(tx: Db, unitId: string, taskId?: string | null) {
  const unit = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    "SELECT `id` FROM `units` WHERE `id` = ? FOR UPDATE",
    unitId,
  );
  if (unit.length === 0) throw new AppError("NOT_FOUND", "الوحدة غير موجودة.");

  if (taskId) {
    const task = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT `id` FROM `housekeeping_tasks` WHERE `id` = ? FOR UPDATE",
      taskId,
    );
    if (task.length === 0) throw new AppError("NOT_FOUND", "مهمة النظافة غير موجودة.");
  }
}

/**
 * Resolves a task to the rows a transaction will need to lock.
 *
 * Read outside the transaction on purpose — see the module header. Its answer is a
 * hint about *what* to lock, never a fact anything is decided on: everything below
 * re-reads under the lock.
 */
async function scopeTask(taskId: string, propertyIds?: string[]) {
  const parsed = IdSchema.safeParse(taskId);
  if (!parsed.success) throw new AppError("NOT_FOUND", "مهمة النظافة غير موجودة.");

  const task = await prisma.housekeepingTask.findUnique({
    where: { id: parsed.data },
    select: { id: true, propertyId: true, unitId: true },
  });

  if (!task || (propertyIds && !propertyIds.includes(task.propertyId))) {
    throw new AppError("NOT_FOUND", "مهمة النظافة غير موجودة.");
  }

  return task;
}

/** The task as it actually stands, plus the room it is about. */
async function readTaskUnderLock(tx: Db, taskId: string) {
  const task = await tx.housekeepingTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      propertyId: true,
      unitId: true,
      taskType: true,
      status: true,
      assignedEmployeeId: true,
      startedAt: true,
      completedAt: true,
      unit: {
        select: {
          id: true,
          unitNumber: true,
          status: true,
          housekeepingStatus: true,
        },
      },
    },
  });

  if (!task) throw new AppError("NOT_FOUND", "مهمة النظافة غير موجودة.");
  return task;
}

/** Is a guest in this room right now? The one fact the occupied-room policy needs. */
async function isOccupied(tx: Db, unitId: string): Promise<boolean> {
  const count = await tx.reservation.count({
    where: { unitId, status: "CHECKED_IN" },
  });
  return count > 0;
}

export type HousekeepingResult = {
  taskId: string;
  unitId: string;
  unitNumber: string;
  status: string;
  housekeepingStatus: string;
  unitStatus: string;
  /** True when this call found the work already done and changed nothing. */
  replayed: boolean;
};

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export const CreateHousekeepingTaskSchema = z.object({
  unitId: IdSchema,
  taskType: z.nativeEnum(HousekeepingTaskType).default(HousekeepingTaskType.CHECKOUT_CLEANING),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.NORMAL),
  assignedEmployeeId: IdSchema.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type CreateHousekeepingTaskInput = z.input<typeof CreateHousekeepingTaskSchema>;

/**
 * Raises a cleaning task by hand.
 *
 * Refuses a second open task for a room that already has one. Two attendants sent to
 * the same room is wasted labour; worse, it makes the board lie about how much work is
 * outstanding, which is the number the supervisor is staffing against.
 */
export async function createHousekeepingTask(
  rawInput: CreateHousekeepingTaskInput,
  actor: ActivityActor,
  propertyIds: string[],
): Promise<HousekeepingResult> {
  const parsed = CreateHousekeepingTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات المهمة غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;
  const businessDay = await getBusinessDate();

  const unit = await prisma.unit.findUnique({
    where: { id: input.unitId },
    select: { id: true, propertyId: true },
  });
  if (!unit || !propertyIds.includes(unit.propertyId)) {
    throw new AppError("NOT_FOUND", "الوحدة غير موجودة.");
  }

  return withDbErrors("housekeeping.create", () =>
    prisma.$transaction(async (tx) => {
      await lockUnitAndTask(tx, unit.id);

      const locked = await tx.unit.findUniqueOrThrow({
        where: { id: unit.id },
        select: {
          id: true,
          propertyId: true,
          unitNumber: true,
          status: true,
          housekeepingStatus: true,
        },
      });

      const occupied = await isOccupied(tx, locked.id);
      const verdict = canCreateTaskFor(input.taskType, {
        housekeepingStatus: locked.housekeepingStatus,
        occupied,
      });
      if (!verdict.allowed) {
        throw new AppError("CONFLICT", verdict.reason ?? "لا يمكن إنشاء مهمة لهذه الوحدة.");
      }

      const open = await tx.housekeepingTask.findFirst({
        where: { unitId: locked.id, status: { in: ACTIVE_TASK_STATUSES } },
        select: { id: true },
      });
      if (open) {
        throw new AppError(
          "CONFLICT",
          `الوحدة ${locked.unitNumber} لديها مهمة تنظيف مفتوحة بالفعل. تابع المهمة القائمة بدل إنشاء مهمة ثانية.`,
          { fields: { unitId: "توجد مهمة مفتوحة لهذه الوحدة" } },
        );
      }

      const employeeId = await resolveEmployee(tx, input.assignedEmployeeId, locked.propertyId);

      const created = await tx.housekeepingTask.create({
        data: {
          propertyId: locked.propertyId,
          unitId: locked.id,
          taskType: input.taskType,
          priority: input.priority,
          notes: input.notes ?? null,
          source: HousekeepingSource.MANUAL,
          assignedEmployeeId: employeeId,
          status: employeeId
            ? HousekeepingTaskStatus.ASSIGNED
            : HousekeepingTaskStatus.PENDING,
          assignedAt: employeeId ? new Date() : null,
          assignedById: employeeId ? actor.id : null,
          createdById: actor.id,
        },
        select: { id: true, status: true },
      });

      const unitStatus = await syncUnitStatus(tx, locked.id, businessDay);

      await recordActivity(
        {
          actor,
          propertyId: locked.propertyId,
          module: "housekeeping",
          action: "task_created",
          entityType: "HousekeepingTask",
          entityId: created.id,
          description: `إنشاء مهمة نظافة للوحدة ${locked.unitNumber}`,
          metadata: {
            unitId: locked.id,
            unitNumber: locked.unitNumber,
            taskType: input.taskType,
            priority: input.priority,
            assignedEmployeeId: employeeId,
          },
        },
        tx,
      );

      return {
        taskId: created.id,
        unitId: locked.id,
        unitNumber: locked.unitNumber,
        status: created.status,
        housekeepingStatus: locked.housekeepingStatus,
        unitStatus,
        replayed: false,
      } satisfies HousekeepingResult;
    }),
  );
}

/** An employee id from a browser is a claim; this turns it into a fact or refuses. */
async function resolveEmployee(
  tx: Db,
  employeeId: string | null | undefined,
  propertyId: string,
): Promise<string | null> {
  if (!employeeId) return null;

  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, propertyId: true, department: true, employmentStatus: true },
  });

  if (!employee || employee.propertyId !== propertyId) {
    throw new AppError("VALIDATION", "الموظف المحدد لا يتبع هذه المنشأة.", {
      fields: { assignedEmployeeId: "اختر موظفًا من هذه المنشأة" },
    });
  }
  if (employee.employmentStatus !== "ACTIVE") {
    throw new AppError("VALIDATION", "لا يمكن إسناد مهمة إلى موظف غير نشط.", {
      fields: { assignedEmployeeId: "الموظف غير نشط" },
    });
  }
  if (employee.department !== "HOUSEKEEPING") {
    throw new AppError("VALIDATION", "المهمة تُسند إلى موظفي قسم النظافة فقط.", {
      fields: { assignedEmployeeId: "الموظف ليس من قسم النظافة" },
    });
  }

  return employee.id;
}

/**
 * The one place a turnover clean is created automatically.
 *
 * Checkout calls this rather than writing its own insert, so the dedup rule, the
 * origin reference and the priority live in one place. A second automatic pathway is
 * how a hotel ends up with two tasks for one room and no idea which is real.
 *
 * Runs inside the caller's transaction: the departure and the cleaning it causes are
 * one event, and a checkout that committed without its task would leave a dirty room
 * nobody was told about.
 */
export async function queueTurnoverClean(
  tx: Db,
  input: {
    propertyId: string;
    unitId: string;
    reservationId: string;
    reservationNumber: string;
    actor: ActivityActor;
  },
): Promise<string | null> {
  const open = await tx.housekeepingTask.findFirst({
    where: { unitId: input.unitId, status: { in: ACTIVE_TASK_STATUSES } },
    select: { id: true },
  });
  if (open) return null;

  const created = await tx.housekeepingTask.create({
    data: {
      propertyId: input.propertyId,
      unitId: input.unitId,
      taskType: HousekeepingTaskType.CHECKOUT_CLEANING,
      status: HousekeepingTaskStatus.PENDING,
      priority: TaskPriority.HIGH,
      source: HousekeepingSource.CHECKOUT,
      sourceReservationId: input.reservationId,
      notes: `تنظيف بعد مغادرة الحجز ${input.reservationNumber}`,
      createdById: input.actor.id,
    },
    select: { id: true },
  });

  return created.id;
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export const AssignHousekeepingTaskSchema = z.object({
  taskId: IdSchema,
  /** Null clears the assignment and returns the task to the unassigned pool. */
  employeeId: IdSchema.nullable(),
});

export async function assignHousekeepingTask(
  rawInput: z.input<typeof AssignHousekeepingTaskSchema>,
  actor: ActivityActor,
  propertyIds: string[],
): Promise<HousekeepingResult> {
  const parsed = AssignHousekeepingTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات الإسناد غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;
  const businessDay = await getBusinessDate();
  const scoped = await scopeTask(input.taskId, propertyIds);

  return withDbErrors("housekeeping.assign", () =>
    prisma.$transaction(async (tx) => {
      await lockUnitAndTask(tx, scoped.unitId, scoped.id);

      const task = await readTaskUnderLock(tx, scoped.id);
      const verdict = canAssignTask(task.status);
      if (!verdict.allowed) {
        throw new AppError("CONFLICT", verdict.reason ?? "لا يمكن إسناد هذه المهمة.");
      }

      const previous = task.assignedEmployeeId;
      const employeeId = await resolveEmployee(tx, input.employeeId, task.propertyId);

      // Assigning the same person again changes nothing and says nothing new.
      if (previous === employeeId) {
        return {
          taskId: task.id,
          unitId: task.unitId,
          unitNumber: task.unit.unitNumber,
          status: task.status,
          housekeepingStatus: task.unit.housekeepingStatus,
          unitStatus: task.unit.status,
          replayed: true,
        } satisfies HousekeepingResult;
      }

      /*
       * Assignment moves PENDING to ASSIGNED, and clearing it moves back — but never
       * touches IN_PROGRESS. Work already under way stays under way whoever it is
       * handed to; rewinding the status would erase the fact that somebody started.
       */
      const nextStatus =
        task.status === HousekeepingTaskStatus.IN_PROGRESS
          ? task.status
          : employeeId
            ? HousekeepingTaskStatus.ASSIGNED
            : HousekeepingTaskStatus.PENDING;

      await tx.housekeepingTask.update({
        where: { id: task.id },
        data: {
          assignedEmployeeId: employeeId,
          status: nextStatus,
          assignedAt: employeeId ? new Date() : null,
          assignedById: employeeId ? actor.id : null,
        },
      });

      const unitStatus = await syncUnitStatus(tx, task.unitId, businessDay);

      const employeeName = employeeId
        ? (
            await tx.employee.findUnique({
              where: { id: employeeId },
              select: { name: true },
            })
          )?.name ?? null
        : null;

      await recordActivity(
        {
          actor,
          propertyId: task.propertyId,
          module: "housekeeping",
          action: previous ? "task_reassigned" : "task_assigned",
          entityType: "HousekeepingTask",
          entityId: task.id,
          description: employeeId
            ? `إسناد تنظيف الوحدة ${task.unit.unitNumber} إلى ${employeeName}`
            : `إلغاء إسناد تنظيف الوحدة ${task.unit.unitNumber}`,
          metadata: {
            unitId: task.unitId,
            unitNumber: task.unit.unitNumber,
            employeeId,
            previousEmployeeId: previous,
          },
        },
        tx,
      );

      return {
        taskId: task.id,
        unitId: task.unitId,
        unitNumber: task.unit.unitNumber,
        status: nextStatus,
        housekeepingStatus: task.unit.housekeepingStatus,
        unitStatus,
        replayed: false,
      } satisfies HousekeepingResult;
    }),
  );
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export async function startHousekeepingTask(
  taskId: string,
  actor: ActivityActor,
  propertyIds: string[],
): Promise<HousekeepingResult> {
  const businessDay = await getBusinessDate();
  const scoped = await scopeTask(taskId, propertyIds);

  return withDbErrors("housekeeping.start", () =>
    prisma.$transaction(async (tx) => {
      await lockUnitAndTask(tx, scoped.unitId, scoped.id);

      const task = await readTaskUnderLock(tx, scoped.id);

      // Already under way: a replay, not a failure. Nothing is written, and the
      // original start time — the one that says how long the room has taken — stands.
      if (task.status === HousekeepingTaskStatus.IN_PROGRESS) {
        return {
          taskId: task.id,
          unitId: task.unitId,
          unitNumber: task.unit.unitNumber,
          status: task.status,
          housekeepingStatus: task.unit.housekeepingStatus,
          unitStatus: task.unit.status,
          replayed: true,
        } satisfies HousekeepingResult;
      }

      const verdict = canStartTask(task.status);
      if (!verdict.allowed) {
        throw new AppError("CONFLICT", verdict.reason ?? "لا يمكن بدء هذه المهمة.");
      }

      const occupied = await isOccupied(tx, task.unitId);
      const nextHousekeeping = housekeepingStatusAfterStart(task.taskType, {
        housekeepingStatus: task.unit.housekeepingStatus,
        occupied,
      });

      await tx.housekeepingTask.update({
        where: { id: task.id },
        data: {
          status: HousekeepingTaskStatus.IN_PROGRESS,
          startedAt: new Date(),
          startedById: actor.id,
        },
      });

      if (nextHousekeeping) {
        await tx.unit.update({
          where: { id: task.unitId },
          data: { housekeepingStatus: nextHousekeeping },
        });
      }

      const unitStatus = await syncUnitStatus(tx, task.unitId, businessDay);

      await recordActivity(
        {
          actor,
          propertyId: task.propertyId,
          module: "housekeeping",
          action: "task_started",
          entityType: "HousekeepingTask",
          entityId: task.id,
          description: `بدء تنظيف الوحدة ${task.unit.unitNumber}`,
          metadata: { unitId: task.unitId, unitNumber: task.unit.unitNumber },
        },
        tx,
      );

      return {
        taskId: task.id,
        unitId: task.unitId,
        unitNumber: task.unit.unitNumber,
        status: HousekeepingTaskStatus.IN_PROGRESS,
        housekeepingStatus: nextHousekeeping ?? task.unit.housekeepingStatus,
        unitStatus,
        replayed: false,
      } satisfies HousekeepingResult;
    }),
  );
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

export const CompleteHousekeepingTaskSchema = z.object({
  taskId: IdSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});

/**
 * Finishes the work and lets the room's operational status follow from it.
 *
 * The important line is the one that is *not* here: nothing sets `unit.status`
 * directly. A cleaned room that is blocked stays blocked, a cleaned room that is out
 * of service stays out of service, and a cleaned room a guest is still in stays
 * occupied — because availability is derived from those records, and cleaning is not
 * one of them.
 */
export async function completeHousekeepingTask(
  rawInput: z.input<typeof CompleteHousekeepingTaskSchema>,
  actor: ActivityActor,
  propertyIds: string[],
): Promise<HousekeepingResult> {
  const parsed = CompleteHousekeepingTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات إنهاء المهمة غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;
  const businessDay = await getBusinessDate();
  const scoped = await scopeTask(input.taskId, propertyIds);

  return withDbErrors("housekeeping.complete", () =>
    prisma.$transaction(async (tx) => {
      await lockUnitAndTask(tx, scoped.unitId, scoped.id);

      const task = await readTaskUnderLock(tx, scoped.id);

      if (task.status === HousekeepingTaskStatus.COMPLETED) {
        // A replay. The room is already where this call would put it, and the original
        // completion time is the one that belongs in the record.
        return {
          taskId: task.id,
          unitId: task.unitId,
          unitNumber: task.unit.unitNumber,
          status: task.status,
          housekeepingStatus: task.unit.housekeepingStatus,
          unitStatus: task.unit.status,
          replayed: true,
        } satisfies HousekeepingResult;
      }

      const verdict = canCompleteTask(task.status);
      if (!verdict.allowed) {
        throw new AppError("CONFLICT", verdict.reason ?? "لا يمكن إنهاء هذه المهمة.");
      }

      const occupied = await isOccupied(tx, task.unitId);
      const nextHousekeeping = housekeepingStatusAfterCompletion(task.taskType, {
        housekeepingStatus: task.unit.housekeepingStatus,
        occupied,
      });

      await tx.housekeepingTask.update({
        where: { id: task.id },
        data: {
          status: HousekeepingTaskStatus.COMPLETED,
          completedAt: new Date(),
          completedById: actor.id,
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });

      if (nextHousekeeping) {
        await tx.unit.update({
          where: { id: task.unitId },
          data: {
            housekeepingStatus: nextHousekeeping,
            // A fresh clean is not an inspection; the previous sign-off no longer
            // describes this room.
            inspectedAt: null,
            inspectedById: null,
          },
        });
      }

      const unitStatus = await syncUnitStatus(tx, task.unitId, businessDay);

      await recordActivity(
        {
          actor,
          propertyId: task.propertyId,
          module: "housekeeping",
          action: "task_completed",
          entityType: "HousekeepingTask",
          entityId: task.id,
          description: `إنهاء تنظيف الوحدة ${task.unit.unitNumber}`,
          metadata: {
            unitId: task.unitId,
            unitNumber: task.unit.unitNumber,
            housekeepingStatus: nextHousekeeping ?? task.unit.housekeepingStatus,
            unitStatus,
          },
        },
        tx,
      );

      return {
        taskId: task.id,
        unitId: task.unitId,
        unitNumber: task.unit.unitNumber,
        status: HousekeepingTaskStatus.COMPLETED,
        housekeepingStatus: nextHousekeeping ?? task.unit.housekeepingStatus,
        unitStatus,
        replayed: false,
      } satisfies HousekeepingResult;
    }),
  );
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export const CancelHousekeepingTaskSchema = z.object({
  taskId: IdSchema,
  reason: z
    .string()
    .trim()
    .min(3, "اكتب سببًا موجزًا")
    .max(255, "السبب أطول من الحد المسموح"),
});

/**
 * Withdraws a piece of work that will not be done.
 *
 * It never claims the room was cleaned. A cancelled turnover leaves the room exactly
 * as dirty as it was, which is the point: the board must keep showing it, because the
 * room still needs someone.
 */
export async function cancelHousekeepingTask(
  rawInput: z.input<typeof CancelHousekeepingTaskSchema>,
  actor: ActivityActor,
  propertyIds: string[],
): Promise<HousekeepingResult> {
  const parsed = CancelHousekeepingTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات الإلغاء غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;
  const businessDay = await getBusinessDate();
  const scoped = await scopeTask(input.taskId, propertyIds);

  return withDbErrors("housekeeping.cancel", () =>
    prisma.$transaction(async (tx) => {
      await lockUnitAndTask(tx, scoped.unitId, scoped.id);

      const task = await readTaskUnderLock(tx, scoped.id);

      if (task.status === HousekeepingTaskStatus.CANCELLED) {
        return {
          taskId: task.id,
          unitId: task.unitId,
          unitNumber: task.unit.unitNumber,
          status: task.status,
          housekeepingStatus: task.unit.housekeepingStatus,
          unitStatus: task.unit.status,
          replayed: true,
        } satisfies HousekeepingResult;
      }

      const verdict = canCancelTask(task.status);
      if (!verdict.allowed) {
        throw new AppError("CONFLICT", verdict.reason ?? "لا يمكن إلغاء هذه المهمة.");
      }

      await tx.housekeepingTask.update({
        where: { id: task.id },
        data: {
          status: HousekeepingTaskStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: actor.id,
          cancellationReason: input.reason,
        },
      });

      /*
       * A room that was mid-clean goes back to DIRTY. Leaving it CLEANING would show a
       * room being worked on by nobody — the single most misleading thing a
       * housekeeping board can say.
       */
      if (task.unit.housekeepingStatus === HousekeepingStatus.CLEANING) {
        await tx.unit.update({
          where: { id: task.unitId },
          data: { housekeepingStatus: HousekeepingStatus.DIRTY },
        });
      }

      const unitStatus = await syncUnitStatus(tx, task.unitId, businessDay);

      await recordActivity(
        {
          actor,
          propertyId: task.propertyId,
          module: "housekeeping",
          action: "task_cancelled",
          entityType: "HousekeepingTask",
          entityId: task.id,
          description: `إلغاء مهمة تنظيف الوحدة ${task.unit.unitNumber}`,
          metadata: {
            unitId: task.unitId,
            unitNumber: task.unit.unitNumber,
            reason: input.reason,
          },
        },
        tx,
      );

      const housekeepingStatus =
        task.unit.housekeepingStatus === HousekeepingStatus.CLEANING
          ? HousekeepingStatus.DIRTY
          : task.unit.housekeepingStatus;

      return {
        taskId: task.id,
        unitId: task.unitId,
        unitNumber: task.unit.unitNumber,
        status: HousekeepingTaskStatus.CANCELLED,
        housekeepingStatus,
        unitStatus,
        replayed: false,
      } satisfies HousekeepingResult;
    }),
  );
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

export type InspectionResult = {
  unitId: string;
  unitNumber: string;
  housekeepingStatus: string;
  unitStatus: string;
  /** Set when a reopen created new work. */
  taskId: string | null;
  replayed: boolean;
};

/**
 * A supervisor signing a room off.
 *
 * INSPECTED is a stronger claim than CLEAN — somebody checked — and it is recorded
 * with a name and a time, because "who said this room was ready" is the first question
 * asked when it turns out it was not. Both states are check-in ready, so signing off is
 * a quality gate a property may use or ignore, not a step that blocks arrivals.
 */
export async function inspectUnit(
  unitId: string,
  actor: ActivityActor,
  propertyIds: string[],
): Promise<InspectionResult> {
  const parsed = IdSchema.safeParse(unitId);
  if (!parsed.success) throw new AppError("NOT_FOUND", "الوحدة غير موجودة.");

  const businessDay = await getBusinessDate();
  const scoped = await prisma.unit.findUnique({
    where: { id: parsed.data },
    select: { id: true, propertyId: true },
  });
  if (!scoped || !propertyIds.includes(scoped.propertyId)) {
    throw new AppError("NOT_FOUND", "الوحدة غير موجودة.");
  }

  return withDbErrors("housekeeping.inspect", () =>
    prisma.$transaction(async (tx) => {
      await lockUnitAndTask(tx, scoped.id);

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: scoped.id },
        select: {
          id: true,
          propertyId: true,
          unitNumber: true,
          status: true,
          housekeepingStatus: true,
        },
      });

      if (unit.housekeepingStatus === HousekeepingStatus.INSPECTED) {
        return {
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          housekeepingStatus: unit.housekeepingStatus,
          unitStatus: unit.status,
          taskId: null,
          replayed: true,
        } satisfies InspectionResult;
      }

      const verdict = canInspectUnit(unit.housekeepingStatus);
      if (!verdict.allowed) {
        throw new AppError("CONFLICT", verdict.reason ?? "لا يمكن اعتماد هذه الوحدة.");
      }

      await tx.unit.update({
        where: { id: unit.id },
        data: {
          housekeepingStatus: HousekeepingStatus.INSPECTED,
          inspectedAt: new Date(),
          inspectedById: actor.id,
        },
      });

      const unitStatus = await syncUnitStatus(tx, unit.id, businessDay);

      await recordActivity(
        {
          actor,
          propertyId: unit.propertyId,
          module: "housekeeping",
          action: "unit_inspected",
          entityType: "Unit",
          entityId: unit.id,
          description: `اعتماد جاهزية الوحدة ${unit.unitNumber}`,
          metadata: { unitId: unit.id, unitNumber: unit.unitNumber },
        },
        tx,
      );

      return {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        housekeepingStatus: HousekeepingStatus.INSPECTED,
        unitStatus,
        taskId: null,
        replayed: false,
      } satisfies InspectionResult;
    }),
  );
}

export const ReopenCleaningSchema = z.object({
  unitId: IdSchema,
  reason: z
    .string()
    .trim()
    .min(3, "اكتب سببًا موجزًا")
    .max(255, "السبب أطول من الحد المسموح"),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.HIGH),
});

/**
 * A failed inspection: the room goes back into the cycle, with a reason.
 *
 * The reason is required and stored on the task, because "why is 305 dirty again" has
 * exactly one useful answer and it is not "somebody pressed a button". A new task is
 * raised at the same time, so the room does not sit dirty with nobody owning it —
 * unless one is already open, in which case that one is the work.
 */
export async function reopenCleaning(
  rawInput: z.input<typeof ReopenCleaningSchema>,
  actor: ActivityActor,
  propertyIds: string[],
): Promise<InspectionResult> {
  const parsed = ReopenCleaningSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات إعادة التنظيف غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;
  const businessDay = await getBusinessDate();

  const scoped = await prisma.unit.findUnique({
    where: { id: input.unitId },
    select: { id: true, propertyId: true },
  });
  if (!scoped || !propertyIds.includes(scoped.propertyId)) {
    throw new AppError("NOT_FOUND", "الوحدة غير موجودة.");
  }

  return withDbErrors("housekeeping.reopen", () =>
    prisma.$transaction(async (tx) => {
      await lockUnitAndTask(tx, scoped.id);

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: scoped.id },
        select: {
          id: true,
          propertyId: true,
          unitNumber: true,
          status: true,
          housekeepingStatus: true,
        },
      });

      const verdict = canReopenCleaning(unit.housekeepingStatus);
      if (!verdict.allowed) {
        throw new AppError("CONFLICT", verdict.reason ?? "لا يمكن إعادة فتح التنظيف.");
      }

      await tx.unit.update({
        where: { id: unit.id },
        data: {
          housekeepingStatus: HousekeepingStatus.DIRTY,
          inspectedAt: null,
          inspectedById: null,
        },
      });

      const open = await tx.housekeepingTask.findFirst({
        where: { unitId: unit.id, status: { in: ACTIVE_TASK_STATUSES } },
        select: { id: true },
      });

      const taskId =
        open?.id ??
        (
          await tx.housekeepingTask.create({
            data: {
              propertyId: unit.propertyId,
              unitId: unit.id,
              taskType: HousekeepingTaskType.CHECKOUT_CLEANING,
              status: HousekeepingTaskStatus.PENDING,
              priority: input.priority,
              source: HousekeepingSource.INSPECTION_FAILED,
              notes: `إعادة تنظيف بعد فحص: ${input.reason}`,
              createdById: actor.id,
            },
            select: { id: true },
          })
        ).id;

      const unitStatus = await syncUnitStatus(tx, unit.id, businessDay);

      await recordActivity(
        {
          actor,
          propertyId: unit.propertyId,
          module: "housekeeping",
          action: "cleaning_reopened",
          entityType: "Unit",
          entityId: unit.id,
          description: `إعادة الوحدة ${unit.unitNumber} إلى التنظيف`,
          metadata: {
            unitId: unit.id,
            unitNumber: unit.unitNumber,
            reason: input.reason,
            taskId,
            reusedOpenTask: Boolean(open),
          },
        },
        tx,
      );

      return {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        housekeepingStatus: HousekeepingStatus.DIRTY,
        unitStatus,
        taskId,
        replayed: false,
      } satisfies InspectionResult;
    }),
  );
}
