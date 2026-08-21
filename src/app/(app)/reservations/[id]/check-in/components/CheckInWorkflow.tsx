"use client";

import {
  AlertTriangle,
  BedDouble,
  Check,
  DoorOpen,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button, Input, Select, Textarea, useConfirm, useToast } from "@/components/ui";
import { IDENTIFICATION_TYPES } from "@/lib/guest-identity";
import type { CheckInContext } from "@/server/services/checkin.service";

import { checkInAction, completeGuestForCheckInAction } from "../actions";

/**
 * The interactive half of the arrival screen.
 *
 * The single rule it exists to serve: **the receptionist must know what is blocking
 * the check-in before pressing the button, not after.** Missing guest fields, a room
 * that has not been chosen, a room that is dirty — each is stated where it happens and
 * summarised above the confirm button, and the button itself says why it is disabled.
 *
 * Nothing here decides anything. Eligibility, readiness and availability were computed
 * on the server and are recomputed there under lock when the form is submitted; this
 * component's copy is a rendering of that answer, which is why a submission can still
 * fail with a conflict and why that conflict is shown rather than swallowed.
 */

/** The possible-match list the guest module attaches to a soft duplicate. */
function parseCandidates(raw: string | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const HOUSEKEEPING_LABEL: Record<string, string> = {
  CLEAN: "نظيفة",
  INSPECTED: "نظيفة ومعتمدة",
  DIRTY: "تحتاج تنظيفًا",
  CLEANING: "قيد التنظيف الآن",
};

export function CheckInWorkflow({
  context,
  canEditGuests,
}: {
  context: CheckInContext;
  canEditGuests: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(context.stay.unitId);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorRef = useRef<HTMLDivElement>(null);

  // Focus follows the failure: a message that appears above the fold is not seen by
  // somebody whose hands are on the keyboard and eyes are on the guest.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const missing = context.guest.missing;
  const selectedRoom = context.rooms.find((room) => room.id === selectedUnitId) ?? null;

  const blockers: string[] = [];
  if (!context.eligibility.eligible) {
    blockers.push(context.eligibility.blockedReason ?? "لا يمكن تسجيل الوصول لهذا الحجز.");
  }
  if (missing.length > 0) {
    blockers.push(`بيانات النزيل غير مكتملة: ${missing.map((item) => item.label).join("، ")}.`);
  }
  if (context.eligibility.eligible && context.noRoomAvailable) {
    blockers.push("لا توجد وحدة جاهزة ومتاحة من النوع المحجوز لإتمام تسجيل الوصول.");
  } else if (context.eligibility.eligible && !selectedRoom) {
    blockers.push("اختر الوحدة التي سينزل فيها الضيف.");
  } else if (selectedRoom && !selectedRoom.available) {
    blockers.push(
      `الوحدة ${selectedRoom.unitNumber} ${selectedRoom.reasonLabel ?? "غير متاحة"} خلال الليالي المتبقية.`,
    );
  } else if (selectedRoom && !selectedRoom.ready) {
    blockers.push(
      `الوحدة ${selectedRoom.unitNumber} مخصصة لهذا الحجز لكنها تحتاج إلى تنظيف قبل تسجيل الوصول.`,
    );
  }

  const canSubmit = blockers.length === 0 && selectedRoom !== null;

  async function submit() {
    if (!selectedRoom || submitting) return;

    const agreed = await confirmDialog({
      title: "تأكيد تسجيل الوصول",
      // Names the guest, the room and the consequence — never "هل أنت متأكد؟".
      description: `سيتم تسجيل وصول ${context.guest.fullName} إلى الوحدة ${selectedRoom.unitNumber} وتغيير حالة الحجز إلى مقيم حاليًا.`,
      confirmLabel: "تسجيل الوصول",
      tone: "info",
    });
    if (!agreed) return;

    setSubmitting(true);
    setError(null);

    const result = await checkInAction({
      reservationId: context.reservationId,
      unitId: selectedRoom.id,
      notes: notes.trim() || null,
    });

    setSubmitting(false);

    if (result.ok) {
      toast.success(
        "تم تسجيل وصول النزيل بنجاح.",
        `${result.result.guestName} — الوحدة ${result.result.unitNumber}`,
      );
      // Straight to the stay record, refreshed from the server: the browser's copy of
      // this page describes a booking that no longer exists in that state.
      router.push(`/reservations/${context.reservationId}`);
      router.refresh();
      return;
    }

    setError(result.error);
  }

  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <GuestRequirements
          context={context}
          canEditGuests={canEditGuests}
          onSaved={() => router.refresh()}
        />
      )}

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-content">الوحدة وجاهزيتها</h2>
          <p className="text-[12px] text-content-subtle">
            التوفر محسوب لليالي المتبقية — من {context.stay.stayStartDate} حتى{" "}
            {context.stay.checkOutDate}
          </p>
        </div>

        {context.rooms.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-content-subtle">
            لا توجد وحدات من هذا النوع في المنشأة.
          </p>
        ) : (
          <fieldset>
            <legend className="sr-only">اختيار الوحدة</legend>
            {/* Cards, not a table: a room picker on a 390px phone must not scroll sideways. */}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {context.rooms.map((room) => (
                <RoomOption
                  key={room.id}
                  room={room}
                  checked={selectedUnitId === room.id}
                  onSelect={() => setSelectedUnitId(room.id)}
                />
              ))}
            </div>
          </fieldset>
        )}

        {context.noRoomAvailable && context.rooms.length > 0 && (
          <p
            role="status"
            className="mt-3 rounded-lg border border-warn-fg/25 bg-warn-bg px-3.5 py-3 text-[13px] leading-relaxed text-warn-fg"
          >
            لا توجد وحدة جاهزة ومتاحة من النوع المحجوز لإتمام تسجيل الوصول. لا تُرقّى فئة
            الوحدة من هنا — راجع النظافة أو الإيقافات، أو اختر معالجة أخرى.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-[14px] font-semibold text-content">الطلبات والملاحظات</h2>

        {context.requests.specialRequests ? (
          <div className="mb-4 rounded-lg bg-surface-inset px-3.5 py-3">
            <p className="text-[12px] text-content-muted">طلبات النزيل</p>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-content">
              {context.requests.specialRequests}
            </p>
          </div>
        ) : (
          <p className="mb-4 text-[13px] text-content-subtle">لا توجد طلبات خاصة بهذا الحجز.</p>
        )}

        <Textarea
          label="ملاحظة تشغيلية عند الوصول"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="وصل متأخرًا · طلب طابقًا علويًا · مرافق إضافي"
          hint="اختيارية. تُحفظ في الملاحظات الداخلية للحجز."
        />
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-[14px] font-semibold text-content">تأكيد تسجيل الوصول</h2>

        {error && (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="mb-3 rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3 outline-none"
          >
            <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>
          </div>
        )}

        {blockers.length > 0 ? (
          <ul className="mb-3 space-y-1.5 rounded-lg border border-line bg-surface-muted px-3.5 py-3">
            {[...new Set(blockers)].map((reason) => (
              <li
                key={reason}
                className="flex items-start gap-2 text-[12px] leading-relaxed text-content-muted"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn-fg" aria-hidden />
                {reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 flex items-start gap-2 text-[13px] leading-relaxed text-content-muted">
            <Check className="mt-0.5 size-4 shrink-0 text-ok-fg" aria-hidden />
            {`جاهز: ${context.guest.fullName} إلى الوحدة ${selectedRoom?.unitNumber ?? ""}.`}
          </p>
        )}

        <Button icon={UserCheck} loading={submitting} disabled={!canSubmit} onClick={submit}>
          تسجيل الوصول
        </Button>
      </section>
    </div>
  );
}

/**
 * One room, as a selectable card.
 *
 * The radio is a real radio, visually hidden inside its own label — so the whole card
 * is a hit target on a phone while arrow keys still move between rooms and a screen
 * reader still announces a radio group.
 */
function RoomOption({
  room,
  checked,
  onSelect,
}: {
  room: CheckInContext["rooms"][number];
  checked: boolean;
  onSelect: () => void;
}) {
  const tone = room.selectable
    ? checked
      ? "border-brand-500 bg-brand-50"
      : "border-line hover:border-content-subtle"
    : "border-line bg-surface-muted";

  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${tone} ${
        room.selectable ? "" : "cursor-not-allowed opacity-70"
      }`}
    >
      <input
        type="radio"
        name="checkin-unit"
        value={room.id}
        checked={checked}
        disabled={!room.selectable}
        onChange={onSelect}
        className="sr-only"
      />
      <BedDouble
        className={`mt-0.5 size-4 shrink-0 ${checked ? "text-brand-700" : "text-content-muted"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium tabular-nums text-content">
            وحدة {room.unitNumber}
          </span>
          {room.assigned && (
            <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[11px] text-content-muted">
              مخصصة للحجز
            </span>
          )}
          {checked && <Check className="size-3.5 text-brand-700" aria-hidden />}
        </div>

        <p className="mt-1 text-[12px] text-content-muted">
          {room.floor === null ? "بدون طابق" : `الطابق ${room.floor}`}
        </p>

        {/* Availability and readiness stated separately — they are different problems. */}
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px]">
          {room.available ? (
            <>
              <DoorOpen className="size-3.5 text-ok-fg" aria-hidden />
              <span className="text-ok-fg">متاحة لليالي المتبقية</span>
            </>
          ) : (
            <>
              <AlertTriangle className="size-3.5 text-warn-fg" aria-hidden />
              <span className="text-warn-fg">
                {room.reasonLabel ?? "غير متاحة"}
                {room.heldByReservationNumber && ` — حجز ${room.heldByReservationNumber}`}
              </span>
            </>
          )}
        </p>

        <p className="mt-1 flex items-center gap-1.5 text-[12px]">
          <Sparkles
            className={`size-3.5 ${room.ready ? "text-ok-fg" : "text-warn-fg"}`}
            aria-hidden
          />
          <span className={room.ready ? "text-content-muted" : "text-warn-fg"}>
            {HOUSEKEEPING_LABEL[room.housekeepingStatus] ?? room.housekeepingStatus}
          </span>
        </p>
      </div>
    </label>
  );
}

/**
 * The fields that must be on the record before a key changes hands.
 *
 * Shown as its own step rather than as errors on the submit button, because the fix is
 * a conversation with the guest standing at the desk — "may I see your ID" — not a
 * correction to something already typed.
 */
function GuestRequirements({
  context,
  canEditGuests,
  onSaved,
}: {
  context: CheckInContext;
  canEditGuests: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();

  const [values, setValues] = useState({
    fullName: context.guest.fullName ?? "",
    mobile: context.guest.mobile ?? "",
    nationality: context.guest.nationality ?? "",
    identificationType: context.guest.identificationType ?? "",
    identificationNumber: canEditGuests ? (context.guest.identificationDisplay ?? "") : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  /*
   * Two kinds of duplicate, two outcomes. A document already on another profile is a
   * hard stop — reception must not be able to move somebody else's identity onto this
   * guest. A shared phone number is a family, a company account or a receptionist's
   * own number, and stopping there with no way forward would leave a guest standing at
   * the desk while the system refuses for a reason that is usually not a problem.
   */
  const [similar, setSimilar] = useState<
    Array<{ guestId: string; fullName: string; reason: string; identificationMasked: string | null }>
  >([]);

  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const needed = new Set(context.guest.missing.map((item) => item.field));

  async function save(event: FormEvent<HTMLFormElement>, confirmDuplicate = false) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    setFields({});
    if (!confirmDuplicate) setSimilar([]);

    const result = await completeGuestForCheckInAction({
      guestId: context.guest.id,
      ...values,
      confirmDuplicate,
    });

    setSaving(false);

    if (result.ok) {
      toast.success("تم تحديث بيانات النزيل.");
      setSimilar([]);
      onSaved();
      return;
    }

    setFields(result.fields ?? {});

    const candidates = parseCandidates(result.fields?.candidates);
    // A soft match is shown so it can be judged, not swallowed and not made fatal.
    setSimilar(result.code === "CONFLICT" ? candidates : []);

    setError(
      result.code === "DUPLICATE"
        ? `${result.error} لا يمكن نقل الحجز إلى ملف آخر من هنا — راجع الملف المطابق من شاشة النزلاء.`
        : result.error,
    );
  }

  return (
    <section className="rounded-xl border border-warn-fg/30 bg-warn-bg/40 p-4">
      <h2 className="mb-1 text-[14px] font-semibold text-content">
        بيانات مطلوبة قبل تسجيل الوصول
      </h2>
      <p className="mb-3 text-[12px] leading-relaxed text-content-muted">
        {`ناقص: ${context.guest.missing.map((item) => item.label).join("، ")}. هذه متطلبات تشغيلية للنظام، وليست إقرارًا بالتوافق مع أي جهة تسجيل حكومية.`}
      </p>

      {!canEditGuests ? (
        <p className="rounded-lg border border-line bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-content-muted">
          لا تملك صلاحية تعديل بيانات النزلاء. اطلب من زميل لديه الصلاحية استكمال البيانات
          الناقصة قبل تسجيل الوصول.
        </p>
      ) : (
        <form onSubmit={save} className="space-y-3">
          {error && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3 outline-none"
            >
              <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="الاسم الكامل"
              required={needed.has("fullName")}
              value={values.fullName}
              error={fields.fullName}
              onChange={(event) => setValues({ ...values, fullName: event.target.value })}
            />
            <Input
              label="رقم الجوال"
              required={needed.has("mobile")}
              value={values.mobile}
              error={fields.mobile}
              dir="ltr"
              placeholder="05XXXXXXXX"
              onChange={(event) => setValues({ ...values, mobile: event.target.value })}
            />
            <Input
              label="الجنسية"
              required={needed.has("nationality")}
              value={values.nationality}
              error={fields.nationality}
              onChange={(event) => setValues({ ...values, nationality: event.target.value })}
            />
            <Select
              label="نوع الوثيقة"
              required={needed.has("identificationType")}
              value={values.identificationType}
              error={fields.identificationType}
              onChange={(event) =>
                setValues({ ...values, identificationType: event.target.value })
              }
            >
              <option value="">اختر النوع</option>
              {IDENTIFICATION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
            <Input
              label="رقم الوثيقة"
              required={needed.has("identificationNumber")}
              value={values.identificationNumber}
              error={fields.identificationNumber}
              dir="ltr"
              onChange={(event) =>
                setValues({ ...values, identificationNumber: event.target.value })
              }
            />
          </div>

          {similar.length > 0 && (
            <div className="rounded-lg border border-line bg-surface px-3.5 py-3">
              <p className="text-[13px] font-medium text-content">ملفات مشابهة</p>
              <ul className="mt-2 space-y-1.5">
                {similar.map((candidate) => (
                  <li key={candidate.guestId} className="text-[12px] text-content-muted">
                    {candidate.fullName}
                    {candidate.identificationMasked && ` · ${candidate.identificationMasked}`}
                    {` — ${candidate.reason}`}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-relaxed text-content-subtle">
                تشابه في الجوال أو البريد لا يعني بالضرورة تكرارًا. راجع الملفات أعلاه، ثم تابع
                إذا كان هذا النزيل مختلفًا فعلًا.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" loading={saving}>
              حفظ بيانات النزيل
            </Button>
            {similar.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={saving}
                onClick={(event) => save(event as never, true)}
              >
                متابعة رغم التشابه
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
