"use client";

import { BadgeCheck, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Modal, Select, Textarea, useConfirm, useToast } from "@/components/ui";

import { inspectUnitAction, reopenCleaningAction } from "../actions";

/**
 * The supervisor's two judgements about a room: it is ready, or it is not.
 *
 * Inspection is a stronger claim than "cleaned" — somebody checked — and it is stored
 * with a name and a time, because "who said this room was ready" is the first question
 * asked when it turns out it was not.
 *
 * Sending a room back requires a reason. A room that silently became dirty again is a
 * mystery the next shift inherits; "الحمام لم يُنظَّف" is a fact somebody can act on.
 */
export function ReadinessActions({
  unit,
  size = "sm",
}: {
  unit: { id: string; unitNumber: string; housekeepingStatus: string };
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [inspecting, setInspecting] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState("HIGH");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canInspect = unit.housekeepingStatus === "CLEAN";
  const canReopen = unit.housekeepingStatus === "CLEAN" || unit.housekeepingStatus === "INSPECTED";

  async function inspect() {
    if (inspecting) return;

    const agreed = await confirmDialog({
      title: `اعتماد جاهزية الوحدة ${unit.unitNumber}`,
      description: `سيتم تسجيل أن الوحدة ${unit.unitNumber} فُحصت واعتُمدت باسمك ووقت الاعتماد. الوحدة جاهزة لاستقبال نزيل في الحالتين — الاعتماد إقرار بالجودة.`,
      confirmLabel: "اعتماد الجاهزية",
      tone: "info",
    });
    if (!agreed) return;

    setInspecting(true);
    const result = await inspectUnitAction(unit.id);
    setInspecting(false);

    if (result.ok) {
      toast.success(`اعتُمدت جاهزية الوحدة ${unit.unitNumber}`);
      router.refresh();
      return;
    }
    toast.error("تعذّر اعتماد الوحدة", result.error);
  }

  async function reopen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);

    const result = await reopenCleaningAction({
      unitId: unit.id,
      reason: reason.trim(),
      priority,
    });

    setSaving(false);

    if (result.ok) {
      toast.success(
        `أُعيدت الوحدة ${unit.unitNumber} إلى التنظيف`,
        "أُنشئت مهمة تنظيف جديدة إن لم تكن هناك واحدة مفتوحة.",
      );
      setReopenOpen(false);
      setReason("");
      router.refresh();
      return;
    }
    setError(result.error);
  }

  if (!canInspect && !canReopen) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {canInspect && (
          <Button size={size} variant="secondary" icon={BadgeCheck} loading={inspecting} onClick={inspect}>
            اعتماد الجاهزية
          </Button>
        )}
        {canReopen && (
          <Button size={size} variant="ghost" icon={RotateCcw} onClick={() => setReopenOpen(true)}>
            إعادة إلى التنظيف
          </Button>
        )}
      </div>

      <Modal
        open={reopenOpen}
        onClose={() => {
          if (!saving) {
            setReopenOpen(false);
            setError(null);
          }
        }}
        title={`إعادة الوحدة ${unit.unitNumber} إلى التنظيف`}
        description="ستعود حالة الوحدة إلى «تحتاج تنظيف» وتخرج من قائمة الوحدات الجاهزة لاستقبال النزلاء."
        closeOnOverlay={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopenOpen(false)} disabled={saving}>
              تراجع
            </Button>
            <Button type="submit" form="reopen-form" variant="danger" icon={RotateCcw} loading={saving}>
              تأكيد الإعادة
            </Button>
          </>
        }
      >
        <form id="reopen-form" onSubmit={reopen} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3">
              <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>
            </div>
          )}

          <Textarea
            label="سبب الإعادة"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="الحمّام لم يُنظَّف · المفارش لم تُبدَّل · رائحة في الغرفة"
            hint="مطلوب — يُحفظ مع المهمة الجديدة حتى يعرف الموظف ما الذي يجب إصلاحه."
            data-autofocus
          />

          <Select label="أولوية إعادة التنظيف" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="URGENT">عاجلة</option>
            <option value="HIGH">عالية</option>
            <option value="NORMAL">عادية</option>
          </Select>
        </form>
      </Modal>
    </>
  );
}
