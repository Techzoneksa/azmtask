"use client";

import { CheckCircle2, PlayCircle, UserPlus, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Modal, Select, Textarea, useConfirm, useToast } from "@/components/ui";

import { assignTaskAction, cancelTaskAction, completeTaskAction, startTaskAction } from "../actions";

/**
 * The controls on one cleaning task.
 *
 * Users choose actions, never a status. "إنهاء التنظيف" is a decision with a
 * consequence — the room becomes something reception can hand to a guest — and a
 * status dropdown would let anyone set any value without any of it happening.
 *
 * Which buttons appear follows from what the signed-in user may do *and* what the task
 * allows. Neither alone is enough: an attendant may complete work but not reassign it,
 * and nobody may start a task that is already finished. The server enforces both again,
 * so a hidden button is a courtesy rather than the control.
 */

export type TaskActionCapabilities = {
  /** Supervisory: assign, reassign, cancel. */
  canManage: boolean;
  /** Hands-on: start and finish the work. */
  canWork: boolean;
};

export function TaskActions({
  task,
  employees,
  capabilities,
  size = "sm",
}: {
  task: {
    id: string;
    unitNumber: string;
    status: string;
    assigneeId: string | null;
  };
  employees: Array<{ id: string; name: string; openTasks?: number }>;
  capabilities: TaskActionCapabilities;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [busy, setBusy] = useState<null | "start" | "complete">(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState(task.assigneeId ?? "");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const active = ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(task.status);
  const canStart = capabilities.canWork && (task.status === "PENDING" || task.status === "ASSIGNED");
  const canComplete = capabilities.canWork && active;

  async function start() {
    if (busy) return;
    setBusy("start");
    const result = await startTaskAction(task.id);
    setBusy(null);

    if (result.ok) {
      toast.success(`بدأ تنظيف الوحدة ${task.unitNumber}`);
      router.refresh();
      return;
    }
    toast.error("تعذّر بدء المهمة", result.error);
  }

  async function complete() {
    if (busy) return;

    const agreed = await confirmDialog({
      title: `إنهاء تنظيف الوحدة ${task.unitNumber}`,
      // Names the consequence, not "هل أنت متأكد؟".
      description: `سيتم إنهاء مهمة تنظيف الوحدة ${task.unitNumber} وتحديث حالتها إلى نظيفة. تبقى الوحدة خارج البيع إذا كانت موقوفة أو تحت الصيانة.`,
      confirmLabel: "إنهاء التنظيف",
      tone: "info",
    });
    if (!agreed) return;

    setBusy("complete");
    const result = await completeTaskAction({ taskId: task.id });
    setBusy(null);

    if (result.ok) {
      toast.success(
        `اكتمل تنظيف الوحدة ${task.unitNumber}`,
        `حالة الوحدة الآن: ${result.result.unitStatus === "AVAILABLE" ? "متاحة" : result.result.unitStatus}`,
      );
      router.refresh();
      return;
    }
    toast.error("تعذّر إنهاء المهمة", result.error);
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (assigning) return;

    setAssigning(true);
    setAssignError(null);

    const result = await assignTaskAction({ taskId: task.id, employeeId: assignee || null });
    setAssigning(false);

    if (result.ok) {
      toast.success(assignee ? "تم إسناد المهمة" : "تم إلغاء الإسناد");
      setAssignOpen(false);
      router.refresh();
      return;
    }
    setAssignError(result.error);
  }

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cancelling) return;

    setCancelling(true);
    setCancelError(null);

    const result = await cancelTaskAction({ taskId: task.id, reason: reason.trim() });
    setCancelling(false);

    if (result.ok) {
      toast.success(
        `أُلغيت مهمة الوحدة ${task.unitNumber}`,
        "لم تتغيّر حالة نظافة الوحدة — ما زالت بحاجة إلى تنظيف.",
      );
      setCancelOpen(false);
      setReason("");
      router.refresh();
      return;
    }
    setCancelError(result.error);
  }

  if (!active) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {canStart && (
          <Button size={size} variant="secondary" icon={PlayCircle} loading={busy === "start"} onClick={start}>
            بدء التنظيف
          </Button>
        )}

        {canComplete && (
          <Button size={size} icon={CheckCircle2} loading={busy === "complete"} onClick={complete}>
            إنهاء التنظيف
          </Button>
        )}

        {capabilities.canManage && (
          <Button size={size} variant="ghost" icon={UserPlus} onClick={() => setAssignOpen(true)}>
            {task.assigneeId ? "تغيير الموظف" : "إسناد"}
          </Button>
        )}

        {capabilities.canManage && (
          <Button size={size} variant="ghost" icon={XCircle} onClick={() => setCancelOpen(true)}>
            إلغاء
          </Button>
        )}
      </div>

      <Modal
        open={assignOpen}
        onClose={() => {
          if (!assigning) {
            setAssignOpen(false);
            setAssignError(null);
          }
        }}
        title={`إسناد تنظيف الوحدة ${task.unitNumber}`}
        description="اختر موظف النظافة الذي سينفّذ المهمة، أو اترك الحقل فارغًا لإرجاعها إلى غير المسندة."
        closeOnOverlay={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)} disabled={assigning}>
              تراجع
            </Button>
            <Button type="submit" form="assign-task-form" icon={UserPlus} loading={assigning}>
              حفظ الإسناد
            </Button>
          </>
        }
      >
        <form id="assign-task-form" onSubmit={assign} className="space-y-4">
          {assignError && (
            <div role="alert" className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3">
              <p className="text-[13px] leading-relaxed text-danger-fg">{assignError}</p>
            </div>
          )}

          <Select
            label="موظف النظافة"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            hint="العدد بجانب الاسم هو المهام المفتوحة لديه الآن."
            data-autofocus
          >
            <option value="">بدون إسناد</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
                {employee.openTasks !== undefined ? ` — ${employee.openTasks} مهمة مفتوحة` : ""}
              </option>
            ))}
          </Select>
        </form>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => {
          if (!cancelling) {
            setCancelOpen(false);
            setCancelError(null);
          }
        }}
        title={`إلغاء مهمة الوحدة ${task.unitNumber}`}
        description="الإلغاء لا يعني أن الوحدة نُظِّفت. تبقى حالتها كما هي وتظل ظاهرة في قائمة ما يحتاج تنظيفًا."
        closeOnOverlay={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              تراجع
            </Button>
            <Button type="submit" form="cancel-task-form" variant="danger" icon={XCircle} loading={cancelling}>
              تأكيد الإلغاء
            </Button>
          </>
        }
      >
        <form id="cancel-task-form" onSubmit={cancel} className="space-y-4">
          {cancelError && (
            <div role="alert" className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3">
              <p className="text-[13px] leading-relaxed text-danger-fg">{cancelError}</p>
            </div>
          )}

          <Textarea
            label="سبب الإلغاء"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="الغرفة أُوقفت عن البيع · تكرار مهمة · تأجيل بطلب الإدارة"
            hint="مطلوب — يُحفظ مع المهمة باسمك ووقته."
            data-autofocus
          />
        </form>
      </Modal>
    </>
  );
}
