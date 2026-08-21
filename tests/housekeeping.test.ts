import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { checkInReservation, getCheckInContext } from "@/server/services/checkin.service";
import {
  canCancelTask,
  canCompleteTask,
  canCreateTaskFor,
  canInspectUnit,
  canReopenCleaning,
  canStartTask,
  housekeepingStatusAfterCompletion,
} from "@/server/housekeeping-rules";
import {
  assignHousekeepingTask,
  cancelHousekeepingTask,
  completeHousekeepingTask,
  createHousekeepingTask,
  getHousekeepingSummary,
  getHousekeepingTask,
  getMyHousekeepingTasks,
  inspectUnit,
  listHousekeepingTasks,
  listUnattendedRooms,
  reopenCleaning,
  startHousekeepingTask,
} from "@/server/services/housekeeping.service";
import { createReservation } from "@/server/services/reservation.service";

import {
  TEST_ACTOR,
  resetDatabase,
  seedCheckInGuest,
  seedInventory,
  setBusinessDate,
  setVatRate,
} from "./helpers";

/**
 * Stage 10 — housekeeping.
 *
 * The rule the whole suite exists to defend: **housekeeping controls physical
 * readiness and nothing else.** A clean room that is blocked stays blocked, a clean
 * room with an open fault stays out of service, and a clean room a guest is still in
 * stays occupied. Every one of those is a case where a hand-rolled status write would
 * quietly put a room back on the market.
 *
 * Alongside it: the races a single person clicking through the screen will never
 * produce — twenty attendants starting the same task, a completion and a cancellation
 * arriving together, and a fault opening while a clean is being finished.
 */

const AUG_20 = "2026-08-20";

let ctx: Awaited<ReturnType<typeof seedInventory>>;
let attendant: { id: string; name: string };
let otherAttendant: { id: string; name: string };

beforeEach(async () => {
  await resetDatabase();
  ctx = await seedInventory({ units: 3, unitPrefix: "H" });
  await setVatRate(ctx.property.id, "0");
  await setBusinessDate(AUG_20);

  attendant = await prisma.employee.create({
    data: {
      propertyId: ctx.property.id,
      name: "فاطمة الفيفي",
      department: "HOUSEKEEPING",
      employmentStatus: "ACTIVE",
    },
    select: { id: true, name: true },
  });

  otherAttendant = await prisma.employee.create({
    data: {
      propertyId: ctx.property.id,
      name: "نورة القحطاني",
      department: "HOUSEKEEPING",
      employmentStatus: "ACTIVE",
    },
    select: { id: true, name: true },
  });
});

afterAll(async () => {
  // Later suites seed their own world and count document numbers; rows left behind
  // here would collide with theirs.
  await resetDatabase();
});

const scope = () => [ctx.property.id];

/** A room that has just been vacated: dirty, with nobody on it yet. */
async function dirtyRoom(index = 0) {
  await prisma.unit.update({
    where: { id: ctx.units[index].id },
    data: { housekeepingStatus: "DIRTY", status: "CLEANING" },
  });
  return ctx.units[index];
}

const raise = (unitId: string, overrides: Record<string, unknown> = {}) =>
  createHousekeepingTask({ unitId, ...overrides } as never, TEST_ACTOR, scope());

const unitState = async (unitId: string) =>
  prisma.unit.findUniqueOrThrow({
    where: { id: unitId },
    select: { status: true, housekeepingStatus: true, inspectedAt: true, inspectedById: true },
  });

const taskState = async (taskId: string) =>
  prisma.housekeepingTask.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      status: true,
      assignedEmployeeId: true,
      assignedAt: true,
      startedAt: true,
      completedAt: true,
      cancelledAt: true,
      cancellationReason: true,
      source: true,
      sourceReservationId: true,
    },
  });

// ---------------------------------------------------------------------------

describe("transition rules", () => {
  it("allows starting work that has not been started", () => {
    expect(canStartTask("PENDING").allowed).toBe(true);
    expect(canStartTask("ASSIGNED").allowed).toBe(true);
  });

  it("refuses to start finished work", () => {
    expect(canStartTask("COMPLETED").allowed).toBe(false);
    expect(canStartTask("CANCELLED").allowed).toBe(false);
  });

  it("allows completing a task that was never formally started", () => {
    // Somebody who cleaned the room and only then opened the app has done the work.
    expect(canCompleteTask("PENDING").allowed).toBe(true);
    expect(canCompleteTask("ASSIGNED").allowed).toBe(true);
  });

  it("refuses to cancel completed work", () => {
    expect(canCancelTask("COMPLETED").allowed).toBe(false);
    expect(canCancelTask("IN_PROGRESS").allowed).toBe(true);
  });

  it("only signs off a room that has actually been cleaned", () => {
    expect(canInspectUnit("CLEAN").allowed).toBe(true);
    expect(canInspectUnit("DIRTY").allowed).toBe(false);
    expect(canInspectUnit("CLEANING").allowed).toBe(false);
    expect(canInspectUnit("INSPECTED").allowed).toBe(false);
  });

  it("only reopens a room that claims to be finished", () => {
    expect(canReopenCleaning("CLEAN").allowed).toBe(true);
    expect(canReopenCleaning("INSPECTED").allowed).toBe(true);
    expect(canReopenCleaning("DIRTY").allowed).toBe(false);
  });

  it("keeps a turnover clean away from an occupied room", () => {
    const occupied = { housekeepingStatus: "CLEAN" as const, occupied: true };
    expect(canCreateTaskFor("CHECKOUT_CLEANING", occupied).allowed).toBe(false);
    expect(canCreateTaskFor("DEEP_CLEANING", occupied).allowed).toBe(false);
    // Work around a guest who has not left is a different thing.
    expect(canCreateTaskFor("STAY_OVER", occupied).allowed).toBe(true);
    expect(canCreateTaskFor("TURNDOWN", occupied).allowed).toBe(true);
  });

  it("leaves an occupied room's readiness alone when a stay-over service finishes", () => {
    const occupied = { housekeepingStatus: "CLEAN" as const, occupied: true };
    // Null means "change nothing" — the room was never dirty in the turnover sense.
    expect(housekeepingStatusAfterCompletion("STAY_OVER", occupied)).toBeNull();
    expect(housekeepingStatusAfterCompletion("CHECKOUT_CLEANING", { housekeepingStatus: "DIRTY", occupied: false })).toBe("CLEAN");
  });
});

describe("creating work", () => {
  it("raises a task on a dirty room", async () => {
    const unit = await dirtyRoom();
    const result = await raise(unit.id, { priority: "HIGH" });

    expect(result.status).toBe("PENDING");
    const stored = await taskState(result.taskId);
    expect(stored.source).toBe("MANUAL");
    expect(stored.assignedEmployeeId).toBeNull();
  });

  it("assigns at creation when an employee is named", async () => {
    const unit = await dirtyRoom();
    const result = await raise(unit.id, { assignedEmployeeId: attendant.id });

    expect(result.status).toBe("ASSIGNED");
    const stored = await taskState(result.taskId);
    expect(stored.assignedEmployeeId).toBe(attendant.id);
    expect(stored.assignedAt).toBeInstanceOf(Date);
  });

  it("refuses a second open task for the same room", async () => {
    const unit = await dirtyRoom();
    await raise(unit.id);

    await expect(raise(unit.id)).rejects.toMatchObject({
      code: "CONFLICT",
      fields: { unitId: "توجد مهمة مفتوحة لهذه الوحدة" },
    });
  });

  it("allows a new task once the previous one is finished", async () => {
    const unit = await dirtyRoom();
    const first = await raise(unit.id);
    await completeHousekeepingTask({ taskId: first.taskId }, TEST_ACTOR, scope());

    const second = await raise(unit.id);
    expect(second.taskId).not.toBe(first.taskId);
  });

  it("refuses a turnover clean on an occupied room", async () => {
    const unit = ctx.units[0];
    await occupy(unit.id);

    await expect(raise(unit.id, { taskType: "CHECKOUT_CLEANING" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("allows a stay-over service on an occupied room", async () => {
    const unit = ctx.units[0];
    await occupy(unit.id);

    const result = await raise(unit.id, { taskType: "STAY_OVER" });
    expect(result.status).toBe("PENDING");
  });

  it("refuses an unknown unit", async () => {
    await expect(raise("cmt000000000000000000000000")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses an employee from another department", async () => {
    const unit = await dirtyRoom();
    const technician = await prisma.employee.create({
      data: {
        propertyId: ctx.property.id,
        name: "فني الصيانة",
        department: "MAINTENANCE",
        employmentStatus: "ACTIVE",
      },
    });

    await expect(raise(unit.id, { assignedEmployeeId: technician.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuses an employee who has left", async () => {
    const unit = await dirtyRoom();
    await prisma.employee.update({
      where: { id: attendant.id },
      data: { employmentStatus: "TERMINATED" },
    });

    await expect(raise(unit.id, { assignedEmployeeId: attendant.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("assignment", () => {
  it("assigns and then reassigns", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    await assignHousekeepingTask({ taskId: task.taskId, employeeId: attendant.id }, TEST_ACTOR, scope());
    expect((await taskState(task.taskId)).assignedEmployeeId).toBe(attendant.id);

    await assignHousekeepingTask({ taskId: task.taskId, employeeId: otherAttendant.id }, TEST_ACTOR, scope());
    expect((await taskState(task.taskId)).assignedEmployeeId).toBe(otherAttendant.id);

    // Two distinct events: an assignment and a reassignment, not two of the same.
    expect(
      await prisma.activityLog.count({
        where: { entityId: task.taskId, action: "task_assigned" },
      }),
    ).toBe(1);
    expect(
      await prisma.activityLog.count({
        where: { entityId: task.taskId, action: "task_reassigned" },
      }),
    ).toBe(1);
  });

  it("returns a task to the unassigned pool", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id, { assignedEmployeeId: attendant.id });

    const result = await assignHousekeepingTask(
      { taskId: task.taskId, employeeId: null },
      TEST_ACTOR,
      scope(),
    );

    expect(result.status).toBe("PENDING");
    const stored = await taskState(task.taskId);
    expect(stored.assignedEmployeeId).toBeNull();
    expect(stored.assignedAt).toBeNull();
  });

  it("does not rewind work that has already started", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id, { assignedEmployeeId: attendant.id });
    await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());

    const result = await assignHousekeepingTask(
      { taskId: task.taskId, employeeId: otherAttendant.id },
      TEST_ACTOR,
      scope(),
    );

    // Handing over a room mid-clean does not un-start it.
    expect(result.status).toBe("IN_PROGRESS");
    expect((await taskState(task.taskId)).startedAt).toBeInstanceOf(Date);
  });

  it("treats assigning the same person again as a no-op", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id, { assignedEmployeeId: attendant.id });

    const result = await assignHousekeepingTask(
      { taskId: task.taskId, employeeId: attendant.id },
      TEST_ACTOR,
      scope(),
    );

    expect(result.replayed).toBe(true);
  });

  it("refuses to reassign completed work", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    await expect(
      assignHousekeepingTask({ taskId: task.taskId, employeeId: attendant.id }, TEST_ACTOR, scope()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses an employee from another property", async () => {
    const other = await seedInventory({ units: 1, name: "فندق باء", unitPrefix: "B" });
    const foreign = await prisma.employee.create({
      data: {
        propertyId: other.property.id,
        name: "موظفة منشأة أخرى",
        department: "HOUSEKEEPING",
        employmentStatus: "ACTIVE",
      },
    });

    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    await expect(
      assignHousekeepingTask({ taskId: task.taskId, employeeId: foreign.id }, TEST_ACTOR, scope()),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("starting work", () => {
  it("moves the task and the room together", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id, { assignedEmployeeId: attendant.id });

    const result = await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());

    expect(result.status).toBe("IN_PROGRESS");
    expect(result.housekeepingStatus).toBe("CLEANING");
    expect((await unitState(unit.id)).housekeepingStatus).toBe("CLEANING");
    expect((await taskState(task.taskId)).startedAt).toBeInstanceOf(Date);
  });

  it("is idempotent and keeps the original start time", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    const first = await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());
    const startedAt = (await taskState(task.taskId)).startedAt;

    const second = await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());
    expect(second.replayed).toBe(true);
    expect(first.replayed).toBe(false);
    expect((await taskState(task.taskId)).startedAt).toEqual(startedAt);

    expect(
      await prisma.activityLog.count({
        where: { entityId: task.taskId, action: "task_started" },
      }),
    ).toBe(1);
  });

  it("refuses to start completed work", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    await expect(startHousekeepingTask(task.taskId, TEST_ACTOR, scope())).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("does not make an occupied room look like it is being turned over", async () => {
    const unit = ctx.units[0];
    await occupy(unit.id);
    const task = await raise(unit.id, { taskType: "STAY_OVER" });

    await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());

    const state = await unitState(unit.id);
    expect(state.housekeepingStatus).toBe("CLEAN");
    expect(state.status).toBe("OCCUPIED");
  });
});

describe("completing work", () => {
  it("returns the room to the market through central derivation", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());

    const result = await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    expect(result.status).toBe("COMPLETED");
    expect(result.housekeepingStatus).toBe("CLEAN");
    expect(result.unitStatus).toBe("AVAILABLE");

    const stored = await taskState(task.taskId);
    expect(stored.completedAt).toBeInstanceOf(Date);
  });

  it("is idempotent and keeps the original completion time", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());
    const completedAt = (await taskState(task.taskId)).completedAt;

    const replay = await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());
    expect(replay.replayed).toBe(true);
    expect((await taskState(task.taskId)).completedAt).toEqual(completedAt);

    expect(
      await prisma.activityLog.count({
        where: { entityId: task.taskId, action: "task_completed" },
      }),
    ).toBe(1);
  });

  it("leaves a blocked room blocked", async () => {
    const unit = await dirtyRoom();
    await prisma.unitBlock.create({
      data: {
        propertyId: ctx.property.id,
        unitId: unit.id,
        reason: "RENOVATION",
        startDate: new Date(Date.UTC(2026, 7, 20)),
        endDate: null,
        active: true,
      },
    });

    const task = await raise(unit.id);
    const result = await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    // Clean, and still off the market. Cleaning does not lift a block.
    expect(result.housekeepingStatus).toBe("CLEAN");
    expect(result.unitStatus).toBe("BLOCKED");
    expect((await unitState(unit.id)).status).toBe("BLOCKED");
  });

  it("leaves a room that is out of service out of service", async () => {
    const unit = await dirtyRoom();
    await prisma.unit.update({
      where: { id: unit.id },
      data: { maintenanceStatus: "OUT_OF_SERVICE" },
    });

    const task = await raise(unit.id);
    const result = await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    expect(result.housekeepingStatus).toBe("CLEAN");
    expect(result.unitStatus).toBe("MAINTENANCE");
  });

  it("leaves an occupied room occupied", async () => {
    const unit = ctx.units[0];
    await occupy(unit.id);
    const task = await raise(unit.id, { taskType: "STAY_OVER" });

    const result = await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());
    expect(result.unitStatus).toBe("OCCUPIED");
  });

  it("clears a previous sign-off, because a fresh clean is not an inspection", async () => {
    const unit = await dirtyRoom();
    const first = await raise(unit.id);
    await completeHousekeepingTask({ taskId: first.taskId }, TEST_ACTOR, scope());
    await inspectUnit(unit.id, TEST_ACTOR, scope());
    expect((await unitState(unit.id)).inspectedAt).toBeInstanceOf(Date);

    await prisma.unit.update({ where: { id: unit.id }, data: { housekeepingStatus: "DIRTY" } });
    const second = await raise(unit.id);
    await completeHousekeepingTask({ taskId: second.taskId }, TEST_ACTOR, scope());

    const state = await unitState(unit.id);
    expect(state.housekeepingStatus).toBe("CLEAN");
    expect(state.inspectedAt).toBeNull();
    expect(state.inspectedById).toBeNull();
  });
});

describe("cancellation", () => {
  it("withdraws the work without claiming the room is clean", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    const result = await cancelHousekeepingTask(
      { taskId: task.taskId, reason: "أُوقفت الوحدة عن البيع" },
      TEST_ACTOR,
      scope(),
    );

    expect(result.status).toBe("CANCELLED");
    // The room still needs somebody. That is the whole point.
    expect((await unitState(unit.id)).housekeepingStatus).toBe("DIRTY");

    const stored = await taskState(task.taskId);
    expect(stored.cancelledAt).toBeInstanceOf(Date);
    expect(stored.cancellationReason).toBe("أُوقفت الوحدة عن البيع");
  });

  it("puts a half-cleaned room back on the list rather than leaving it mid-clean", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());
    expect((await unitState(unit.id)).housekeepingStatus).toBe("CLEANING");

    await cancelHousekeepingTask({ taskId: task.taskId, reason: "سُحبت الموظفة" }, TEST_ACTOR, scope());

    // A room "being cleaned" by nobody is the most misleading thing a board can say.
    expect((await unitState(unit.id)).housekeepingStatus).toBe("DIRTY");
  });

  it("refuses to cancel completed work", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    await expect(
      cancelHousekeepingTask({ taskId: task.taskId, reason: "خطأ" }, TEST_ACTOR, scope()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requires a reason", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    await expect(
      cancelHousekeepingTask({ taskId: task.taskId, reason: "" }, TEST_ACTOR, scope()),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("is idempotent", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    await cancelHousekeepingTask({ taskId: task.taskId, reason: "تأجيل" }, TEST_ACTOR, scope());
    const replay = await cancelHousekeepingTask(
      { taskId: task.taskId, reason: "تأجيل" },
      TEST_ACTOR,
      scope(),
    );

    expect(replay.replayed).toBe(true);
    expect(
      await prisma.activityLog.count({
        where: { entityId: task.taskId, action: "task_cancelled" },
      }),
    ).toBe(1);
  });
});

describe("inspection", () => {
  it("signs off a cleaned room with a name and a time", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    const supervisor = await prisma.user.create({
      data: {
        name: "مشرفة النظافة",
        email: `hk-${Date.now()}@nokhba-hotel.sa`,
        passwordHash: "x".repeat(60),
      },
    });

    const result = await inspectUnit(unit.id, { ...TEST_ACTOR, id: supervisor.id }, scope());

    expect(result.housekeepingStatus).toBe("INSPECTED");
    const state = await unitState(unit.id);
    expect(state.inspectedAt).toBeInstanceOf(Date);
    expect(state.inspectedById).toBe(supervisor.id);
  });

  it("refuses to sign off a room that has not been cleaned", async () => {
    const unit = await dirtyRoom();

    await expect(inspectUnit(unit.id, TEST_ACTOR, scope())).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("is idempotent", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    await inspectUnit(unit.id, TEST_ACTOR, scope());
    const replay = await inspectUnit(unit.id, TEST_ACTOR, scope());

    expect(replay.replayed).toBe(true);
    expect(
      await prisma.activityLog.count({
        where: { entityId: unit.id, action: "unit_inspected" },
      }),
    ).toBe(1);
  });

  it("does not put a blocked room back on the market", async () => {
    const unit = await dirtyRoom();
    await prisma.unitBlock.create({
      data: {
        propertyId: ctx.property.id,
        unitId: unit.id,
        reason: "OWNER_USE",
        startDate: new Date(Date.UTC(2026, 7, 20)),
        endDate: null,
        active: true,
      },
    });

    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());
    const result = await inspectUnit(unit.id, TEST_ACTOR, scope());

    expect(result.housekeepingStatus).toBe("INSPECTED");
    expect(result.unitStatus).toBe("BLOCKED");
  });
});

describe("reopening after a failed inspection", () => {
  it("sends the room back and raises new work with the reason attached", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());
    await inspectUnit(unit.id, TEST_ACTOR, scope());

    const result = await reopenCleaning(
      { unitId: unit.id, reason: "الحمّام لم يُنظَّف" },
      TEST_ACTOR,
      scope(),
    );

    expect(result.housekeepingStatus).toBe("DIRTY");
    expect(result.taskId).not.toBe(task.taskId);

    const created = await prisma.housekeepingTask.findUniqueOrThrow({
      where: { id: result.taskId! },
      select: { status: true, source: true, notes: true, priority: true },
    });
    expect(created.status).toBe("PENDING");
    expect(created.source).toBe("INSPECTION_FAILED");
    expect(created.notes).toContain("الحمّام لم يُنظَّف");

    // The sign-off no longer describes this room.
    const state = await unitState(unit.id);
    expect(state.inspectedAt).toBeNull();
  });

  it("requires a reason", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    await expect(
      reopenCleaning({ unitId: unit.id, reason: "" }, TEST_ACTOR, scope()),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("reuses an open task rather than stacking a second one", async () => {
    const unit = await dirtyRoom();
    const first = await raise(unit.id);
    await completeHousekeepingTask({ taskId: first.taskId }, TEST_ACTOR, scope());

    // A supervisor raises a fresh piece of work on the now-clean room — a deep clean,
    // say — and only afterwards decides the room is not fit to sell.
    const pending = await raise(unit.id, { taskType: "DEEP_CLEANING" });

    const reopened = await reopenCleaning(
      { unitId: unit.id, reason: "رائحة في الغرفة" },
      TEST_ACTOR,
      scope(),
    );

    // The work that already exists is the work; a second task for one room would make
    // the board lie about how much is outstanding.
    expect(reopened.taskId).toBe(pending.taskId);
    expect(
      await prisma.housekeepingTask.count({
        where: { unitId: unit.id, status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } },
      }),
    ).toBe(1);
  });

  it("refuses to reopen a room already in the cleaning cycle", async () => {
    const unit = await dirtyRoom();

    await expect(
      reopenCleaning({ unitId: unit.id, reason: "مجددًا" }, TEST_ACTOR, scope()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("concurrency", () => {
  it("performs one start when twenty attendants press the button at once", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => startHousekeepingTask(task.taskId, TEST_ACTOR, scope())),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(20);

    const performed = fulfilled.filter(
      (r) => (r as PromiseFulfilledResult<{ replayed: boolean }>).value.replayed === false,
    );
    expect(performed).toHaveLength(1);

    expect(
      await prisma.activityLog.count({
        where: { entityId: task.taskId, action: "task_started" },
      }),
    ).toBe(1);
    expect((await taskState(task.taskId)).status).toBe("IN_PROGRESS");
  });

  it("performs one completion when twenty completions arrive together", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope()),
      ),
    );

    const performed = results.filter(
      (r) =>
        r.status === "fulfilled" &&
        (r as PromiseFulfilledResult<{ replayed: boolean }>).value.replayed === false,
    );
    expect(performed).toHaveLength(1);
    expect(
      await prisma.activityLog.count({
        where: { entityId: task.taskId, action: "task_completed" },
      }),
    ).toBe(1);
  });

  it("lets exactly one of a completion and a cancellation win", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    const [completion, cancellation] = await Promise.allSettled([
      completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope()),
      cancelHousekeepingTask({ taskId: task.taskId, reason: "سُحبت" }, TEST_ACTOR, scope()),
    ]);

    /*
     * Serialised by the lock, so exactly one reaches a terminal state and the other is
     * refused by the rules: a completed task cannot be cancelled, and a cancelled one
     * cannot be completed. Both succeeding would leave the room's readiness depending
     * on which write landed last.
     */
    const succeeded = [completion, cancellation].filter((r) => r.status === "fulfilled");
    expect(succeeded).toHaveLength(1);

    const final = (await taskState(task.taskId)).status;
    expect(final).toBe(completion.status === "fulfilled" ? "COMPLETED" : "CANCELLED");

    // One terminal event in the audit trail, not two.
    const terminal = await prisma.activityLog.count({
      where: {
        entityId: task.taskId,
        action: { in: ["task_completed", "task_cancelled"] },
      },
    });
    expect(terminal).toBe(1);
  });

  it("reassigns deterministically when two supervisors act at once", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);

    await Promise.allSettled([
      assignHousekeepingTask({ taskId: task.taskId, employeeId: attendant.id }, TEST_ACTOR, scope()),
      assignHousekeepingTask({ taskId: task.taskId, employeeId: otherAttendant.id }, TEST_ACTOR, scope()),
    ]);

    // Serialised by the lock: one of the two names is on it, never both and never none.
    const stored = await taskState(task.taskId);
    expect([attendant.id, otherAttendant.id]).toContain(stored.assignedEmployeeId);
    expect(stored.status).toBe("ASSIGNED");
  });

  it("derives the final state when a fault opens during a clean", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());

    // The fault is recorded while the clean is under way.
    await prisma.unit.update({
      where: { id: unit.id },
      data: { maintenanceStatus: "OUT_OF_SERVICE" },
    });

    const result = await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    // Derived, not last-writer-wins: the room is clean and still unsellable.
    expect(result.housekeepingStatus).toBe("CLEAN");
    expect(result.unitStatus).toBe("MAINTENANCE");
  });
});

describe("listing and summary", () => {
  it("counts rooms and work separately", async () => {
    await dirtyRoom(0);
    await dirtyRoom(1);
    const task = await raise(ctx.units[0].id, { priority: "URGENT" });
    await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());

    const summary = await getHousekeepingSummary(scope());

    expect(summary.totalUnits).toBe(3);
    // Room 0 is being cleaned; room 1 is still waiting; room 2 was never touched.
    expect(summary.cleaning).toBe(1);
    expect(summary.dirty).toBe(1);
    expect(summary.cleanRooms).toBe(1);
    // One task, in progress — not two, and not the same number as the dirty rooms.
    expect(summary.inProgress).toBe(1);
    expect(summary.pending).toBe(0);
    expect(summary.urgent).toBe(1);
  });

  it("shows rooms that need attention but carry no open task", async () => {
    await dirtyRoom(0);
    await dirtyRoom(1);
    await raise(ctx.units[0].id);

    const unattended = await listUnattendedRooms(scope());

    expect(unattended.map((room) => room.unitId)).toEqual([ctx.units[1].id]);
  });

  it("filters by priority, employee and unassigned", async () => {
    await dirtyRoom(0);
    await dirtyRoom(1);
    await raise(ctx.units[0].id, { priority: "URGENT", assignedEmployeeId: attendant.id });
    await raise(ctx.units[1].id, { priority: "LOW" });

    const urgent = await listHousekeepingTasks(scope(), { urgent: true });
    expect(urgent.rows).toHaveLength(1);
    expect(urgent.rows[0].unitId).toBe(ctx.units[0].id);

    const mine = await listHousekeepingTasks(scope(), { employeeId: attendant.id });
    expect(mine.rows).toHaveLength(1);

    const unassigned = await listHousekeepingTasks(scope(), { unassigned: true });
    expect(unassigned.rows).toHaveLength(1);
    expect(unassigned.rows[0].unitId).toBe(ctx.units[1].id);
  });

  it("hides finished work by default and shows it on request", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    expect((await listHousekeepingTasks(scope(), {})).rows).toHaveLength(0);
    expect((await listHousekeepingTasks(scope(), { activeOnly: false })).rows).toHaveLength(1);
  });

  it("pages without losing rows", async () => {
    for (let index = 0; index < 3; index++) {
      await dirtyRoom(index);
      await raise(ctx.units[index].id);
    }

    const first = await listHousekeepingTasks(scope(), { pageSize: 2, page: 1 });
    const second = await listHousekeepingTasks(scope(), { pageSize: 2, page: 2 });

    expect(first.total).toBe(3);
    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(1);
    const ids = new Set([...first.rows, ...second.rows].map((row) => row.id));
    expect(ids.size).toBe(3);
  });

  it("lists only the signed-in employee's own work", async () => {
    await dirtyRoom(0);
    await dirtyRoom(1);
    await raise(ctx.units[0].id, { assignedEmployeeId: attendant.id });
    await raise(ctx.units[1].id, { assignedEmployeeId: otherAttendant.id });

    const mine = await getMyHousekeepingTasks(attendant.id, scope());
    expect(mine).toHaveLength(1);
    expect(mine[0].unitId).toBe(ctx.units[0].id);

    // A login with no staff record sees nothing, not everything.
    expect(await getMyHousekeepingTasks(null, scope())).toHaveLength(0);
  });
});

describe("property isolation", () => {
  let other: Awaited<ReturnType<typeof seedInventory>>;
  let foreignTaskId: string;

  beforeEach(async () => {
    other = await seedInventory({ units: 1, name: "فندق باء", unitPrefix: "B" });
    await prisma.unit.update({
      where: { id: other.units[0].id },
      data: { housekeepingStatus: "DIRTY" },
    });
    const created = await createHousekeepingTask(
      { unitId: other.units[0].id } as never,
      TEST_ACTOR,
      [other.property.id],
    );
    foreignTaskId = created.taskId;
  });

  it("hides another property's task entirely", async () => {
    await expect(getHousekeepingTask(foreignTaskId, scope())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses to start another property's task", async () => {
    await expect(startHousekeepingTask(foreignTaskId, TEST_ACTOR, scope())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses to complete another property's task", async () => {
    await expect(
      completeHousekeepingTask({ taskId: foreignTaskId }, TEST_ACTOR, scope()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to raise work on another property's room", async () => {
    await expect(raise(other.units[0].id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to inspect another property's room", async () => {
    await expect(inspectUnit(other.units[0].id, TEST_ACTOR, scope())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("never lists another property's work", async () => {
    const list = await listHousekeepingTasks(scope(), { activeOnly: false });
    expect(list.rows.map((row) => row.id)).not.toContain(foreignTaskId);
  });
});

describe("check-in readiness", () => {
  it("makes a cleaned room selectable at the desk without any manual step", async () => {
    const guest = await seedCheckInGuest();

    // Every room dirty: nothing to hand over.
    await prisma.unit.updateMany({
      where: { propertyId: ctx.property.id },
      data: { housekeepingStatus: "DIRTY" },
    });

    const reservation = await createReservation(
      {
        propertyId: ctx.property.id,
        guestId: guest.id,
        unitTypeId: ctx.unitType.id,
        checkInDate: AUG_20,
        checkOutDate: "2026-08-22",
        adults: 1,
        nightlyRate: "400.00",
        status: "CONFIRMED",
      } as never,
      TEST_ACTOR,
    );

    const before = await getCheckInContext(
      reservation.id,
      scope(),
      new Set(["reservations.view", "reservations.checkin"] as never),
    );
    expect(before.rooms.every((room) => !room.selectable)).toBe(true);
    expect(before.noRoomAvailable).toBe(true);

    // Housekeeping does its job. Nothing else is touched.
    const task = await raise(ctx.units[0].id);
    await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    const after = await getCheckInContext(
      reservation.id,
      scope(),
      new Set(["reservations.view", "reservations.checkin"] as never),
    );
    const room = after.rooms.find((candidate) => candidate.id === ctx.units[0].id);

    expect(room?.ready).toBe(true);
    expect(room?.selectable).toBe(true);
    expect(after.noRoomAvailable).toBe(false);

    // And the arrival actually completes against it.
    const arrival = await checkInReservation(
      { reservationId: reservation.id, unitId: ctx.units[0].id },
      TEST_ACTOR,
    );
    expect(arrival.status).toBe("CHECKED_IN");
  });

  it("does not make a room ready when a fault is still open", async () => {
    const unit = await dirtyRoom();
    await prisma.unit.update({
      where: { id: unit.id },
      data: { maintenanceStatus: "UNDER_MAINTENANCE" },
    });

    const guest = await seedCheckInGuest();
    const reservation = await createReservation(
      {
        propertyId: ctx.property.id,
        guestId: guest.id,
        unitTypeId: ctx.unitType.id,
        checkInDate: AUG_20,
        checkOutDate: "2026-08-22",
        adults: 1,
        nightlyRate: "400.00",
        status: "CONFIRMED",
      } as never,
      TEST_ACTOR,
    );

    const task = await raise(unit.id);
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());

    const context = await getCheckInContext(
      reservation.id,
      scope(),
      new Set(["reservations.view", "reservations.checkin"] as never),
    );
    const room = context.rooms.find((candidate) => candidate.id === unit.id);

    // Clean, but not available — readiness and availability are different questions.
    expect(room?.ready).toBe(true);
    expect(room?.available).toBe(false);
    expect(room?.selectable).toBe(false);
  });
});

describe("activity logging", () => {
  it("records one entry per transition, with the room and the actor", async () => {
    const unit = await dirtyRoom();
    const task = await raise(unit.id, { assignedEmployeeId: attendant.id });
    await startHousekeepingTask(task.taskId, TEST_ACTOR, scope());
    await completeHousekeepingTask({ taskId: task.taskId }, TEST_ACTOR, scope());
    await inspectUnit(unit.id, TEST_ACTOR, scope());

    const taskEntries = await prisma.activityLog.findMany({
      where: { entityId: task.taskId },
      select: { action: true, description: true, userName: true, propertyId: true },
    });

    expect(taskEntries.map((entry) => entry.action).sort()).toEqual([
      "task_completed",
      "task_created",
      "task_started",
    ]);
    for (const entry of taskEntries) {
      expect(entry.userName).toBe(TEST_ACTOR.name);
      expect(entry.propertyId).toBe(ctx.property.id);
      expect(entry.description).toContain(unit.unitNumber);
    }

    expect(
      await prisma.activityLog.count({
        where: { entityId: unit.id, action: "unit_inspected" },
      }),
    ).toBe(1);
  });

  it("never records a guest's name on a cleaning task", async () => {
    const guest = await seedCheckInGuest({ fullName: "نزيل سرّي جدًا" });
    const unit = ctx.units[0];

    const reservation = await createReservation(
      {
        propertyId: ctx.property.id,
        guestId: guest.id,
        unitId: unit.id,
        unitTypeId: ctx.unitType.id,
        checkInDate: AUG_20,
        checkOutDate: "2026-08-22",
        adults: 1,
        nightlyRate: "400.00",
        status: "CONFIRMED",
      } as never,
      TEST_ACTOR,
    );
    await checkInReservation({ reservationId: reservation.id }, TEST_ACTOR);

    const task = await raise(unit.id, { taskType: "STAY_OVER" });
    const entries = await prisma.activityLog.findMany({
      where: { entityId: task.taskId },
      select: { description: true, metadata: true },
    });

    expect(JSON.stringify(entries)).not.toContain("نزيل سرّي جدًا");
  });
});

/** Puts a real guest in a room, through the real arrival path. */
async function occupy(unitId: string) {
  const guest = await seedCheckInGuest();
  const reservation = await createReservation(
    {
      propertyId: ctx.property.id,
      guestId: guest.id,
      unitId,
      unitTypeId: ctx.unitType.id,
      checkInDate: AUG_20,
      checkOutDate: "2026-08-23",
      adults: 1,
      nightlyRate: "400.00",
      status: "CONFIRMED",
    } as never,
    TEST_ACTOR,
  );
  await checkInReservation({ reservationId: reservation.id }, TEST_ACTOR);
  return reservation;
}
