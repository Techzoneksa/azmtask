import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Ban, BedDouble, UserCheck, UserX } from "lucide-react";

import { Badge, PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import {
  formatAmount,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatMobile,
} from "@/lib/format";
import { identificationTypeLabel } from "@/lib/guest-identity";
import {
  INVOICE_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  RESERVATION_SOURCE,
  RESERVATION_STATUS,
  statusMeta,
} from "@/lib/status";
import { AppError } from "@/server/errors";
import { getAccessiblePropertyIds } from "@/server/services/property.service";
import { getReservationDetail } from "@/server/services/reservation.service";

import { ReservationActions } from "../components/ReservationActions";

/**
 * One booking, in full.
 *
 * The canonical page for a reservation: what was agreed, who it is for, what it costs,
 * and what has happened to it. Everything financial is absent rather than hidden when
 * the reader may not see it — the service does not fetch it in the first place.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "تفاصيل الحجز" };

const NONE = "—";
const UNASSIGNED = "لم تُحدّد الوحدة بعد";

function Panel({
  title,
  children,
  note,
}: {
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-[14px] font-semibold text-content">{title}</h2>
      {children}
      {note && (
        <p className="mt-3 border-t border-line pt-3 text-[12px] text-content-subtle">{note}</p>
      )}
    </section>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-content-subtle">{children}</p>;
}

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("reservations.view");
  const { id } = await params;

  const propertyIds = await getAccessiblePropertyIds();

  let detail;
  try {
    detail = await getReservationDetail(id, propertyIds, new Set(session.permissions));
  } catch (error) {
    // A booking outside the caller's properties is indistinguishable from one that
    // never existed — deliberately, so an id cannot be probed.
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [canEdit, canCancel, canCheckIn, canViewGuests, canViewUnits] = await Promise.all([
    can("reservations.edit"),
    can("reservations.cancel"),
    can("reservations.checkin"),
    can("guests.view"),
    can("units.view"),
  ]);

  const status = statusMeta(RESERVATION_STATUS, detail.status);
  const source = statusMeta(RESERVATION_SOURCE, detail.source);
  const { financial, charges, payments, invoices, activity } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`حجز ${detail.reservationNumber}`}
        description={`${detail.guest.fullName} · ${source.label} · أُنشئ ${formatDate(detail.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/reservations"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-content transition-colors hover:bg-surface-inset"
            >
              <ArrowRight className="size-4" aria-hidden />
              كل الحجوزات
            </Link>
            <ReservationActions
              reservationId={detail.id}
              reservationNumber={detail.reservationNumber}
              guards={detail.guards}
              checkIn={detail.checkIn}
              noShow={detail.noShow}
              canEdit={canEdit}
              canConfirm={canEdit}
              canCancel={canCancel}
              canCheckIn={canCheckIn}
            />
          </div>
        }
      />

      {/* Status in words, with the tone only reinforcing it. */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone as never}>{status.label}</Badge>
        {financial && (
          <Badge tone={statusMeta(PAYMENT_STATUS, financial.paymentStatus).tone as never}>
            {statusMeta(PAYMENT_STATUS, financial.paymentStatus).label}
          </Badge>
        )}
        {detail.stay.unitId === null && detail.status !== "CANCELLED" && (
          <span className="rounded-lg bg-warn-bg px-2.5 py-1 text-[12px] font-medium text-warn-fg">
            {UNASSIGNED}
          </span>
        )}
      </div>

      {/*
        Why an action is not on offer. Below the header, where a sentence has the full
        width to wrap into — and where the reader looks after noticing the button they
        expected is missing.
      */}
      {(() => {
        const blocked = [
          canEdit && !detail.guards.canEdit ? detail.guards.editBlockedReason : null,
          canCancel && !detail.guards.canCancel && detail.status !== "CANCELLED"
            ? detail.guards.cancelBlockedReason
            : null,
        ].filter((reason): reason is string => Boolean(reason));

        const unique = [...new Set(blocked)];
        if (unique.length === 0) return null;

        return (
          <ul className="space-y-1.5 rounded-xl border border-line bg-surface-muted px-4 py-3">
            {unique.map((reason) => (
              <li key={reason} className="text-[12px] leading-relaxed text-content-muted">
                {reason}
              </li>
            ))}
          </ul>
        );
      })()}

      {detail.cancellation && (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-inset px-4 py-3">
          <Ban className="mt-0.5 size-4 shrink-0 text-content-muted" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-content">
              أُلغي في {formatDateTime(detail.cancellation.at)}
              {detail.cancellation.by && ` · بواسطة ${detail.cancellation.by}`}
            </p>
            {detail.cancellation.reason && (
              <p className="mt-1 text-[12px] text-content-muted">{detail.cancellation.reason}</p>
            )}
          </div>
        </div>
      )}

      {/*
        A checked-in booking is no longer a booking, it is a stay. The page says so at
        the top and states the facts a desk is asked for by phone: who, which room,
        when they arrived and when they are due to leave.
      */}
      {detail.status === "CHECKED_IN" && (
        <div className="flex items-start gap-3 rounded-xl border border-ok-fg/25 bg-ok-bg px-4 py-3">
          <UserCheck className="mt-0.5 size-4 shrink-0 text-ok-fg" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ok-fg">
              تم تسجيل الوصول — النزيل مقيم حاليًا
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-content-muted">
              {detail.stay.unitNumber && `الوحدة ${detail.stay.unitNumber} · `}
              {detail.stay.checkedInAt
                ? `وقت الوصول الفعلي ${formatDateTime(detail.stay.checkedInAt)}`
                : "وقت الوصول الفعلي غير مسجَّل"}
              {detail.stay.checkedInBy && ` · بواسطة ${detail.stay.checkedInBy}`}
              {` · المغادرة المتوقعة ${formatDateShort(detail.stay.checkOutDate)}`}
            </p>
            <p className="mt-1 text-[12px] text-content-subtle">
              تعديل الغرفة أو التواريخ لحجز قيد الإقامة يتم من إجراءات الإقامة، وليس من نموذج
              الحجز.
            </p>
          </div>
        </div>
      )}

      {detail.noShow.at && (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-inset px-4 py-3">
          <UserX className="mt-0.5 size-4 shrink-0 text-content-muted" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-content">
              سُجّل عدم الحضور في {formatDateTime(detail.noShow.at)}
              {detail.noShow.by && ` · بواسطة ${detail.noShow.by}`}
            </p>
            {detail.noShow.reason && (
              <p className="mt-1 text-[12px] text-content-muted">{detail.noShow.reason}</p>
            )}
            <p className="mt-1 text-[12px] text-content-subtle">
              لم تُعدَّل أي مدفوعات أو فواتير — قرار الغرامة أو الاسترجاع يُتخذ من شاشة
              المدفوعات.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="الإقامة">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Row label="المنشأة" value={detail.propertyName} />
            <Row label="نوع الوحدة" value={detail.stay.unitTypeName} />
            <Row
              label="الوحدة"
              value={
                detail.stay.unitId ? (
                  canViewUnits ? (
                    <Link
                      href={`/units/${detail.stay.unitId}`}
                      className="inline-flex items-center gap-1.5 tabular-nums text-brand-700 hover:underline"
                    >
                      <BedDouble className="size-3.5" aria-hidden />
                      {detail.stay.unitNumber}
                    </Link>
                  ) : (
                    <span className="tabular-nums">{detail.stay.unitNumber}</span>
                  )
                ) : (
                  <span className="text-warn-fg">{UNASSIGNED}</span>
                )
              }
            />
            <Row
              label="الطابق"
              value={detail.stay.floor === null ? NONE : detail.stay.floor}
            />
            <Row label="الوصول" value={formatDateShort(detail.stay.checkInDate)} />
            <Row label="المغادرة" value={formatDateShort(detail.stay.checkOutDate)} />
            <Row
              label="الليالي"
              value={<span className="tabular-nums">{detail.stay.nights}</span>}
            />
            <Row
              label="النزلاء"
              value={
                <span className="tabular-nums">
                  {detail.stay.adults} بالغ
                  {detail.stay.children > 0 && ` · ${detail.stay.children} طفل`}
                </span>
              }
            />
            {detail.stay.checkedInAt && (
              <Row
                label="وقت الوصول الفعلي"
                value={formatDateTime(detail.stay.checkedInAt)}
              />
            )}
            {detail.stay.checkedInBy && (
              <Row label="سجّل الوصول" value={detail.stay.checkedInBy} />
            )}
          </dl>
        </Panel>

        <Panel title="النزيل">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Row
              label="الاسم"
              value={
                canViewGuests ? (
                  <Link
                    href={`/guests/${detail.guest.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {detail.guest.fullName}
                  </Link>
                ) : (
                  detail.guest.fullName
                )
              }
            />
            <Row label="الجنسية" value={detail.guest.nationality ?? NONE} />
            <Row
              label="الجوال"
              value={
                detail.guest.mobile ? (
                  <a
                    href={`tel:${detail.guest.mobile}`}
                    className="tabular-nums text-brand-700 hover:underline"
                    dir="ltr"
                  >
                    {formatMobile(detail.guest.mobile)}
                  </a>
                ) : (
                  NONE
                )
              }
            />
            <Row
              label="البريد"
              value={
                detail.guest.email ? (
                  <span className="break-all" dir="ltr">
                    {detail.guest.email}
                  </span>
                ) : (
                  NONE
                )
              }
            />
            <Row
              label="الوثيقة"
              value={
                detail.guest.identificationType
                  ? `${identificationTypeLabel(detail.guest.identificationType)} · ${detail.guest.identificationDisplay}`
                  : NONE
              }
            />
            <Row label="أنشأ الحجز" value={detail.createdBy ?? NONE} />
          </dl>
        </Panel>

        {financial ? (
          <Panel
            title="الحساب"
            note="للعرض فقط — تسجيل الدفعات وإصدار الفواتير من شاشاتهما."
          >
            <dl className="space-y-2 text-[13px]">
              <Line
                label={`الإقامة (${detail.stay.nights} × ${formatAmount(financial.nightlyRate)})`}
                value={financial.subtotal}
              />
              {Number(financial.discount) > 0 && (
                <Line label="الخصم" value={`-${financial.discount}`} />
              )}
              <Line label={`ضريبة القيمة المضافة (${financial.vatRate}%)`} value={financial.tax} />
              {Number(financial.additionalCharges) > 0 && (
                <Line label="رسوم وخدمات إضافية" value={financial.additionalCharges} />
              )}
              <div className="flex items-center justify-between border-t border-line pt-2 font-medium">
                <dt className="text-content">الإجمالي</dt>
                <dd className="tabular-nums text-content">{formatAmount(financial.total)}</dd>
              </div>
              <Line label="المسدَّد" value={financial.paidAmount} />
              <div className="flex items-center justify-between font-medium">
                <dt className="text-content">المتبقي</dt>
                <dd
                  className={`tabular-nums ${Number(financial.balance) > 0 ? "text-warn-fg" : "text-content"}`}
                >
                  {formatAmount(financial.balance)}
                </dd>
              </div>
            </dl>
          </Panel>
        ) : (
          <Panel title="الحساب">
            <Empty>لا تملك صلاحية عرض البيانات المالية لهذا الحجز.</Empty>
          </Panel>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="طلبات النزيل">
          {detail.requests.specialRequests ? (
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-content">
              {detail.requests.specialRequests}
            </p>
          ) : (
            <Empty>لا توجد طلبات خاصة بهذا الحجز.</Empty>
          )}
        </Panel>

        <Panel title="ملاحظات داخلية">
          {detail.requests.internalNotes ? (
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-content">
              {detail.requests.internalNotes}
            </p>
          ) : (
            <Empty>لا توجد ملاحظات داخلية.</Empty>
          )}
        </Panel>
      </div>

      {charges && (
        <Panel title="الرسوم والخدمات">
          {charges.length === 0 ? (
            <Empty>لم تُسجَّل رسوم إضافية على هذا الحجز.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <caption className="sr-only">رسوم وخدمات الحجز</caption>
                <thead>
                  <tr className="border-b border-line text-[12px] text-content-muted">
                    <th scope="col" className="pb-2 text-start font-medium">الوصف</th>
                    <th scope="col" className="pb-2 text-start font-medium">التاريخ</th>
                    <th scope="col" className="pb-2 text-end font-medium">الكمية</th>
                    <th scope="col" className="pb-2 text-end font-medium">السعر</th>
                    <th scope="col" className="pb-2 text-end font-medium">الضريبة</th>
                    <th scope="col" className="pb-2 text-end font-medium">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((charge) => (
                    <tr key={charge.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 text-content">{charge.description}</td>
                      <td className="py-2.5 tabular-nums text-content-muted">
                        {formatDateShort(charge.chargedAt)}
                      </td>
                      <td className="py-2.5 text-end tabular-nums text-content-muted">
                        {Number(charge.quantity)}
                      </td>
                      <td className="py-2.5 text-end tabular-nums text-content-muted">
                        {formatAmount(charge.unitPrice)}
                      </td>
                      <td className="py-2.5 text-end tabular-nums text-content-muted">
                        {formatAmount(charge.tax)}
                      </td>
                      <td className="py-2.5 text-end tabular-nums text-content">
                        {formatAmount(charge.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {payments && (
          <Panel title="المدفوعات" note="للعرض فقط — التسجيل من شاشة المدفوعات.">
            {payments.length === 0 ? (
              <Empty>لم تُسجَّل أي دفعة على هذا الحجز.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] tabular-nums text-content" dir="ltr">
                        {payment.paymentNumber}
                      </p>
                      <p className="mt-0.5 text-[12px] text-content-muted">
                        {statusMeta(PAYMENT_METHOD, payment.method).label} ·{" "}
                        {formatDateShort(payment.paymentDate)}
                        {payment.reference && ` · ${payment.reference}`}
                      </p>
                    </div>
                    {/* A refund is named, not merely signed. */}
                    {payment.isRefund ? (
                      <span className="shrink-0 whitespace-nowrap">
                        <span className="me-1.5 rounded bg-warn-bg px-1.5 py-0.5 text-[11px] text-warn-fg">
                          استرجاع
                        </span>
                        <span className="tabular-nums text-warn-fg">
                          {formatAmount(payment.amount)}
                        </span>
                      </span>
                    ) : (
                      <span className="shrink-0 tabular-nums text-content">
                        {formatAmount(payment.amount)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {invoices && (
          <Panel title="الفواتير" note="للعرض فقط — الإصدار من شاشة الفواتير.">
            {invoices.length === 0 ? (
              <Empty>لم تُصدر فاتورة لهذا الحجز.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] tabular-nums text-content" dir="ltr">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="mt-0.5 text-[12px] text-content-muted">
                        {formatDateShort(invoice.issueDate)} · المتبقي{" "}
                        {formatAmount(invoice.balance)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={statusMeta(INVOICE_STATUS, invoice.status).tone as never}>
                        {statusMeta(INVOICE_STATUS, invoice.status).label}
                      </Badge>
                      <span className="tabular-nums text-content">
                        {formatAmount(invoice.total)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      {activity && (
        <Panel title="سجل النشاط">
          {activity.length === 0 ? (
            <Empty>لا يوجد نشاط مسجَّل على هذا الحجز بعد.</Empty>
          ) : (
            <ol className="space-y-3">
              {activity.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] text-content">{entry.description}</p>
                    <p className="mt-0.5 text-[12px] text-content-subtle">
                      {entry.userName} · {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      )}
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
