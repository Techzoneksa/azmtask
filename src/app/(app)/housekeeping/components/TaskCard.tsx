"use client";

import { Clock, DoorClosed, Layers, User } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui";
import {
  HOUSEKEEPING_SOURCE,
  HOUSEKEEPING_STATUS,
  HOUSEKEEPING_TASK_STATUS,
  HOUSEKEEPING_TASK_TYPE,
  PRIORITY,
  statusMeta,
} from "@/lib/status";
import type { HousekeepingTaskRow } from "@/server/services/housekeeping.service";

import { TaskActions, type TaskActionCapabilities } from "./TaskActions";

/**
 * One piece of work, as a card.
 *
 * Cards rather than a table by default, because the people who act on this screen are
 * standing in a corridor holding a phone. The room number is the largest thing on it —
 * that is what a housekeeper matches against the door in front of them — and the two
 * states are shown separately and labelled, never as two colours the reader has to
 * remember the meaning of.
 */
export function TaskCard({
  task,
  employees,
  capabilities,
}: {
  task: HousekeepingTaskRow;
  employees: Array<{ id: string; name: string; openTasks?: number }>;
  capabilities: TaskActionCapabilities;
}) {
  const room = statusMeta(HOUSEKEEPING_STATUS, task.housekeepingStatus);
  const work = statusMeta(HOUSEKEEPING_TASK_STATUS, task.status);
  const priority = statusMeta(PRIORITY, task.priority);
  const type = statusMeta(HOUSEKEEPING_TASK_TYPE, task.taskType);
  const source = statusMeta(HOUSEKEEPING_SOURCE, task.source);

  const urgent = task.priority === "URGENT" || task.priority === "HIGH";

  return (
    <article
      className={`rounded-xl border bg-surface p-4 ${urgent ? "border-warn-fg/40" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/housekeeping/${task.id}`}
            className="text-[18px] font-semibold tabular-nums text-content hover:underline"
          >
            وحدة {task.unitNumber}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-content-muted">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" aria-hidden />
              {task.floor === null ? "بدون طابق" : `الطابق ${task.floor}`}
            </span>
            <span>{task.unitTypeName}</span>
          </p>
        </div>

        <Badge tone={priority.tone as never}>{priority.label}</Badge>
      </div>

      {/* The two states, named. Colour reinforces the words; it never replaces them. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-inset px-2 py-1 text-[12px] text-content-muted">
          <DoorClosed className="size-3.5" aria-hidden />
          الوحدة: {room.label}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-surface-inset px-2 py-1 text-[12px] text-content-muted">
          المهمة: {work.label}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt className="text-content-subtle">النوع</dt>
          <dd className="mt-0.5 text-content">{type.label}</dd>
        </div>
        <div>
          <dt className="text-content-subtle">السبب</dt>
          <dd className="mt-0.5 text-content">{source.label}</dd>
        </div>
        <div>
          <dt className="text-content-subtle">الموظف</dt>
          <dd className="mt-0.5 flex items-center gap-1 text-content">
            {task.assigneeName ? (
              <>
                <User className="size-3.5 text-content-muted" aria-hidden />
                {task.assigneeName}
              </>
            ) : (
              <span className="text-warn-fg">غير مسندة</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-content-subtle">مضى عليها</dt>
          <dd className="mt-0.5 flex items-center gap-1 tabular-nums text-content">
            <Clock className="size-3.5 text-content-muted" aria-hidden />
            {formatAge(task.ageMinutes)}
          </dd>
        </div>
      </dl>

      {task.notes && (
        <p className="mt-3 rounded-lg bg-surface-inset px-3 py-2 text-[12px] leading-relaxed text-content-muted">
          {task.notes}
        </p>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <TaskActions
          task={{
            id: task.id,
            unitNumber: task.unitNumber,
            status: task.status,
            assigneeId: task.assigneeId,
          }}
          employees={employees}
          capabilities={capabilities}
        />
      </div>
    </article>
  );
}

/** Minutes, said the way a person would say them. */
export function formatAge(minutes: number): string {
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `${minutes} دقيقة`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ساعة`;

  const days = Math.floor(hours / 24);
  return `${days} يوم`;
}
