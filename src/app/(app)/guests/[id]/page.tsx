import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  BedDouble,
  CalendarClock,
  Mail,
  Pencil,
  Phone,
  Wallet,
} from "lucide-react";

import { Badge, PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import {
  formatAmount,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatMobile,
  formatNumber,
  formatRelative,
} from "@/lib/format";
import {
  genderLabel,
  identificationTypeLabel,
  maskedIdentificationLabel,
} from "@/lib/guest-identity";
import {
  INVOICE_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  RESERVATION_SOURCE,
  RESERVATION_STATUS,
} from "@/lib/status";
import { AppError } from "@/server/errors";
import { getGuestDetails, type GuestStayRow } from "@/server/services/guest.service";
import { getAccessiblePropertyIds } from "@/server/services/property.service";

import { GuestTabs, type GuestTab } from "../components/GuestTabs";

/**
 * One guest, in full.
 *
 * A page, not a dialog: this is six sections of operational and financial history, and
 * it needs a URL so a colleague can be sent straight to it.
 *
 * Two things are decided on the server and cannot be undone by anything here. Which
 * sections exist at all follows from the reader's permissions — a section they may not
 * see was never fetched. And which property's history is shown follows from what they
 * may reach; the identity is the group's, the stays are the property's.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "ملف النزيل" };

const NONE = "—";

function label<T extends Record<string, { label: string; tone: string }>>(map: T, key: string) {
  return map[key.toLowerCase() as keyof T] ?? { label: key, tone: "neutral" };
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-[14px] font-semibold text-content">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-[13px] text-content-subtle">{children}</p>;
}

function Row({ label: name, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-content-muted">{name}</dt>
      <dd className="mt-0.5 text-[13px] text-content">{value}</dd>
    </div>
  );
}

/**
 * One stay.
 *
 * The reservation number became a link in Stage 7, when the booking detail route it
 * points at started to exist — gated on the permission to open it, because a link
 * landing on "غير مصرح" is worse than plain text.
 */
function StayCard({
  stay,
  tone,
  canOpenReservation,
}: {
  stay: GuestStayRow;
  tone: "current" | "upcoming" | "past";
  canOpenReservation: boolean;
}) {
  const status = label(RESERVATION_STATUS, stay.status);
  const source = label(RESERVATION_SOURCE, stay.source);

  return (
    <div
      className={`rounded-xl border p-3.5 ${
        tone === "current" ? "border-ok-fg/30 bg-ok-bg/40" : "border-line bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {canOpenReservation ? (
            <Link
              href={`/reservations/${stay.id}`}
              className="block text-[13px] font-medium tabular-nums text-brand-700 hover:underline"
              dir="ltr"
            >
              {stay.reservationNumber}
            </Link>
          ) : (
            <p className="text-[13px] font-medium tabular-nums text-content" dir="ltr">
              {stay.reservationNumber}
            </p>
          )}
          <p className="mt-0.5 text-[12px] text-content-muted">
            {stay.unitNumber ? `الوحدة ${stay.unitNumber}` : "لم تُسنَد وحدة بعد"} ·{" "}
            {stay.unitTypeName}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge tone={status.tone as never}>{status.label}</Badge>
          {stay.paymentStatus && (
            <Badge tone={label(PAYMENT_STATUS, stay.paymentStatus).tone as never}>
              {label(PAYMENT_STATUS, stay.paymentStatus).label}
            </Badge>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line/70 pt-3 sm:grid-cols-4">
        <Row label="الوصول" value={formatDateShort(stay.checkInDate)} />
        <Row label="المغادرة" value={formatDateShort(stay.checkOutDate)} />
        <Row label="الليالي" value={<span className="tabular-nums">{stay.nights}</span>} />
        <Row label="المصدر" value={source.label} />
        {stay.total !== undefined && (
          <Row label="الإجمالي" value={<span className="tabular-nums">{formatAmount(stay.total)}</span>} />
        )}
        {stay.balance !== undefined && (
          <Row
            label="المتبقي"
            value={<span className="tabular-nums">{formatAmount(stay.balance)}</span>}
          />
        )}
      </dl>
    </div>
  );
}

export default async function GuestProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("guests.view");

  const { id } = await params;
  const raw = await searchParams;
  const value = (key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key]);

  const historyPage = Number.parseInt(value("historyPage") ?? "1", 10);
  const propertyIds = await getAccessiblePropertyIds();

  let profile;
  try {
    profile = await getGuestDetails(id, propertyIds, new Set(session.permissions), {
      historyPage: Number.isFinite(historyPage) ? historyPage : 1,
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const canEdit = await can("guests.edit");
  const canOpenReservation = await can("reservations.view");
  const { guest, financial, payments, invoices, activity } = profile;

  const tabs: GuestTab[] = [
    { key: "basic", label: "البيانات الأساسية" },
    { key: "stays", label: "الحجوزات والإقامات", count: profile.reservationCount },
    ...(payments ? [{ key: "payments", label: "المدفوعات", count: payments.length }] : []),
    ...(invoices ? [{ key: "invoices", label: "الفواتير", count: invoices.length }] : []),
    { key: "notes", label: "الملاحظات" },
    ...(activity ? [{ key: "activity", label: "سجل النشاط", count: activity.length }] : []),
  ];

  const requested = value("tab") ?? "basic";
  const active = tabs.some((tab) => tab.key === requested) ? requested : "basic";

  const historyPages = Math.max(
    1,
    Math.ceil(profile.history.total / profile.history.pageSize),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={guest.fullName}
        description={[
          guest.nationality,
          guest.mobile ? formatMobile(guest.mobile) : null,
          `عميل منذ ${formatDate(guest.createdAt)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/guests"
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-content transition-colors hover:bg-surface-inset"
            >
              <ArrowRight className="size-4" aria-hidden />
              كل النزلاء
            </Link>
            {canEdit && (
              <Link
                href={`/guests/${guest.id}/edit`}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
              >
                <Pencil className="size-4" aria-hidden />
                تعديل
              </Link>
            )}
          </div>
        }
      />

      {/* The guest is in a room right now — the single most useful fact on this page,
          so it sits above the tabs where it cannot be missed. */}
      {profile.currentStays.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BedDouble className="size-4 text-ok-fg" aria-hidden />
            <h2 className="text-[13px] font-semibold text-content">
              {profile.currentStays.length === 1
                ? "الإقامة الحالية"
                : `مقيم حاليًا في ${profile.currentStays.length} وحدات`}
            </h2>
          </div>
          {profile.currentStays.map((stay) => (
            <StayCard key={stay.id} stay={stay} tone="current" canOpenReservation={canOpenReservation} />
          ))}
        </div>
      )}

      <section
        aria-label="ملخص النزيل"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryTile
          label="عدد الإقامات"
          value={formatNumber(profile.stayCount)}
          hint={profile.lastStayDate ? `آخرها ${formatDateShort(profile.lastStayDate)}` : undefined}
          icon={<BedDouble className="size-[18px]" aria-hidden />}
        />
        <SummaryTile
          label="إجمالي الحجوزات"
          value={formatNumber(profile.reservationCount)}
          hint={profile.upcoming.length > 0 ? `${profile.upcoming.length} حجز قادم` : undefined}
          icon={<CalendarClock className="size-[18px]" aria-hidden />}
        />
        {financial && (
          <>
            <SummaryTile
              label="إجمالي المفوتر"
              value={formatAmount(financial.totalInvoiced)}
              hint={`${financial.invoiceCount} فاتورة`}
              icon={<Wallet className="size-[18px]" aria-hidden />}
            />
            <SummaryTile
              label="المتبقي على النزيل"
              value={formatAmount(financial.outstanding)}
              hint={`المسدَّد ${formatAmount(financial.netPaid)}`}
              icon={<Wallet className="size-[18px]" aria-hidden />}
              alert={Number(financial.outstanding) > 0}
            />
          </>
        )}
      </section>

      <GuestTabs tabs={tabs} active={active} guestId={guest.id} />

      <div>
        {active === "basic" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="الهوية">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Row label="الاسم الكامل" value={guest.fullName} />
                <Row label="الجنسية" value={guest.nationality ?? NONE} />
                <Row
                  label="رقم الجوال"
                  value={
                    guest.mobile ? (
                      <a
                        href={`tel:${guest.mobile}`}
                        className="inline-flex items-center gap-1.5 tabular-nums text-brand-700 hover:underline"
                        dir="ltr"
                      >
                        <Phone className="size-3.5" aria-hidden />
                        {formatMobile(guest.mobile)}
                      </a>
                    ) : (
                      NONE
                    )
                  }
                />
                <Row
                  label="البريد الإلكتروني"
                  value={
                    guest.email ? (
                      <a
                        href={`mailto:${guest.email}`}
                        className="inline-flex items-center gap-1.5 break-all text-brand-700 hover:underline"
                        dir="ltr"
                      >
                        <Mail className="size-3.5 shrink-0" aria-hidden />
                        {guest.email}
                      </a>
                    ) : (
                      NONE
                    )
                  }
                />
                <Row
                  label="نوع الوثيقة"
                  value={identificationTypeLabel(guest.identificationType)}
                />
                <Row
                  label="رقم الوثيقة"
                  value={
                    guest.identificationType === null ? (
                      NONE
                    ) : profile.canReadDocuments ? (
                      <span className="tabular-nums" dir="ltr">
                        {guest.identificationNumber}
                      </span>
                    ) : (
                      /* Masked for a reader who looks guests up but never handles their
                         papers. The spoken form carries the same information, so the
                         masking is not conveyed by shape alone. */
                      <>
                        <span className="tabular-nums" dir="ltr" aria-hidden>
                          {guest.identificationMasked}
                        </span>
                        <span className="sr-only">
                          {maskedIdentificationLabel(guest.identificationMasked)}
                        </span>
                        <span className="ms-2 text-[11px] text-content-subtle">
                          (مخفي — لا تملك صلاحية عرضه)
                        </span>
                      </>
                    )
                  }
                />
                <Row
                  label="تاريخ الميلاد"
                  value={guest.dateOfBirth ? formatDate(guest.dateOfBirth) : NONE}
                />
                <Row label="الجنس" value={genderLabel(guest.gender)} />
                <Row label="تاريخ التسجيل" value={formatDate(guest.createdAt)} />
                <Row label="آخر تحديث" value={formatRelative(guest.updatedAt)} />
              </dl>
            </Panel>

            <Panel title="التفضيلات الدائمة">
              {guest.preferences ? (
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-content">
                  {guest.preferences}
                </p>
              ) : (
                <Empty>لم تُسجَّل تفضيلات لهذا النزيل بعد.</Empty>
              )}
              <p className="mt-3 border-t border-line pt-3 text-[12px] text-content-subtle">
                التفضيلات تنتقل مع النزيل بين الإقامات. الطلبات الخاصة بحجز واحد تُسجَّل
                في الحجز نفسه.
              </p>
            </Panel>
          </div>
        )}

        {active === "stays" && (
          <div className="space-y-4">
            {profile.upcoming.length > 0 && (
              <Panel title={`حجوزات قادمة (${profile.upcoming.length})`}>
                <div className="space-y-2.5">
                  {profile.upcoming.map((stay) => (
                    <StayCard key={stay.id} stay={stay} tone="upcoming" canOpenReservation={canOpenReservation} />
                  ))}
                </div>
              </Panel>
            )}

            <Panel title="سجل الإقامات">
              {profile.history.rows.length === 0 ? (
                <Empty>
                  {profile.reservationCount === 0
                    ? "لا توجد حجوزات سابقة لهذا النزيل في هذه المنشأة."
                    : "كل حجوزات هذا النزيل حالية أو قادمة — لا يوجد سجل سابق بعد."}
                </Empty>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {profile.history.rows.map((stay) => (
                      <StayCard key={stay.id} stay={stay} tone="past" canOpenReservation={canOpenReservation} />
                    ))}
                  </div>

                  {historyPages > 1 && (
                    <nav
                      aria-label="تنقل في سجل الإقامات"
                      className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3"
                    >
                      <p className="text-[12px] text-content-muted">
                        صفحة {profile.history.page} من {historyPages} ·{" "}
                        {formatNumber(profile.history.total)} حجز
                      </p>
                      <div className="flex gap-1.5">
                        {profile.history.page > 1 && (
                          <Link
                            href={`/guests/${guest.id}?tab=stays&historyPage=${profile.history.page - 1}`}
                            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-content transition-colors hover:bg-surface-inset"
                          >
                            الأحدث
                          </Link>
                        )}
                        {profile.history.page < historyPages && (
                          <Link
                            href={`/guests/${guest.id}?tab=stays&historyPage=${profile.history.page + 1}`}
                            className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-content transition-colors hover:bg-surface-inset"
                          >
                            الأقدم
                          </Link>
                        )}
                      </div>
                    </nav>
                  )}
                </>
              )}
            </Panel>
          </div>
        )}

        {active === "payments" && payments && (
          <Panel title="سجل المدفوعات">
            {payments.length === 0 ? (
              <Empty>لم تُسجَّل أي دفعة لهذا النزيل في هذه المنشأة.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">مدفوعات النزيل — للعرض فقط</caption>
                  <thead>
                    <tr className="border-b border-line text-[12px] text-content-muted">
                      <th scope="col" className="pb-2 text-start font-medium">السند</th>
                      <th scope="col" className="pb-2 text-start font-medium">الحجز</th>
                      <th scope="col" className="pb-2 text-start font-medium">التاريخ</th>
                      <th scope="col" className="pb-2 text-start font-medium">الطريقة</th>
                      <th scope="col" className="pb-2 text-start font-medium">المرجع</th>
                      <th scope="col" className="pb-2 text-end font-medium">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2.5 tabular-nums" dir="ltr">
                          {payment.paymentNumber}
                        </td>
                        <td className="py-2.5 tabular-nums text-content-muted" dir="ltr">
                          {payment.reservationNumber}
                        </td>
                        <td className="py-2.5 tabular-nums text-content-muted">
                          {formatDateShort(payment.paymentDate)}
                        </td>
                        <td className="py-2.5 text-content-muted">
                          {label(PAYMENT_METHOD, payment.method).label}
                        </td>
                        <td className="py-2.5 text-content-subtle" dir="ltr">
                          {payment.reference ?? NONE}
                        </td>
                        <td className="py-2.5 text-end">
                          {/* A refund is named, not merely signed: a minus glyph in a
                              dense column is the easiest thing on the page to miss. */}
                          {payment.isRefund ? (
                            <span className="whitespace-nowrap">
                              <span className="me-1.5 rounded bg-warn-bg px-1.5 py-0.5 text-[11px] text-warn-fg">
                                استرجاع
                              </span>
                              <span className="tabular-nums text-warn-fg">
                                {formatAmount(payment.amount)}
                              </span>
                            </span>
                          ) : (
                            <span className="tabular-nums text-content">
                              {formatAmount(payment.amount)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 border-t border-line pt-3 text-[12px] text-content-subtle">
                  للعرض فقط — تسجيل الدفعات يتم من شاشة المدفوعات.
                </p>
              </div>
            )}
          </Panel>
        )}

        {active === "invoices" && invoices && (
          <Panel title="الفواتير">
            {invoices.length === 0 ? (
              <Empty>لم تُصدر فواتير لهذا النزيل في هذه المنشأة.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">فواتير النزيل — للعرض فقط</caption>
                  <thead>
                    <tr className="border-b border-line text-[12px] text-content-muted">
                      <th scope="col" className="pb-2 text-start font-medium">الفاتورة</th>
                      <th scope="col" className="pb-2 text-start font-medium">الحجز</th>
                      <th scope="col" className="pb-2 text-start font-medium">تاريخ الإصدار</th>
                      <th scope="col" className="pb-2 text-start font-medium">الحالة</th>
                      <th scope="col" className="pb-2 text-end font-medium">الإجمالي</th>
                      <th scope="col" className="pb-2 text-end font-medium">المسدَّد</th>
                      <th scope="col" className="pb-2 text-end font-medium">المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2.5 tabular-nums" dir="ltr">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="py-2.5 tabular-nums text-content-muted" dir="ltr">
                          {invoice.reservationNumber}
                        </td>
                        <td className="py-2.5 tabular-nums text-content-muted">
                          {formatDateShort(invoice.issueDate)}
                        </td>
                        <td className="py-2.5">
                          <Badge tone={label(INVOICE_STATUS, invoice.status).tone as never}>
                            {label(INVOICE_STATUS, invoice.status).label}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-end tabular-nums">
                          {formatAmount(invoice.total)}
                        </td>
                        <td className="py-2.5 text-end tabular-nums text-content-muted">
                          {formatAmount(invoice.paid)}
                        </td>
                        <td className="py-2.5 text-end tabular-nums">
                          {formatAmount(invoice.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 border-t border-line pt-3 text-[12px] text-content-subtle">
                  للعرض فقط — إصدار الفواتير يتم من شاشة الفواتير.
                </p>
              </div>
            )}
          </Panel>
        )}

        {active === "notes" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="التفضيلات الدائمة">
              {guest.preferences ? (
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-content">
                  {guest.preferences}
                </p>
              ) : (
                <Empty>لم تُسجَّل تفضيلات بعد.</Empty>
              )}
            </Panel>
            <Panel title="ملاحظات تشغيلية">
              {guest.notes ? (
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-content">
                  {guest.notes}
                </p>
              ) : (
                <Empty>لا توجد ملاحظات على هذا الملف.</Empty>
              )}
              <p className="mt-3 border-t border-line pt-3 text-[12px] text-content-subtle">
                تُستخدم لوقائع تشغيلية تفيد الفريق — لا للأحكام الشخصية.
              </p>
            </Panel>
          </div>
        )}

        {active === "activity" && activity && (
          <Panel title="سجل النشاط">
            {activity.length === 0 ? (
              <Empty>لا يوجد نشاط مسجَّل على هذا الملف بعد.</Empty>
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
    </div>
  );
}

function SummaryTile({
  label: name,
  value,
  hint,
  icon,
  alert = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-content-muted">{name}</p>
          <p className="mt-2 truncate text-[22px] font-semibold leading-none tabular-nums text-content">
            {value}
          </p>
          {hint && <p className="mt-1.5 truncate text-[12px] text-content-subtle">{hint}</p>}
        </div>
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${
            alert ? "bg-warn-bg text-warn-fg" : "bg-brand-50 text-brand-700"
          }`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}
