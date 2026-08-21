"use client";

import { CheckCircle2, ClipboardCheck, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, useConfirm, useToast } from "@/components/ui";
import { HOUSEKEEPING_STATUS, HOUSEKEEPING_TASK_STATUS, PRIORITY, statusMeta } from "@/lib/status";
import type { HousekeepingTaskRow } from "@/server/services/housekeeping.service";

import { completeTaskAction, startTaskAction } from "../actions";
import { formatAge } from "./TaskCard";

/**
 * One attendant's own work.
 *
 * Built for the phone in a corridor, so it is deliberately not the supervisor's board
 * with a filter on it: no columns, no dropdowns, one room per row with the number large
 * enough to match against a door, and the single action that room needs as a full-width
 * button under the thumb.
 *
 * The list comes from the employee record attached to the login, never from a role. A
 * supervisor who also cleans rooms sees their own work here; a login with no staff
 * record sees an empty list rather than everybody's.
 */
export function MyTasks({ tasks }: { tasks: HousekeepingTaskRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function start(task: HousekeepingTaskRow) {
    if (busyId) return;
    setBusyId(task.id);
    const result = await startTaskAction(task.id);
    setBusyId(null);

    if (result.ok) {
      toast.success(`بدأ تنظيف الوحدة ${task.unitNumber}`);
      router.refresh();
      return;
    }
    toast.error("تعذّر بدء المهمة", result.error);
  }

  async function complete(task: HousekeepingTaskRow) {
    if (busyId) return;

    const agreed = await confirmDialog({
      title: `إنهاء تنظيف الوحدة ${task.unitNumber}`,
      description: `سيتم إنهاء مهمة تنظيف الوحدة ${task.unitNumber} وتحديث حالتها إلى نظيفة.`,
      confirmLabel: "إنهاء التنظيف",
      tone: "info",
    });
    if (!agreed) return;

    setBusyId(task.id);
    const result = await completeTaskAction({ taskId: task.id });
    setBusyId(null);

    if (result.ok) {
      toast.success(`اكتمل تنظيف الوحدة ${task.unitNumber}`);
      router.refresh();
      return;
    }
    toast.error("تعذّر إنهاء المهمة", result.error);
  }

  if (tasks.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-content">
          <ClipboardCheck className="size-4 text-content-muted" aria-hidden />
          مهامي
        </h2>
        <p className="py-8 text-center text-[13px] text-content-subtle">
          لا توجد مهام مسندة إليك الآن.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-brand-300 bg-surface p-4">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-content">
        <ClipboardCheck className="size-4 text-brand-700" aria-hidden />
        مهامي
        <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[12px] tabular-nums text-brand-700">
          {tasks.length}
        </span>
      </h2>

      <ul className="mt-3 space-y-2">
        {tasks.map((task) => {
          const room = statusMeta(HOUSEKEEPING_STATUS, task.housekeepingStatus);
          const work = statusMeta(HOUSEKEEPING_TASK_STATUS, task.status);
          const priority = statusMeta(PRIORITY, task.priority);
          const running = task.status === "IN_PROGRESS";

          return (
            <li key={task.id} className="rounded-lg border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[20px] font-semibold tabular-nums text-content">
                    {task.unitNumber}
                  </p>
                  <p className="mt-0.5 text-[12px] text-content-muted">
                    {task.floor === null ? "بدون طابق" : `الطابق ${task.floor}`} · {room.label} ·{" "}
                    {work.label}
                  </p>
                  <p className="mt-0.5 text-[12px] text-content-subtle">
                    مضى {formatAge(task.ageMinutes)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-1 text-[12px] font-medium ${
                    priority.tone === "danger"
                      ? "bg-danger-bg text-danger-fg"
                      : priority.tone === "warn"
                        ? "bg-warn-bg text-warn-fg"
                        : "bg-surface-inset text-content-muted"
                  }`}
                >
                  {priority.label}
                </span>
              </div>

              {task.notes && (
                <p className="mt-2 text-[12px] leading-relaxed text-content-muted">{task.notes}</p>
              )}

              {/* Full-width, thumb-sized: this is pressed one-handed while standing. */}
              <div className="mt-3 grid gap-2">
                {!running && (
                  <Button
                    size="lg"
                    variant="secondary"
                    icon={PlayCircle}
                    loading={busyId === task.id}
                    onClick={() => start(task)}
                    className="w-full"
                  >
                    بدء التنظيف
                  </Button>
                )}
                <Button
                  size="lg"
                  icon={CheckCircle2}
                  loading={busyId === task.id}
                  onClick={() => complete(task)}
                  className="w-full"
                >
                  إنهاء التنظيف
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
