import "server-only";

import {
  HousekeepingStatus,
  HousekeepingTaskStatus,
  HousekeepingTaskType,
} from "@/generated/prisma/enums";
import type { Permission } from "@/lib/permissions";

/**
 * The rules of a cleaning, with nothing else attached.
 *
 * Pure functions over plain facts: no database, no session, no transaction. The board
 * deciding which buttons to render and the transaction deciding whether to perform the
 * work reach the same answer from the same code, so a button that fails cannot exist.
 *
 * ## Three state machines, deliberately kept apart
 *
 * The single most important idea in this module is that housekeeping involves three
 * different states, and conflating any two of them produces a room board nobody can
 * trust.
 *
 * **1. The room's housekeeping status — physical readiness.**
 *
 *     DIRTY ──start──▶ CLEANING ──complete──▶ CLEAN ──inspect──▶ INSPECTED
 *       ▲                                       │                    │
 *       └───────────── reopen ──────────────────┴────────────────────┘
 *
 * This says only whether the room is fit for a guest to walk into. It says nothing
 * about whether the room can be sold, and nothing about whether anyone is working on
 * it. No new state was added: CLEAN already means "serviced" and INSPECTED already
 * means "serviced and signed off", which is exactly the distinction a supervisor
 * needs, and both are check-in ready under the Stage 9 readiness rule.
 *
 * **2. The task's status — the work item.**
 *
 *     PENDING ──assign──▶ ASSIGNED ──start──▶ IN_PROGRESS ──complete──▶ COMPLETED
 *        │                   │                     │
 *        └───────────────────┴──────cancel─────────┘──────────────────▶ CANCELLED
 *
 * A task is a piece of work somebody owes. It can be started without being assigned
 * (a supervisor who cleans a room themselves), and completing it is what moves the
 * room — but the two are separate facts, and a completed task on a room that has since
 * been dirtied again is perfectly coherent history.
 *
 * **3. The room's operational status — availability.**
 *
 * Derived, never written by this module: a block outranks everything, a fault outranks
 * a guest, a guest outranks a clean. Housekeeping calls the same derivation the rest of
 * the system calls, so cleaning a blocked room leaves it blocked and cleaning a room
 * with an open fault leaves it out of service.
 *
 * Housekeeping controls physical readiness. Reservations control inventory. Blocks and
 * faults control availability. None of the three may overwrite another.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** A task somebody still owes work on. */
export const ACTIVE_TASK_STATUSES: HousekeepingTaskStatus[] = [
  HousekeepingTaskStatus.PENDING,
  HousekeepingTaskStatus.ASSIGNED,
  HousekeepingTaskStatus.IN_PROGRESS,
];

/** A task nothing further will happen to. */
export const TERMINAL_TASK_STATUSES: HousekeepingTaskStatus[] = [
  HousekeepingTaskStatus.COMPLETED,
  HousekeepingTaskStatus.CANCELLED,
];

export const isActiveTask = (status: HousekeepingTaskStatus) =>
  ACTIVE_TASK_STATUSES.includes(status);

/**
 * Housekeeping states that mean a room still needs attention.
 *
 * The complement of the Stage 9 readiness set, and deliberately expressed that way:
 * one definition of "ready", and everything else needs work.
 */
export const NEEDS_ATTENTION_STATUSES: HousekeepingStatus[] = [
  HousekeepingStatus.DIRTY,
  HousekeepingStatus.CLEANING,
];

/**
 * Task types that turn a room over between guests.
 *
 * These are the ones that take a room from DIRTY to CLEAN, and the only ones Stage 10
 * models end-to-end. A stay-over service is a different piece of work — the guest is
 * still in the room and the room never becomes DIRTY in the turnover sense — and it is
 * kept distinguishable rather than pretended to be the same thing.
 */
export const TURNOVER_TASK_TYPES: HousekeepingTaskType[] = [
  HousekeepingTaskType.CHECKOUT_CLEANING,
  HousekeepingTaskType.DEEP_CLEANING,
];

/** Work performed around a guest who has not left. */
export const IN_STAY_TASK_TYPES: HousekeepingTaskType[] = [
  HousekeepingTaskType.STAY_OVER,
  HousekeepingTaskType.TURNDOWN,
];

export const isTurnover = (taskType: HousekeepingTaskType) =>
  TURNOVER_TASK_TYPES.includes(taskType);

/*
 * Labels live in `@/lib/status`, with every other status vocabulary in the system
 * and reachable from client components. A second copy here would be a second place
 * for a room state to be named differently.
 */

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Which permission gates which act.
 *
 * No new keys were invented. The three that already exist map cleanly onto the three
 * things people actually do here: supervisors organise the work (`manage`), attendants
 * perform it (`complete`), and everyone who works the floor can see it (`view`).
 * Inspection, reopening and cancellation are supervisory decisions about whether a room
 * is fit for a guest, so they sit with `manage` rather than with the person who cleaned
 * it — a room attendant signing off their own work is not an inspection.
 */
export const HOUSEKEEPING_PERMISSIONS = {
  view: "housekeeping.view",
  /** Create, assign, reassign, inspect, reopen, cancel. */
  manage: "housekeeping.manage",
  /** Start and finish the physical work. */
  work: "housekeeping.complete",
} as const satisfies Record<string, Permission>;

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export type TransitionVerdict = { allowed: boolean; reason: string | null };

const allow: TransitionVerdict = { allowed: true, reason: null };
const refuse = (reason: string): TransitionVerdict => ({ allowed: false, reason });

/**
 * Whether a task may be assigned or reassigned.
 *
 * Only while there is work left to give. Reassigning a finished task would be a way of
 * rewriting who did it.
 */
export function canAssignTask(status: HousekeepingTaskStatus): TransitionVerdict {
  if (status === HousekeepingTaskStatus.COMPLETED) {
    return refuse("المهمة مكتملة — لا يمكن تغيير الموظف المسند إليها.");
  }
  if (status === HousekeepingTaskStatus.CANCELLED) {
    return refuse("المهمة ملغاة — لا يمكن إسنادها.");
  }
  return allow;
}

/** Whether work may begin. Assignment is not required: somebody may just start. */
export function canStartTask(status: HousekeepingTaskStatus): TransitionVerdict {
  if (status === HousekeepingTaskStatus.IN_PROGRESS) {
    // Not a failure. The caller treats this as a replay and changes nothing.
    return refuse("المهمة قيد التنفيذ بالفعل.");
  }
  if (status === HousekeepingTaskStatus.COMPLETED) {
    return refuse("المهمة مكتملة — لا يمكن بدؤها مرة أخرى.");
  }
  if (status === HousekeepingTaskStatus.CANCELLED) {
    return refuse("المهمة ملغاة — لا يمكن بدؤها.");
  }
  return allow;
}

/**
 * Whether the work may be declared finished.
 *
 * A task that was never started may be completed directly: an attendant who cleans a
 * room and only then opens the app has done the work, and refusing to record it would
 * teach them to press two buttons in a fiction.
 */
export function canCompleteTask(status: HousekeepingTaskStatus): TransitionVerdict {
  if (status === HousekeepingTaskStatus.COMPLETED) {
    return refuse("المهمة مكتملة بالفعل.");
  }
  if (status === HousekeepingTaskStatus.CANCELLED) {
    return refuse("المهمة ملغاة — لا يمكن إنهاؤها.");
  }
  return allow;
}

/**
 * Whether a task may be cancelled.
 *
 * A completed task cannot be: it describes work that was actually done, and cancelling
 * it would erase the reason a room is clean. Cancelling an in-progress task is allowed
 * — plans change and a room gets pulled — but it never claims the room was cleaned.
 */
export function canCancelTask(status: HousekeepingTaskStatus): TransitionVerdict {
  if (status === HousekeepingTaskStatus.COMPLETED) {
    return refuse("المهمة مكتملة — لا يمكن إلغاؤها. أعد فتح التنظيف إذا لزم الأمر.");
  }
  if (status === HousekeepingTaskStatus.CANCELLED) {
    return refuse("المهمة ملغاة بالفعل.");
  }
  return allow;
}

/**
 * Whether a room may be signed off.
 *
 * Only a room that has actually been cleaned. Inspecting a dirty room would make
 * INSPECTED mean nothing, and a room already signed off does not need signing twice.
 */
export function canInspectUnit(housekeepingStatus: HousekeepingStatus): TransitionVerdict {
  if (housekeepingStatus === HousekeepingStatus.INSPECTED) {
    return refuse("الوحدة معتمدة بالفعل.");
  }
  if (housekeepingStatus !== HousekeepingStatus.CLEAN) {
    return refuse("لا يمكن اعتماد وحدة لم يكتمل تنظيفها بعد.");
  }
  return allow;
}

/**
 * Whether a room may be sent back for another clean.
 *
 * Only from a state that claims the room is finished. Reopening a room that is already
 * dirty or being cleaned is a no-op dressed as a decision.
 */
export function canReopenCleaning(
  housekeepingStatus: HousekeepingStatus,
): TransitionVerdict {
  if (
    housekeepingStatus === HousekeepingStatus.DIRTY ||
    housekeepingStatus === HousekeepingStatus.CLEANING
  ) {
    return refuse("الوحدة بالفعل ضمن دورة التنظيف.");
  }
  return allow;
}

// ---------------------------------------------------------------------------
// The occupied-room policy
// ---------------------------------------------------------------------------

export type UnitFacts = {
  housekeepingStatus: HousekeepingStatus;
  /** A guest is in the room right now. */
  occupied: boolean;
};

/**
 * Whether this kind of task may be raised against this room.
 *
 * The rule Stage 10 has to protect: **a turnover clean is what happens after a guest
 * leaves, so it must not be raised against a room a guest is still in.** Allowing it
 * would put an occupied room into the turnover cycle, and completing it would then
 * declare a room ready to sell while somebody's suitcase is in it.
 *
 * Work around a guest who has not left is a different thing and is named differently:
 * a stay-over service or a turndown may be raised on an occupied room, and completing
 * one never touches occupancy — the room stays OCCUPIED because a reservation, not a
 * cleaning task, is what decides that.
 */
export function canCreateTaskFor(
  taskType: HousekeepingTaskType,
  unit: UnitFacts,
): TransitionVerdict {
  if (!unit.occupied) return allow;

  if (isTurnover(taskType)) {
    return refuse(
      "الوحدة مشغولة بنزيل حاليًا. تنظيف ما بعد المغادرة يُنشأ بعد إتمام المغادرة — استخدم خدمة أثناء الإقامة إذا كان المطلوب خدمة الغرفة.",
    );
  }

  return allow;
}

/**
 * What a room's housekeeping status becomes when a task of this type completes.
 *
 * A turnover finishes the cycle and the room becomes CLEAN. A stay-over service does
 * not: the room was never DIRTY in the turnover sense, the guest is still in it, and
 * marking it CLEAN would claim a readiness that has no meaning while it is occupied.
 * Returning null says "leave it exactly as it was", which is the honest answer.
 */
export function housekeepingStatusAfterCompletion(
  taskType: HousekeepingTaskType,
  unit: UnitFacts,
): HousekeepingStatus | null {
  if (unit.occupied && !isTurnover(taskType)) return null;
  return HousekeepingStatus.CLEAN;
}

/**
 * What a room's housekeeping status becomes when work starts.
 *
 * CLEANING, but only for a room in the turnover cycle. Starting a stay-over service on
 * an occupied room does not make it "being cleaned" in the sense the board means —
 * that would put an in-house room on the list of rooms nobody can be given.
 */
export function housekeepingStatusAfterStart(
  taskType: HousekeepingTaskType,
  unit: UnitFacts,
): HousekeepingStatus | null {
  if (unit.occupied && !isTurnover(taskType)) return null;
  if (unit.housekeepingStatus === HousekeepingStatus.DIRTY) {
    return HousekeepingStatus.CLEANING;
  }
  // A room already clean that somebody is re-servicing stays as it is; the task's own
  // status is what says work is happening.
  return null;
}
