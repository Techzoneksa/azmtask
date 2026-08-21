"use client";

import { BedDouble, CalendarDays, Check, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Button, Input, Select, Textarea, useToast } from "@/components/ui";
import { formatAmount } from "@/lib/format";
import { RESERVATION_SOURCE } from "@/lib/status";
import type { AvailabilityResult } from "@/server/services/availability.service";

import {
  checkAvailabilityAction,
  createReservationAction,
  updateReservationAction,
} from "../actions";
import { GuestPicker, type GuestOption } from "./GuestPicker";

/**
 * The booking form.
 *
 * Built around one discipline: **the browser previews, the server decides.** The
 * availability shown here is the same function the save runs, and the price shown
 * here is a preview of a total the server computes again from the rate. Neither is
 * ever what gets stored, which is why a race between two receptionists ends in a
 * refusal rather than an oversell.
 *
 * The form is sectioned in the order the desk actually works: who is staying, when,
 * in what, for how much, and why they came. Availability is queried the moment dates
 * and type are both known, so the room list is never a guess.
 */

export type UnitTypeOption = {
  id: string;
  name: string;
  capacity: number;
  baseRate: string;
};

export type BookingFormValues = {
  reservationId?: string;
  guest: GuestOption | null;
  unitTypeId: string;
  unitId: string;
  checkInDate: string;
  checkOutDate: string;
  adults: string;
  children: string;
  nightlyRate: string;
  discount: string;
  source: string;
  status: string;
  specialRequests: string;
  internalNotes: string;
};

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00.000Z`);
  const b = Date.parse(`${checkOut}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function BookingForm({
  mode,
  unitTypes,
  vatRate,
  businessDate,
  initial,
  canOverrideRate,
}: {
  mode: "create" | "edit";
  unitTypes: UnitTypeOption[];
  /** Percentage, from the property's settings. Preview only — the server recomputes. */
  vatRate: string;
  businessDate: string;
  initial?: Partial<BookingFormValues>;
  canOverrideRate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const tomorrow = useMemo(() => {
    const date = new Date(`${businessDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }, [businessDate]);

  const [values, setValues] = useState<BookingFormValues>({
    guest: null,
    unitTypeId: "",
    unitId: "",
    // Defaults from the property's operating date, never the browser's clock.
    checkInDate: businessDate,
    checkOutDate: tomorrow,
    adults: "2",
    children: "0",
    nightlyRate: "",
    discount: "",
    source: "DIRECT",
    status: "CONFIRMED",
    specialRequests: "",
    internalNotes: "",
    ...initial,
  });

  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [guestOpen, setGuestOpen] = useState(false);

  /*
   * One key per form, generated once. A repeated submit carries the same key, and the
   * server answers the second with the booking the first made rather than creating a
   * second one. Regenerated only after a successful save.
   */
  const idempotencyKey = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `k-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
  );

  const set = <K extends keyof BookingFormValues>(key: K, value: BookingFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const nights = nightsBetween(values.checkInDate, values.checkOutDate);
  const selectedType = unitTypes.find((type) => type.id === values.unitTypeId) ?? null;

  // Picking a type suggests its rate; the desk may still negotiate away from it.
  useEffect(() => {
    if (selectedType && values.nightlyRate === "") {
      set("nightlyRate", selectedType.baseRate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType?.id]);

  /*
   * Availability is asked for the moment the three things that determine it are
   * known. Debounced, because a date input fires on every keystroke while someone
   * types a year.
   */
  const requestToken = useRef(0);
  useEffect(() => {
    if (!values.unitTypeId || nights < 1) {
      setAvailability(null);
      setAvailabilityError(null);
      return;
    }

    const token = ++requestToken.current;
    setChecking(true);

    const timer = setTimeout(async () => {
      const result = await checkAvailabilityAction({
        unitTypeId: values.unitTypeId,
        checkInDate: values.checkInDate,
        checkOutDate: values.checkOutDate,
        excludeReservationId: values.reservationId,
      });

      // An out-of-order response must not overwrite a newer one.
      if (token !== requestToken.current) return;
      setChecking(false);

      if (result.ok) {
        setAvailability(result.availability);
        setAvailabilityError(null);
        // A room that has just been taken cannot stay selected.
        setValues((current) =>
          current.unitId && !result.availability.availableUnitIds.includes(current.unitId)
            ? { ...current, unitId: "" }
            : current,
        );
      } else {
        setAvailability(null);
        setAvailabilityError(result.error);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [values.unitTypeId, values.checkInDate, values.checkOutDate, values.reservationId, nights]);

  /*
   * A preview, and labelled as one. The server prices the booking again from the rate
   * and the configured tax — this exists so the desk can quote a number before saving,
   * not so the browser can decide what the guest owes.
   */
  const preview = useMemo(() => {
    const rate = Number(values.nightlyRate || 0);
    const discount = Number(values.discount || 0);
    if (!Number.isFinite(rate) || nights < 1) return null;

    const subtotal = rate * nights;
    const taxable = Math.max(0, subtotal - (Number.isFinite(discount) ? discount : 0));
    const tax = Math.round(taxable * (Number(vatRate) / 100) * 100) / 100;
    return { subtotal, taxable, tax, total: taxable + tax };
  }, [values.nightlyRate, values.discount, nights, vatRate]);

  const soldOut = availability !== null && availability.remaining <= 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (!values.guest) {
      setFieldErrors({ guestId: "اختر النزيل أولًا" });
      setError("لم يُحدَّد النزيل.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const base = {
      guestId: values.guest.id,
      unitTypeId: values.unitTypeId,
      unitId: values.unitId || undefined,
      source: values.source,
      checkInDate: values.checkInDate,
      checkOutDate: values.checkOutDate,
      adults: values.adults,
      children: values.children,
      nightlyRate: values.nightlyRate,
      discount: values.discount || undefined,
      specialRequests: values.specialRequests || undefined,
      internalNotes: values.internalNotes || undefined,
    };

    const result =
      mode === "edit" && values.reservationId
        ? await updateReservationAction({
            ...base,
            reservationId: values.reservationId,
            unitId: values.unitId || null,
            specialRequests: values.specialRequests || null,
            internalNotes: values.internalNotes || null,
          })
        : await createReservationAction({
            ...base,
            status: values.status,
            idempotencyKey: idempotencyKey.current,
          });

    if (result.ok) {
      toast.success(
        mode === "edit"
          ? "تم حفظ الحجز"
          : `تم إنشاء الحجز ${result.reservationNumber ?? ""}`.trim(),
      );
      router.push(`/reservations/${result.reservationId}`);
      router.refresh();
      return;
    }

    setSubmitting(false);
    setError(result.error);
    setFieldErrors(result.fields ?? {});

    /*
     * A conflict means the calendar moved under the form. Re-reading availability
     * turns "that room is gone" into a list of the rooms that are not, which is the
     * only thing the desk can act on.
     */
    if (result.code === "CONFLICT") {
      const refreshed = await checkAvailabilityAction({
        unitTypeId: values.unitTypeId,
        checkInDate: values.checkInDate,
        checkOutDate: values.checkOutDate,
        excludeReservationId: values.reservationId,
      });
      if (refreshed.ok) setAvailability(refreshed.availability);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error && (
        <div role="alert" className="rounded-xl border border-danger-fg/25 bg-danger-bg px-4 py-3">
          <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>
        </div>
      )}

      <Section title="النزيل" step={1}>
        {values.guest ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-muted px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-content">
                {values.guest.fullName}
              </p>
              <p className="mt-0.5 truncate text-[12px] tabular-nums text-content-muted" dir="ltr">
                {values.guest.mobile ?? "بدون رقم جوال"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/guests/${values.guest.id}`}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-content transition-colors hover:bg-surface-inset"
              >
                فتح الملف
              </Link>
              <Button variant="ghost" size="sm" onClick={() => setGuestOpen(true)}>
                تغيير
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            icon={Search}
            onClick={() => setGuestOpen(true)}
            className="w-full sm:w-auto"
          >
            ابحث عن النزيل أو أضِف نزيلًا جديدًا
          </Button>
        )}
        {fieldErrors.guestId && (
          <p className="mt-2 text-[12px] text-danger-fg">{fieldErrors.guestId}</p>
        )}
      </Section>

      <Section title="الإقامة" step={2}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="تاريخ الوصول"
            type="date"
            dir="ltr"
            required
            value={values.checkInDate}
            onChange={(event) => set("checkInDate", event.target.value)}
            error={fieldErrors.checkInDate}
          />
          <Input
            label="تاريخ المغادرة"
            type="date"
            dir="ltr"
            required
            value={values.checkOutDate}
            onChange={(event) => set("checkOutDate", event.target.value)}
            hint="يوم المغادرة غير محسوب"
            error={fieldErrors.checkOutDate}
          />
          <div className="flex items-end pb-1">
            <p className="text-[13px] text-content-muted">
              {nights > 0 ? (
                <>
                  <span className="font-medium tabular-nums text-content">{nights}</span> ليلة
                </>
              ) : (
                <span className="text-danger-fg">التواريخ غير صالحة</span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="عدد البالغين"
            type="number"
            min={1}
            max={20}
            required
            value={values.adults}
            onChange={(event) => set("adults", event.target.value)}
            error={fieldErrors.adults}
          />
          <Input
            label="عدد الأطفال"
            type="number"
            min={0}
            max={20}
            value={values.children}
            onChange={(event) => set("children", event.target.value)}
            error={fieldErrors.children}
          />
        </div>
      </Section>

      <Section title="الوحدة" step={3}>
        <Select
          label="نوع الوحدة"
          required
          value={values.unitTypeId}
          onChange={(event) => {
            set("unitTypeId", event.target.value);
            set("unitId", "");
          }}
          placeholder="اختر النوع"
          error={fieldErrors.unitTypeId}
        >
          {unitTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} — {type.capacity} أشخاص · {formatAmount(type.baseRate)}
            </option>
          ))}
        </Select>

        <div className="mt-4">
          {checking && (
            <p className="flex items-center gap-2 text-[13px] text-content-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              جارٍ فحص التوفر…
            </p>
          )}

          {availabilityError && (
            <p role="alert" className="text-[13px] text-danger-fg">
              {availabilityError}
            </p>
          )}

          {!checking && availability && (
            <div className="space-y-3">
              <p className="text-[13px] text-content-muted" aria-live="polite">
                {soldOut ? (
                  <span className="text-danger-fg">
                    لا توجد وحدات متاحة من نوع {availability.unitTypeName} خلال الفترة المحددة.
                    جرّب تواريخ أخرى أو نوعًا آخر.
                  </span>
                ) : (
                  <>
                    متاح{" "}
                    <span className="font-medium tabular-nums text-content">
                      {availability.remaining}
                    </span>{" "}
                    من {availability.sellableUnits} وحدة قابلة للبيع
                    {availability.unassignedConsumed > 0 && (
                      <>
                        {" · "}
                        <span className="text-warn-fg">
                          {availability.unassignedConsumed} حجز مؤكد بلا وحدة محددة
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>

              {!soldOut && (
                <>
                  <fieldset>
                    <legend className="mb-2 text-[12px] font-medium text-content-muted">
                      اختر الوحدة (اختياري — يمكن تحديدها لاحقًا قرب موعد الوصول)
                    </legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      <label
                        className={`cursor-pointer rounded-lg border px-3 py-2.5 text-[13px] transition-colors ${
                          values.unitId === ""
                            ? "border-brand-500 bg-brand-50 text-brand-800"
                            : "border-line bg-surface text-content hover:bg-surface-inset"
                        }`}
                      >
                        <input
                          type="radio"
                          name="unitId"
                          value=""
                          checked={values.unitId === ""}
                          onChange={() => set("unitId", "")}
                          className="sr-only"
                        />
                        بلا وحدة محددة
                      </label>

                      {availability.units.map((unit) => {
                        const selectable = unit.available;
                        const selected = values.unitId === unit.id;
                        return (
                          <label
                            key={unit.id}
                            className={`rounded-lg border px-3 py-2.5 text-[13px] transition-colors ${
                              !selectable
                                ? "cursor-not-allowed border-line bg-surface-muted text-content-subtle"
                                : selected
                                  ? "cursor-pointer border-brand-500 bg-brand-50 text-brand-800"
                                  : "cursor-pointer border-line bg-surface text-content hover:bg-surface-inset"
                            }`}
                          >
                            <input
                              type="radio"
                              name="unitId"
                              value={unit.id}
                              checked={selected}
                              disabled={!selectable}
                              onChange={() => set("unitId", unit.id)}
                              className="sr-only"
                            />
                            <span className="flex items-center gap-1.5">
                              <BedDouble className="size-3.5 shrink-0 opacity-70" aria-hidden />
                              <span className="tabular-nums">{unit.unitNumber}</span>
                            </span>
                            <span className="mt-0.5 block text-[11px] opacity-80">
                              {unit.floor === null ? "—" : `طابق ${unit.floor}`}
                              {/* Unavailability is stated in words, never by colour alone. */}
                              {!selectable && ` · ${unit.reasonLabel}`}
                              {selectable && unit.needsPreparation && " · تحتاج تجهيزًا"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  {fieldErrors.unitId && (
                    <p className="text-[12px] text-danger-fg">{fieldErrors.unitId}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="السعر" step={4}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="سعر الليلة"
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            required
            value={values.nightlyRate}
            onChange={(event) => set("nightlyRate", event.target.value)}
            disabled={!canOverrideRate}
            hint={
              canOverrideRate
                ? "يبدأ من السعر الأساسي للنوع ويمكن تعديله"
                : "السعر الأساسي للنوع — لا تملك صلاحية تعديله"
            }
            error={fieldErrors.nightlyRate}
          />
          <Input
            label="خصم (مبلغ ثابت)"
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            value={values.discount}
            onChange={(event) => set("discount", event.target.value)}
            hint="مبلغ بالريال، لا نسبة مئوية"
            error={fieldErrors.discount}
          />
        </div>

        {preview && (
          <dl className="mt-4 space-y-1.5 rounded-lg border border-line bg-surface-muted p-3.5 text-[13px]">
            <Line label={`الإقامة (${nights} × ${formatAmount(values.nightlyRate || "0")})`} value={preview.subtotal} />
            {preview.subtotal !== preview.taxable && (
              <Line label="الخصم" value={-(preview.subtotal - preview.taxable)} />
            )}
            <Line label={`ضريبة القيمة المضافة (${vatRate}%)`} value={preview.tax} />
            <div className="flex items-center justify-between border-t border-line pt-1.5 font-medium">
              <dt className="text-content">الإجمالي</dt>
              <dd className="tabular-nums text-content">{formatAmount(preview.total.toFixed(2))}</dd>
            </div>
            <p className="pt-1 text-[11px] text-content-subtle">
              تقدير للعرض — يُحتسب المبلغ النهائي على الخادم عند الحفظ.
            </p>
          </dl>
        )}
      </Section>

      <Section title="المصدر والملاحظات" step={5}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="مصدر الحجز"
            required
            value={values.source}
            onChange={(event) => set("source", event.target.value)}
            error={fieldErrors.source}
          >
            {Object.entries(RESERVATION_SOURCE).map(([key, meta]) => (
              <option key={key} value={key.toUpperCase()}>
                {meta.label}
              </option>
            ))}
          </Select>

          {mode === "create" && (
            <Select
              label="حالة الحجز"
              value={values.status}
              onChange={(event) => set("status", event.target.value)}
              hint="المؤكد يحجز الوحدة فورًا؛ المبدئي استعلام لا يحجز شيئًا"
            >
              <option value="CONFIRMED">مؤكد</option>
              <option value="PENDING">مبدئي</option>
            </Select>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <Textarea
            label="طلبات النزيل"
            value={values.specialRequests}
            onChange={(event) => set("specialRequests", event.target.value)}
            placeholder="سرير إضافي · طابق مرتفع · وصول متأخر"
            hint="طلبات تخص هذه الإقامة تحديدًا. التفضيلات الدائمة تُسجَّل في ملف النزيل."
            error={fieldErrors.specialRequests}
          />
          <Textarea
            label="ملاحظات داخلية"
            value={values.internalNotes}
            onChange={(event) => set("internalNotes", event.target.value)}
            placeholder="ملاحظات للفريق فقط — لا تظهر للنزيل"
            error={fieldErrors.internalNotes}
          />
        </div>
      </Section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={values.reservationId ? `/reservations/${values.reservationId}` : "/reservations"}
          className="rounded-lg border border-line px-3.5 py-2 text-[13px] text-content transition-colors hover:bg-surface-inset"
        >
          إلغاء
        </Link>
        <Button
          type="submit"
          icon={mode === "edit" ? Check : CalendarDays}
          loading={submitting}
          // Offering a save that cannot succeed just costs a round trip to be told so.
          disabled={soldOut || nights < 1 || !values.unitTypeId}
        >
          {mode === "edit" ? "حفظ التعديلات" : "إنشاء الحجز"}
        </Button>
      </div>

      <GuestPicker
        open={guestOpen}
        onClose={() => setGuestOpen(false)}
        onPick={(guest) => {
          set("guest", guest);
          setGuestOpen(false);
          setFieldErrors((current) => {
            const next = { ...current };
            delete next.guestId;
            return next;
          });
        }}
      />
    </form>
  );
}

function Section({
  title,
  step,
  children,
}: {
  title: string;
  step: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2.5 text-[14px] font-semibold text-content">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] tabular-nums text-brand-700">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-content-muted">{label}</dt>
      <dd className="tabular-nums text-content">{formatAmount(value.toFixed(2))}</dd>
    </div>
  );
}
