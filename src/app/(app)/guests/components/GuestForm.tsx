"use client";

import { AlertTriangle, ArrowRight, Check, ShieldAlert, UserSearch } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button, Input, Select, Textarea, useToast } from "@/components/ui";
import { GENDERS, IDENTIFICATION_TYPES, identificationTypeLabel } from "@/lib/guest-identity";

import { createGuestAction, findCandidatesAction, updateGuestAction } from "../actions";

/**
 * The guest form, used for both creating and editing.
 *
 * A full page rather than a modal, deliberately: this is a dozen fields including a
 * duplicate warning that can list several profiles, and a dialog that size is
 * unusable on the phone reception actually holds. A page also gives the form a URL,
 * which makes the browser's back button behave and the half-filled state survivable.
 *
 * The duplicate check runs twice, and both times matter. It runs here as you type, so
 * a match is visible before the rest of the record is filled in; and it runs again in
 * the service on save, where it cannot be skipped by a client that chose not to ask.
 */

type Candidate = {
  guestId: string;
  fullName: string;
  mobile: string | null;
  identificationType: string | null;
  identificationMasked: string | null;
  severity: "document" | "mobile" | "email";
  reason: string;
};

export type GuestFormValues = {
  guestId?: string;
  fullName: string;
  mobile: string;
  email: string;
  nationality: string;
  identificationType: string;
  identificationNumber: string;
  dateOfBirth: string;
  gender: string;
  preferences: string;
  notes: string;
};

const BLANK: GuestFormValues = {
  fullName: "",
  mobile: "",
  email: "",
  nationality: "",
  identificationType: "",
  identificationNumber: "",
  dateOfBirth: "",
  gender: "",
  preferences: "",
  notes: "",
};

function readCandidates(fields: Record<string, string> | undefined): Candidate[] {
  if (!fields?.candidates) return [];
  try {
    const parsed: unknown = JSON.parse(fields.candidates);
    return Array.isArray(parsed) ? (parsed as Candidate[]) : [];
  } catch {
    return [];
  }
}

/** A profile that might already be this person. */
function CandidateCard({ candidate }: { candidate: Candidate }) {
  const hard = candidate.severity === "document";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-content">{candidate.fullName}</p>
        <p className="mt-0.5 truncate text-[12px] text-content-muted">
          {candidate.reason}
          {candidate.mobile && (
            <>
              {" · "}
              <span className="tabular-nums" dir="ltr">
                {candidate.mobile}
              </span>
            </>
          )}
          {candidate.identificationType && (
            <>
              {" · "}
              {identificationTypeLabel(candidate.identificationType)}{" "}
              <span className="tabular-nums" dir="ltr">
                {candidate.identificationMasked}
              </span>
            </>
          )}
        </p>
      </div>
      <Link
        href={`/guests/${candidate.guestId}`}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
          hard
            ? "bg-brand-600 text-white hover:bg-brand-700"
            : "border border-line text-content hover:bg-surface-inset"
        }`}
      >
        فتح الملف الموجود
      </Link>
    </li>
  );
}

export function GuestForm({
  mode,
  initial,
  nationalities,
}: {
  mode: "create" | "edit";
  initial?: GuestFormValues;
  nationalities: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = useState<GuestFormValues>(initial ?? BLANK);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  /** Set once the user has seen the matches and chosen to go ahead regardless. */
  const [acknowledged, setAcknowledged] = useState(false);

  const set = <K extends keyof GuestFormValues>(key: K, value: GuestFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    // Anything the user changes may change who they match; the decision resets with it.
    setAcknowledged(false);
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  /*
   * Live duplicate lookup, debounced. Runs on the three fields that identify a person
   * — never on the name, which in a directory of محمد and عبدالله would match
   * constantly and train reception to ignore the warning entirely.
   */
  const latest = useRef(0);
  useEffect(() => {
    const hasSomethingToMatch =
      values.mobile.trim().length >= 9 ||
      values.email.trim().length > 3 ||
      (values.identificationType !== "" && values.identificationNumber.trim().length >= 4);

    if (!hasSomethingToMatch) {
      setCandidates([]);
      return;
    }

    const token = ++latest.current;
    const timer = setTimeout(async () => {
      const found = await findCandidatesAction({
        mobile: values.mobile || null,
        email: values.email || null,
        identificationType: values.identificationType || null,
        identificationNumber: values.identificationNumber || null,
        excludeGuestId: values.guestId,
      });
      // Out-of-order responses must not overwrite a newer result.
      if (token === latest.current) setCandidates(found);
    }, 450);

    return () => clearTimeout(timer);
  }, [
    values.mobile,
    values.email,
    values.identificationType,
    values.identificationNumber,
    values.guestId,
  ]);

  const blocking = candidates.filter((candidate) => candidate.severity === "document");
  const warnings = candidates.filter((candidate) => candidate.severity !== "document");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      fullName: values.fullName,
      mobile: values.mobile,
      email: values.email,
      nationality: values.nationality,
      identificationType: values.identificationType || null,
      identificationNumber: values.identificationNumber || null,
      dateOfBirth: values.dateOfBirth || null,
      gender: values.gender || null,
      preferences: values.preferences,
      notes: values.notes,
      confirmDuplicate: acknowledged,
    };

    const result =
      mode === "edit" && values.guestId
        ? await updateGuestAction({ ...payload, guestId: values.guestId })
        : await createGuestAction(payload);

    if (result.ok) {
      toast.success(
        mode === "edit" ? "تم حفظ بيانات النزيل" : `تمت إضافة ${values.fullName.trim()}`,
      );
      router.push(`/guests/${result.guestId}`);
      router.refresh();
      return;
    }

    setSubmitting(false);
    setError(result.error);
    setFieldErrors(result.fields ?? {});

    const returned = readCandidates(result.fields);
    if (returned.length > 0) setCandidates(returned);
  }

  const heading = mode === "edit" ? "تعديل بيانات النزيل" : "إضافة نزيل";

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-danger-fg/25 bg-danger-bg px-4 py-3"
        >
          <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>
        </div>
      )}

      {/* A document already on file is a refusal, not a warning: two people cannot
          hold one passport, so the only useful action is opening the profile. */}
      {blocking.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-danger-fg/25 bg-danger-bg px-4 py-3.5"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger-fg" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-danger-fg">
                هذه الوثيقة مسجّلة لنزيل آخر
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-danger-fg/90">
                لا يمكن إنشاء ملف ثانٍ بنفس الوثيقة. افتح الملف الموجود وحدّثه.
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {blocking.map((candidate) => (
                  <CandidateCard key={candidate.guestId} candidate={candidate} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* A shared phone or inbox is normal — families and companies do it. So this is
          shown, acknowledged, and moved past, never enforced as an error. */}
      {blocking.length === 0 && warnings.length > 0 && (
        <div className="rounded-xl border border-warn-fg/25 bg-warn-bg px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn-fg" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-warn-fg">
                قد يكون هذا النزيل مسجّلًا لدينا
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-warn-fg/90">
                رقم الجوال أو البريد يطابق ملفات موجودة. هذا طبيعي بين أفراد العائلة
                أو موظفي شركة واحدة — راجع الملفات ثم تابع إن كان شخصًا مختلفًا.
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {warnings.map((candidate) => (
                  <CandidateCard key={candidate.guestId} candidate={candidate} />
                ))}
              </ul>
              <label className="mt-3 flex items-start gap-2.5 text-[12px] text-warn-fg">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-line accent-brand-600"
                />
                <span>راجعت الملفات أعلاه، وهذا شخص مختلف. تابع الحفظ.</span>
              </label>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold text-content">البيانات الأساسية</h2>
        <p className="mt-1 text-[12px] text-content-muted">
          الاسم وحده كافٍ لإنشاء الملف. بقية الوثائق تُطلب عند تسجيل الدخول الفعلي.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="الاسم الكامل"
            required
            value={values.fullName}
            onChange={(event) => set("fullName", event.target.value)}
            placeholder="محمد بن عبدالله الشهري"
            error={fieldErrors.fullName}
            autoComplete="name"
            data-autofocus
          />
          <Input
            label="رقم الجوال"
            type="tel"
            dir="ltr"
            value={values.mobile}
            onChange={(event) => set("mobile", event.target.value)}
            placeholder="05XXXXXXXX"
            hint="يُقبل أيضًا +966 أو 00966"
            error={fieldErrors.mobile}
            autoComplete="tel"
          />
          <Input
            label="البريد الإلكتروني"
            type="email"
            dir="ltr"
            value={values.email}
            onChange={(event) => set("email", event.target.value)}
            placeholder="name@example.com"
            error={fieldErrors.email}
            autoComplete="email"
          />
          <Input
            label="الجنسية"
            value={values.nationality}
            onChange={(event) => set("nationality", event.target.value)}
            list="guest-nationalities"
            placeholder="سعودي"
            error={fieldErrors.nationality}
          />
          <datalist id="guest-nationalities">
            {nationalities.map((nationality) => (
              <option key={nationality} value={nationality} />
            ))}
          </datalist>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold text-content">الوثيقة</h2>
        <p className="mt-1 text-[12px] text-content-muted">
          النوع والرقم معًا أو لا شيء — نصف الوثيقة لا يُعرّف أحدًا.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Select
            label="نوع الوثيقة"
            value={values.identificationType}
            onChange={(event) => set("identificationType", event.target.value)}
            placeholder="بدون وثيقة"
            error={fieldErrors.identificationType}
          >
            {IDENTIFICATION_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
          <Input
            label="رقم الوثيقة"
            dir="ltr"
            value={values.identificationNumber}
            onChange={(event) => set("identificationNumber", event.target.value)}
            placeholder="1098765432"
            error={fieldErrors.identificationNumber}
          />
          <Input
            label="تاريخ الميلاد"
            type="date"
            dir="ltr"
            value={values.dateOfBirth}
            onChange={(event) => set("dateOfBirth", event.target.value)}
            error={fieldErrors.dateOfBirth}
          />
          <Select
            label="الجنس"
            value={values.gender}
            onChange={(event) => set("gender", event.target.value)}
            placeholder="غير محدد"
            error={fieldErrors.gender}
          >
            {GENDERS.map((gender) => (
              <option key={gender.value} value={gender.value}>
                {gender.label}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold text-content">التفضيلات والملاحظات</h2>

        <div className="mt-4 space-y-4">
          <Textarea
            label="التفضيلات الدائمة"
            value={values.preferences}
            onChange={(event) => set("preferences", event.target.value)}
            placeholder="يفضل غرفة بعيدة عن المصعد · يفضل طابقًا مرتفعًا · يحتاج سرير طفل"
            // The distinction that keeps this field useful: a preference travels with
            // the guest, a request belongs to one booking.
            hint="ما يتكرر في كل إقامة. الطلبات الخاصة بحجز واحد تُسجَّل في الحجز نفسه."
            error={fieldErrors.preferences}
          />
          <Textarea
            label="ملاحظات تشغيلية"
            value={values.notes}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="وصل متأخرًا في الإقامة السابقة وطلب تمديد وقت المغادرة"
            hint="وقائع تشغيلية تفيد الفريق. تجنّب الأحكام الشخصية أو أي وصف لا يخدم الخدمة."
            error={fieldErrors.notes}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={values.guestId ? `/guests/${values.guestId}` : "/guests"}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-[13px] text-content transition-colors hover:bg-surface-inset"
        >
          <ArrowRight className="size-4" aria-hidden />
          إلغاء
        </Link>
        <Button
          type="submit"
          icon={mode === "edit" ? Check : UserSearch}
          loading={submitting}
          // Disabled on a hard conflict: the save cannot succeed, and offering it
          // anyway just costs a round trip to be told so.
          disabled={blocking.length > 0}
        >
          {mode === "edit" ? "حفظ التعديلات" : "إضافة النزيل"}
        </Button>
      </div>

      <p className="sr-only" aria-live="polite">
        {blocking.length > 0
          ? "لا يمكن الحفظ: الوثيقة مسجّلة لنزيل آخر."
          : warnings.length > 0
            ? `تم العثور على ${warnings.length} ملف قد يطابق هذا النزيل.`
            : ""}
      </p>

      <span className="sr-only">{heading}</span>
    </form>
  );
}
