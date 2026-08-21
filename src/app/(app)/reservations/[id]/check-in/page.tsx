import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { Badge, PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { formatAmount, formatDateShort, formatMobile } from "@/lib/format";
import { identificationTypeLabel } from "@/lib/guest-identity";
import { PAYMENT_STATUS, RESERVATION_STATUS, statusMeta } from "@/lib/status";
import { AppError } from "@/server/errors";
import { CHECK_IN_PERMISSION, getCheckInContext } from "@/server/services/checkin.service";
import { getAccessiblePropertyIds } from "@/server/services/property.service";

import { CheckInWorkflow } from "./components/CheckInWorkflow";

/**
 * The arrival screen.
 *
 * A page rather than a dialog, deliberately. Checking a guest in means reviewing a
 * booking, completing a guest record, choosing a room, confirming it is fit to hand
 * over and looking at the balance — five things that do not fit in a modal, and that
 * reception should be able to leave half-finished, walk away from, and come back to
 * with a URL.
 *
 * Everything that could stop the check-in is shown before the button, not discovered
 * by pressing it. A receptionist who finds out the room is dirty only after telling
 * the guest they are checked in has been failed by the screen.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "تسجيل الوصول" };

const NONE = "—";

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Authorised before a single restricted fact is fetched: the eligible-room list and
  // the guest's identity are operational data, not something to fetch and then hide.
  const session = await requirePermission(CHECK_IN_PERMISSION);
  const { id } = await params;

  const propertyIds = await getAccessiblePropertyIds();

  let context;
  try {
    context = await getCheckInContext(id, propertyIds, new Set(session.permissions));
  } catch (error) {
    // A booking outside the caller's properties is indistinguishable from one that
    // never existed — deliberately, so an id cannot be probed.
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const canEditGuests = await can("guests.edit");
  const status = statusMeta(RESERVATION_STATUS, context.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`تسجيل وصول — حجز ${context.reservationNumber}`}
        description={`${context.guest.fullName} · ${context.stay.unitTypeName} · ${formatDateShort(context.stay.checkInDate)} ← ${formatDateShort(context.stay.checkOutDate)}`}
        actions={
          <Link
            href={`/reservations/${context.reservationId}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-content transition-colors hover:bg-surface-inset"
          >
            <ArrowRight className="size-4" aria-hidden />
            تفاصيل الحجز
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone as never}>{status.label}</Badge>
        {context.financial && (
          <Badge tone={statusMeta(PAYMENT_STATUS, context.financial.paymentStatus).tone as never}>
            {statusMeta(PAYMENT_STATUS, context.financial.paymentStatus).label}
          </Badge>
        )}
        {context.eligibility.lateArrival && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-warn-bg px-2.5 py-1 text-[12px] font-medium text-warn-fg">
            <AlertTriangle className="size-3.5" aria-hidden />
            وصول متأخر — بدأ الحجز في {formatDateShort(context.stay.checkInDate)}
          </span>
        )}
        <span className="text-[12px] text-content-subtle">
          يوم التشغيل {formatDateShort(context.businessDate)}
        </span>
      </div>

      {/*
        The static half of the screen: what was booked, and who for. Rendered on the
        server because none of it changes while the form is being filled in.
      */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-[14px] font-semibold text-content">الحجز</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Row label="المنشأة" value={context.propertyName} />
            <Row label="نوع الوحدة" value={context.stay.unitTypeName} />
            <Row label="الوصول" value={formatDateShort(context.stay.checkInDate)} />
            <Row label="المغادرة" value={formatDateShort(context.stay.checkOutDate)} />
            <Row
              label="الليالي"
              value={<span className="tabular-nums">{context.stay.nights}</span>}
            />
            <Row
              label="ليالٍ متبقية"
              value={<span className="tabular-nums">{context.stay.remainingNights}</span>}
            />
            <Row
              label="النزلاء"
              value={
                <span className="tabular-nums">
                  {context.stay.adults} بالغ
                  {context.stay.children > 0 && ` · ${context.stay.children} طفل`}
                </span>
              }
            />
            <Row
              label="الوحدة الحالية"
              value={
                context.stay.unitNumber ? (
                  <span className="tabular-nums">{context.stay.unitNumber}</span>
                ) : (
                  <span className="text-warn-fg">لم تُحدّد بعد</span>
                )
              }
            />
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-[14px] font-semibold text-content">النزيل</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Row label="الاسم" value={context.guest.fullName} />
            <Row label="الجنسية" value={context.guest.nationality ?? NONE} />
            <Row
              label="الجوال"
              value={
                context.guest.mobile ? (
                  <span className="tabular-nums" dir="ltr">
                    {formatMobile(context.guest.mobile)}
                  </span>
                ) : (
                  NONE
                )
              }
            />
            <Row
              label="البريد"
              value={
                context.guest.email ? (
                  <span className="break-all" dir="ltr">
                    {context.guest.email}
                  </span>
                ) : (
                  NONE
                )
              }
            />
            <Row
              label="الوثيقة"
              value={
                context.guest.identificationType
                  ? `${identificationTypeLabel(context.guest.identificationType)} · ${context.guest.identificationDisplay}`
                  : NONE
              }
            />
          </dl>
        </section>

        {context.financial ? (
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-[14px] font-semibold text-content">الحالة المالية</h2>
            <dl className="space-y-2 text-[13px]">
              <Line label="الإجمالي" value={context.financial.total} />
              <Line label="المسدَّد" value={context.financial.paidAmount} />
              <div className="flex items-center justify-between border-t border-line pt-2 font-medium">
                <dt className="text-content">المتبقي</dt>
                <dd
                  className={`tabular-nums ${Number(context.financial.balance) > 0 ? "text-warn-fg" : "text-content"}`}
                >
                  {formatAmount(context.financial.balance)}
                </dd>
              </div>
            </dl>
            {Number(context.financial.balance) > 0 && (
              /*
                Informational, not a gate. No payment policy has been configured, so
                refusing arrival over a balance would be this screen inventing one —
                and a guest standing at the desk at midnight is the worst possible
                place to discover a rule nobody agreed to.
              */
              <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-warn-fg">
                يوجد رصيد مستحق على هذا الحجز. تسجيل الوصول لا يُسدّد ولا يُغيّر أي مبلغ —
                التحصيل من شاشة المدفوعات.
              </p>
            )}
          </section>
        ) : (
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-3 text-[14px] font-semibold text-content">الحالة المالية</h2>
            <p className="py-6 text-center text-[13px] text-content-subtle">
              لا تملك صلاحية عرض البيانات المالية لهذا الحجز.
            </p>
          </section>
        )}
      </div>

      <CheckInWorkflow context={context} canEditGuests={canEditGuests} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-content-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-content">{value}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-content-muted">{label}</dt>
      <dd className="tabular-nums text-content-muted">{formatAmount(value)}</dd>
    </div>
  );
}
