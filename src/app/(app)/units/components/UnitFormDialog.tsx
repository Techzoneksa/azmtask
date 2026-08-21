"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button, Input, Modal, Select, Textarea, useToast } from "@/components/ui";

import { createUnitAction, updateUnitAction } from "../actions";

/**
 * Creates or edits a unit's descriptive data.
 *
 * Status, housekeeping and maintenance are absent by design: they are derived from
 * stays, tasks and work orders, and a form that could set them would let the board
 * claim a room is free while a guest is asleep in it.
 */

export type UnitTypeOption = {
  id: string;
  name: string;
  capacity: number;
};

export type UnitFormValues = {
  unitId: string;
  unitNumber: string;
  unitTypeId: string;
  floor: number | null;
  notes: string | null;
};

export function UnitFormDialog({
  open,
  onClose,
  unitTypes,
  unit,
}: {
  open: boolean;
  onClose: () => void;
  unitTypes: UnitTypeOption[];
  /** Present for an edit, absent for a create. */
  unit?: UnitFormValues;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = unit !== undefined;

  const [unitNumber, setUnitNumber] = useState(unit?.unitNumber ?? "");
  const [unitTypeId, setUnitTypeId] = useState(unit?.unitTypeId ?? "");
  const [floor, setFloor] = useState(unit?.floor === null || unit?.floor === undefined ? "" : String(unit.floor));
  const [notes, setNotes] = useState(unit?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reopening after a cancelled edit should show the unit as it stands, not the
  // half-typed values from last time.
  useEffect(() => {
    if (!open) return;
    setUnitNumber(unit?.unitNumber ?? "");
    setUnitTypeId(unit?.unitTypeId ?? "");
    setFloor(unit?.floor === null || unit?.floor === undefined ? "" : String(unit.floor));
    setNotes(unit?.notes ?? "");
    setError(null);
    setFieldErrors({});
  }, [open, unit]);

  function close() {
    if (submitting) return;
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      unitNumber: unitNumber.trim(),
      unitTypeId,
      floor: floor.trim() === "" ? null : Number(floor),
      notes: notes.trim() === "" ? null : notes.trim(),
    };

    const result = editing
      ? await updateUnitAction({ ...payload, unitId: unit.unitId })
      : await createUnitAction(payload);

    if (result.ok) {
      toast.success(
        editing ? `تم حفظ الوحدة ${payload.unitNumber}` : `تمت إضافة الوحدة ${payload.unitNumber}`,
      );
      onClose();
      router.refresh();
      return;
    }

    setSubmitting(false);
    setError(result.error);
    setFieldErrors(result.fields ?? {});
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? `تعديل الوحدة ${unit.unitNumber}` : "إضافة وحدة"}
      description={
        editing
          ? "الحالة والنظافة والصيانة تُشتق من العمليات ولا تُعدَّل من هنا."
          : "تُضاف الوحدة متاحة ونظيفة، ثم تتبع حالتها العمليات."
      }
      closeOnOverlay={false}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            إلغاء
          </Button>
          <Button type="submit" form="unit-form" icon={Check} loading={submitting}>
            {editing ? "حفظ التعديلات" : "إضافة الوحدة"}
          </Button>
        </>
      }
    >
      <form id="unit-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3"
          >
            <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="رقم الوحدة"
            required
            value={unitNumber}
            onChange={(event) => setUnitNumber(event.target.value)}
            placeholder="305"
            error={fieldErrors.unitNumber}
            data-autofocus
          />
          <Input
            label="الطابق"
            type="number"
            min={0}
            max={200}
            value={floor}
            onChange={(event) => setFloor(event.target.value)}
            placeholder="3"
            hint="اختياري"
            error={fieldErrors.floor}
          />
        </div>

        <Select
          label="نوع الوحدة"
          required
          value={unitTypeId}
          onChange={(event) => setUnitTypeId(event.target.value)}
          placeholder="اختر النوع"
          error={fieldErrors.unitTypeId}
        >
          {unitTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} — {type.capacity} أشخاص
            </option>
          ))}
        </Select>

        <Textarea
          label="ملاحظات"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="إطلالة، تجهيزات خاصة، أي شيء يخص هذه الوحدة تحديدًا"
          error={fieldErrors.notes}
        />
      </form>
    </Modal>
  );
}
