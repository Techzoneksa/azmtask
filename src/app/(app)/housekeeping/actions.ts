"use server";

import { revalidatePath } from "next/cache";

import { assertPermission } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { serializeError } from "@/server/errors";
import { HOUSEKEEPING_PERMISSIONS } from "@/server/housekeeping-rules";
import {
  assignHousekeepingTask,
  cancelHousekeepingTask,
  completeHousekeepingTask,
  createHousekeepingTask,
  inspectUnit,
  reopenCleaning,
  startHousekeepingTask,
  type HousekeepingResult,
  type InspectionResult,
} from "@/server/services/housekeeping.service";
import { getAccessiblePropertyIds } from "@/server/services/property.service";

/**
 * Write endpoints for housekeeping.
 *
 * The client sends which task and which room; it never sends who it is or which
 * property it may touch. Both are re-derived from the session on every call, so a
 * crafted request carries no more authority than the person making it already had.
 *
 * The permission split is the one the floor actually has: supervisors organise the
 * work, attendants perform it. `manage` covers creating, assigning, inspecting,
 * reopening and cancelling; `complete` covers starting and finishing. An attendant
 * therefore cannot hand their room to somebody else, and cannot sign off their own
 * work as inspected — enforced here, on the server, not by which buttons render.
 */

export type HousekeepingActionResult =
  | { ok: true; result: HousekeepingResult }
  | { ok: false; error: string; code: string; fields?: Record<string, string> };

export type InspectionActionResult =
  | { ok: true; result: InspectionResult }
  | { ok: false; error: string; code: string; fields?: Record<string, string> };

async function context(permission: Parameters<typeof assertPermission>[0]) {
  await assertPermission(permission);
  const session = await getSession();
  const propertyIds = await getAccessiblePropertyIds();

  if (!session || propertyIds.length === 0) {
    throw new Error("لا توجد جلسة أو منشأة نشطة.");
  }

  return {
    propertyIds,
    actor: { id: session.id, name: session.name, email: session.email, roles: session.roleKeys },
  };
}

/**
 * Every screen that shows where a room stands has just changed its answer.
 *
 * The check-in candidate list is in that set: a room becoming clean is exactly what
 * makes it appear there, and leaving it out is how a receptionist ends up told there
 * is no ready room while housekeeping has just finished one.
 */
function revalidateAfterRoomChange(unitId?: string | null) {
  revalidatePath("/housekeeping");
  revalidatePath("/dashboard");
  revalidatePath("/units");
  revalidatePath("/reservations");
  if (unitId) revalidatePath(`/units/${unitId}`);
}

export async function createTaskAction(input: {
  unitId: string;
  taskType?: string;
  priority?: string;
  assignedEmployeeId?: string | null;
  notes?: string | null;
}): Promise<HousekeepingActionResult> {
  try {
    const { propertyIds, actor } = await context(HOUSEKEEPING_PERMISSIONS.manage);
    const result = await createHousekeepingTask(input as never, actor, propertyIds);

    revalidateAfterRoomChange(result.unitId);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function assignTaskAction(input: {
  taskId: string;
  employeeId: string | null;
}): Promise<HousekeepingActionResult> {
  try {
    const { propertyIds, actor } = await context(HOUSEKEEPING_PERMISSIONS.manage);
    const result = await assignHousekeepingTask(input, actor, propertyIds);

    revalidateAfterRoomChange(result.unitId);
    revalidatePath(`/housekeeping/${result.taskId}`);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function startTaskAction(taskId: string): Promise<HousekeepingActionResult> {
  try {
    const { propertyIds, actor } = await context(HOUSEKEEPING_PERMISSIONS.work);
    const result = await startHousekeepingTask(taskId, actor, propertyIds);

    revalidateAfterRoomChange(result.unitId);
    revalidatePath(`/housekeeping/${result.taskId}`);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function completeTaskAction(input: {
  taskId: string;
  notes?: string | null;
}): Promise<HousekeepingActionResult> {
  try {
    const { propertyIds, actor } = await context(HOUSEKEEPING_PERMISSIONS.work);
    const result = await completeHousekeepingTask(input, actor, propertyIds);

    revalidateAfterRoomChange(result.unitId);
    revalidatePath(`/housekeeping/${result.taskId}`);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function cancelTaskAction(input: {
  taskId: string;
  reason: string;
}): Promise<HousekeepingActionResult> {
  try {
    const { propertyIds, actor } = await context(HOUSEKEEPING_PERMISSIONS.manage);
    const result = await cancelHousekeepingTask(input, actor, propertyIds);

    revalidateAfterRoomChange(result.unitId);
    revalidatePath(`/housekeeping/${result.taskId}`);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function inspectUnitAction(unitId: string): Promise<InspectionActionResult> {
  try {
    const { propertyIds, actor } = await context(HOUSEKEEPING_PERMISSIONS.manage);
    const result = await inspectUnit(unitId, actor, propertyIds);

    revalidateAfterRoomChange(result.unitId);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function reopenCleaningAction(input: {
  unitId: string;
  reason: string;
  priority?: string;
}): Promise<InspectionActionResult> {
  try {
    const { propertyIds, actor } = await context(HOUSEKEEPING_PERMISSIONS.manage);
    const result = await reopenCleaning(input as never, actor, propertyIds);

    revalidateAfterRoomChange(result.unitId);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}
