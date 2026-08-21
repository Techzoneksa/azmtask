"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Modal, Select, Textarea, useToast } from "@/components/ui";
import { HOUSEKEEPING_STATUS, statusMeta } from "@/lib/status";
import type { UnattendedRoom } from "@/server/services/housekeeping.service";

import { createTaskAction } from "../actions";

/**
 * Rooms that need attention and have nobody on them.
 *
 * The gap a task list cannot show. A board built only from tasks is silent about the
 * room a departing guest left that nobody raised work for — and that is precisely the
 * room reception discovers at check-in with a guest standing at the desk. So it is
 * surfaced as its own panel, with the one action that closes it.
 */
export function UnattendedRooms({
  rooms,
  employees,
  canManage,
}: {
  rooms: UnattendedRoom[];
  employees: Array<{ id: string; name: string; openTasks?: number }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState<UnattendedRoom | null>(null);
  const [taskType, setTaskType] = useState("CHECKOUT_CLEANING");
  const [priority, setPriority] = useState("HIGH");
  const [assignee, setAssignee] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!open || saving) return;

    setSaving(true);
    setError(null);

    const result = await createTaskAction({
      unitId: open.unitId,
      taskType,
      priority,
      assignedEmployeeId: assignee || null,
      notes: notes.trim() || null,
    });

    setSaving(false);

    if (result.ok) {
      toast.success(`أُنشئت مهمة تنظيف للوحدة ${open.unitNumber}`);
      setOpen(null);
      setNotes("");
      setAssignee("");
      router.refresh();
      return;
    }
    setError(result.error);
  }

  if (rooms.length === 0) return null;

  return (
    <>
      <section className="rounded-xl border border-warn-fg/30 bg-warn-bg/30 p-4">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-content">
          <AlertTriangle className="size-4 text-warn-fg" aria-hidden />
          وحدات تحتاج تنظيفًا بلا مهمة مفتوحة
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-content-muted">
          هذه الوحدات ليست جاهزة لاستقبال نزيل ولا يوجد من يعمل عليها. أنشئ مهمة حتى تظهر في
          قائمة العمل.
        </p>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            const state = statusMeta(HOUSEKEEPING_STATUS, room.housekeepingStatus);
            return (
              <li
                key={room.unitId}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium tabular-nums text-content">
                    وحدة {room.unitNumber}
                  </p>
                  <p className="mt-0.5 text-[12px] text-content-muted">
                    {room.floor === null ? "بدون طابق" : `الطابق ${room.floor}`} · {state.label}
                    {room.occupied && " · مشغولة بنزيل"}
                  </p>
                </div>

                {canManage && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Plus}
                    onClick={() => {
                      setOpen(room);
                      // An occupied room cannot take a turnover clean; offer the one
                      // kind of work that is legitimate there.
                      setTaskType(room.occupied ? "STAY_OVER" : "CHECKOUT_CLEANING");
                      setError(null);
                    }}
                  >
                    مهمة
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Modal
        open={open !== null}
        onClose={() => {
          if (!saving) {
            setOpen(null);
            setError(null);
          }
        }}
        title={open ? `مهمة تنظيف للوحدة ${open.unitNumber}` : "مهمة تنظيف"}
        description="ستظهر المهمة في قائمة العمل فورًا، ولموظف النظافة في «مهامي» إذا أُسندت إليه."
        closeOnOverlay={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)} disabled={saving}>
              تراجع
            </Button>
            <Button type="submit" form="create-task-form" icon={Plus} loading={saving}>
              إنشاء المهمة
            </Button>
          </>
        }
      >
        <form id="create-task-form" onSubmit={create} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3">
              <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>
            </div>
          )}

          {open?.occupied && (
            <p className="rounded-lg border border-warn-fg/25 bg-warn-bg px-3.5 py-3 text-[12px] leading-relaxed text-warn-fg">
              الوحدة مشغولة بنزيل. تنظيف ما بعد المغادرة يُنشأ بعد إتمام المغادرة — المتاح هنا خدمة
              الغرفة أثناء الإقامة.
            </p>
          )}

          <Select
            label="نوع المهمة"
            value={taskType}
            onChange={(event) => setTaskType(event.target.value)}
            data-autofocus
          >
            {open?.occupied ? (
              <>
                <option value="STAY_OVER">خدمة أثناء الإقامة</option>
                <option value="TURNDOWN">تجهيز مسائي</option>
                <option value="OTHER">أخرى</option>
              </>
            ) : (
              <>
                <option value="CHECKOUT_CLEANING">تنظيف بعد المغادرة</option>
                <option value="DEEP_CLEANING">تنظيف عميق</option>
                <option value="INSPECTION">فحص وتجهيز</option>
                <option value="OTHER">أخرى</option>
              </>
            )}
          </Select>

          <Select
            label="الأولوية"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="URGENT">عاجلة</option>
            <option value="HIGH">عالية</option>
            <option value="NORMAL">عادية</option>
            <option value="LOW">منخفضة</option>
          </Select>

          <Select
            label="إسناد إلى"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            hint="اختياري — يمكن الإسناد لاحقًا من قائمة المهام."
          >
            <option value="">بدون إسناد</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
                {employee.openTasks !== undefined ? ` — ${employee.openTasks} مهمة مفتوحة` : ""}
              </option>
            ))}
          </Select>

          <Textarea
            label="ملاحظات"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="بقع على السجاد · طلب النزيل تغيير المفارش"
          />
        </form>
      </Modal>
    </>
  );
}
