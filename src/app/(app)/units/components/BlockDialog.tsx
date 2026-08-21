"use client";

import { CalendarX2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Input, Modal, Select, Textarea, useToast } from "@/components/ui";

import { blockUnitAction } from "../actions";

/**
 * Takes a room off the market.
 *
 * The interesting case is refusal. The server will not block a room that confirmed
 * guests are arriving into, and it names them; this dialog renders that list instead
 * of a generic failure, because "الوحدة 305 محجوزة" is not actionable and
 * "أحمد الغامدي، حجز R-2026-0412، من 24 إلى 27 أغسطس" is — the desk can move that
 * guest, or narrow the block around them.
 */

const REASONS: Array<{ value: string; label: string }> = [
  { value: "RENOVATION", label: "تجديد" },
  { value: "DEEP_CLEANING", label: "تنظيف عميق" },
  { value: "STAFF_USE", label: "استخدام الطاقم" },
  { value: "OWNER_USE", label: "استخدام المالك" },
  { value: "LONG_TERM_MAINTENANCE", label: "صيانة طويلة" },
  { value: "SEASONAL_CLOSURE", label: "إغلاق موسمي" },
  { value: "OTHER", label: "أخرى" },
];

type Conflict = {
  reservationId: string;
  reservationNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
};

/** The server sends the clashing reservations as JSON in a field error. */
function readConflicts(fields: Record<string, string> | undefined): Conflict[] {
  if (!fields?.conflicts) return [];
  try {
    const parsed: unknown = JSON.parse(fields.conflicts);
    return Array.isArray(parsed) ? (parsed as Conflict[]) : [];
  } catch {
    return [];
  }
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    day: "numeric",
    month: "long",
  }).format(date);
}

export function BlockDialog({
  open,
  onClose,
  unitId,
  unitNumber,
}: {
  open: boolean;
  onClose: () => void;
  unitId: string;
  unitNumber: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [reason, setReason] = useState("RENOVATION");
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  function reset() {
    setReason("RENOVATION");
    setNotes("");
    setStartDate("");
    setEndDate("");
    setError(null);
    setFieldErrors({});
    setConflicts([]);
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    setConflicts([]);

    const result = await blockUnitAction({
      unitId,
      reason,
      notes: notes.trim() === "" ? null : notes.trim(),
      // Omitted rather than empty: the server defaults the start to today.
      startDate: startDate === "" ? undefined : startDate,
      endDate: endDate === "" ? null : endDate,
    });

    if (result.ok) {
      toast.success(`تم إيقاف الوحدة ${unitNumber}`, "لن تظهر ضمن الوحدات المتاحة للبيع.");
      reset();
      onClose();
      router.refresh();
      return;
    }

    setSubmitting(false);
    setError(result.error);
    setFieldErrors(result.fields ?? {});
    setConflicts(readConflicts(result.fields));
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`إيقاف الوحدة ${unitNumber}`}
      description="الوحدة الموقوفة تخرج من الوحدات المتاحة ولا يمكن حجزها حتى إعادة تفعيلها."
      closeOnOverlay={false}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            إلغاء
          </Button>
          <Button
            type="submit"
            form="block-unit-form"
            variant="danger"
            icon={Lock}
            loading={submitting}
          >
            إيقاف الوحدة
          </Button>
        </>
      }
    >
      <form id="block-unit-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3"
          >
            <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>

            {conflicts.length > 0 && (
              <ul className="mt-2.5 space-y-1.5 border-t border-danger-fg/15 pt-2.5">
                {conflicts.map((conflict) => (
                  <li key={conflict.reservationId} className="flex items-start gap-2">
                    <CalendarX2
                      className="mt-0.5 size-3.5 shrink-0 text-danger-fg"
                      aria-hidden
                    />
                    <span className="text-[12px] leading-relaxed text-danger-fg">
                      <span className="font-medium">{conflict.guestName}</span>
                      {" — "}
                      <span className="tabular-nums">{conflict.reservationNumber}</span>
                      {" · من "}
                      {formatDay(conflict.checkInDate)}
                      {" إلى "}
                      {formatDay(conflict.checkOutDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Select
          label="سبب الإيقاف"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={fieldErrors.reason}
          data-autofocus
        >
          {REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="من تاريخ"
            type="date"
            dir="ltr"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            hint="اتركه فارغًا للبدء من اليوم"
            error={fieldErrors.startDate}
          />
          <Input
            label="حتى تاريخ"
            type="date"
            dir="ltr"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            hint="اتركه فارغًا لإيقاف مفتوح"
            error={fieldErrors.endDate}
          />
        </div>

        <Textarea
          label="ملاحظات"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="ما الذي يجري في الوحدة؟"
          error={fieldErrors.notes}
        />
      </form>
    </Modal>
  );
}
