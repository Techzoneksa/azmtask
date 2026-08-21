import Link from "next/link";
import {
  BedDouble,
  SprayCan,
  CalendarCheck,
  CalendarDays,
  DoorOpen,
  Percent,
  Wallet,
  Wrench,
} from "lucide-react";

import { Sparkline } from "@/components/charts/Sparkline";
import { BarSeries } from "@/components/charts/BarSeries";
import { RankedBars } from "@/components/charts/RankedBars";
import { PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { formatAmount, formatDate, formatNumber } from "@/lib/format";
import { RESERVATION_SOURCE } from "@/lib/status";
import { OCCUPANCY_LABELS } from "@/server/occupancy";
import { getDashboardSnapshot } from "@/server/services/dashboard.service";

import { KpiCard } from "./components/KpiCard";
import {
  ActivityList,
  AlertsList,
  ArrivalsList,
  DeparturesList,
  HousekeepingList,
  LowStockList,
  MaintenanceList,
  RecentReservationsTable,
} from "./components/Lists";
import { CountChip, Panel, SectionBody } from "./components/Primitives";

/**
 * The operations dashboard.
 *
 * Every figure on this page is computed from the database at request time. Nothing
 * is hardcoded, and nothing is approximated for effect — a demo whose numbers do not
 * add up is worse than no demo, because the first thing a hotelier does is add up a
 * column.
 *
 * Rendered dynamically rather than cached: a room state that is thirty seconds stale
 * sends a housekeeper to the wrong floor.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requirePermission("dashboard.view");

  /*
   * Every unit figure below is a filtered view of the units screen. Linking to it
   * turns a number into a work list — but only for someone allowed on that screen;
   * otherwise the cards stay plain, because a link that lands on "غير مصرح" is worse
   * than no link.
   */
  const canOpenGuests = await can("guests.view");
  const canOpenReservations = await can("reservations.view");
  const canCheckIn = await can("reservations.checkin");

  const unitsHref = (await can("units.view"))
    ? (query: string) => `/units?${query}`
    : () => undefined;
  const session = await getSession();

  const snapshot = await getDashboardSnapshot(session?.permissions ?? []);

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <PageHeader title="لوحة المعلومات" description="نظرة شاملة على تشغيل المنشأة" />
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لا توجد منشأة مُهيّأة بعد</p>
          <p className="mt-1.5 text-[13px] text-content-muted">
            أضف منشأة من الإعدادات لتبدأ لوحة المعلومات بعرض البيانات التشغيلية.
          </p>
        </div>
      </div>
    );
  }

  const units = snapshot.units.ok ? snapshot.units.data : null;
  const arrivalsCount = snapshot.arrivals.ok ? snapshot.arrivals.data.length : null;
  const departuresCount = snapshot.departures.ok ? snapshot.departures.data.length : null;

  /** A KPI whose query failed shows a dash, never a zero. */
  const show = (value: number | null, suffix = "") =>
    value === null ? "—" : `${formatNumber(value)}${suffix}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة المعلومات"
        description={`نظرة شاملة على تشغيل ${snapshot.propertyName} اليوم`}
        actions={
          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            {/* Only for someone who may open it — a link landing on "غير مصرح" is
                worse than no link. */}
            {canOpenReservations && (
              <Link
                href="/reservations/calendar"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-content transition-colors hover:bg-surface-inset"
              >
                <CalendarDays className="size-4" aria-hidden />
                تقويم الحجوزات
              </Link>
            )}
            <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="text-[13px] font-medium text-content">
            {formatDate(snapshot.businessDate)}
          </span>
          {snapshot.isDemoDate && (
            /* The demo runs on a fixed operating date. Saying so out loud stops
               anyone reading the scenario as though it were live. */
            <span className="rounded-full bg-info-bg px-2.5 py-0.5 text-[11px] font-medium text-info-fg">
              تاريخ تشغيلي ثابت — بيئة عرض
            </span>
            )}
            </div>
          </div>
        }
      />

      {/* ---------------- KPIs ---------------- */}
      <section aria-label="مؤشرات اليوم" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="نسبة الإشغال"
          value={units ? `${formatNumber(units.occupancyRate)}%` : "—"}
          hint={units ? `${units.occupied} من ${units.sellable} وحدة قابلة للبيع` : undefined}
          icon={Percent}
          emphasis
        />
        {/*
          These four describe the building as it stands right now — a guest leaving at
          eleven still occupies their room, and a room awaiting a clean is not ready to
          hand to anyone. The calendar answers a different question (what is sold for a
          given night) and its figures carry different names for that reason. The
          vocabulary lives in `@/server/occupancy`.
        */}
        <KpiCard
          label={OCCUPANCY_LABELS.occupiedNow}
          value={show(units?.occupied ?? null)}
          hint={units ? `من إجمالي ${units.total} وحدة` : undefined}
          icon={BedDouble}
          href={unitsHref("status=OCCUPIED&view=table")}
        />
        <KpiCard
          label={OCCUPANCY_LABELS.readyNow}
          value={show(units?.available ?? null)}
          hint={units ? `${units.reserved} محجوزة لوصول اليوم` : undefined}
          icon={DoorOpen}
          tone="ok"
          href={unitsHref("status=AVAILABLE&view=table")}
        />
        <KpiCard
          label={OCCUPANCY_LABELS.expectedArrivals}
          value={show(arrivalsCount)}
          hint={
            departuresCount === null
              ? undefined
              : `${departuresCount} ${OCCUPANCY_LABELS.remainingDepartures}`
          }
          icon={CalendarCheck}
          tone="info"
        />
      </section>

      <section aria-label="حالة التشغيل" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="تحتاج تنظيفًا"
          value={show(units?.dirty ?? null)}
          hint={units ? `${units.cleaning} جارٍ تنظيفها الآن` : undefined}
          icon={SprayCan}
          tone="warn"
          href={unitsHref("housekeeping=DIRTY&view=table")}
        />
        <KpiCard
          label="تحت الصيانة"
          value={show(units?.maintenance ?? null)}
          hint={units ? `${units.blocked} وحدة موقوفة` : undefined}
          icon={Wrench}
          tone="danger"
          href={unitsHref("status=MAINTENANCE&view=table")}
        />
        {snapshot.financial && (
          <>
            <KpiCard
              label="المقبوض اليوم"
              value={
                snapshot.financial.ok
                  ? formatAmount(snapshot.financial.data.collectedToday)
                  : "—"
              }
              hint="دفعات مستلمة، بعد خصم المرتجعات"
              icon={Wallet}
              tone="ok"
            />
            <KpiCard
              label="الأرصدة المستحقة"
              value={
                snapshot.financial.ok
                  ? formatAmount(snapshot.financial.data.outstandingBalance)
                  : "—"
              }
              hint={
                snapshot.financial.ok
                  ? `على ${snapshot.financial.data.outstandingCount} حجزًا قائمًا`
                  : undefined
              }
              icon={Wallet}
              tone="warn"
            />
          </>
        )}
      </section>

      {/* ---------------- unit board summary ---------------- */}
      <Panel title="حالة الوحدات" subtitle="توزيع الوحدات على الحالات التشغيلية الآن">
        <SectionBody section={snapshot.units}>
          {(data) => (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
              {/* The same vocabulary as the cards above — these chips are the unit
                  status column broken out, not a second set of measures. */}
              <CountChip label={OCCUPANCY_LABELS.occupiedNow} value={data.occupied} tone="brand" />
              <CountChip label={OCCUPANCY_LABELS.readyNow} value={data.available} tone="ok" />
              <CountChip label="محجوزة" value={data.reserved} tone="info" />
              <CountChip label="تحتاج تنظيف" value={data.dirty} tone="warn" />
              <CountChip label="جارٍ تنظيفها" value={data.cleaning} tone="info" />
              <CountChip label="صيانة" value={data.maintenance} tone="danger" />
              <CountChip label="موقوفة" value={data.blocked} tone="neutral" />
            </div>
          )}
        </SectionBody>
      </Panel>

      {/* ---------------- arrivals, departures, alerts ---------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title={OCCUPANCY_LABELS.expectedArrivals}
          subtitle="حجوزات تبدأ إقامتها اليوم ولم يُسجَّل دخولها بعد"
        >
          <SectionBody
            section={snapshot.arrivals}
            isEmpty={(rows) => rows.length === 0}
            empty="لا توجد وصولات مجدولة اليوم"
          >
            {(rows) => (
              <ArrivalsList
                rows={rows}
                canOpenGuests={canOpenGuests}
                canOpenReservations={canOpenReservations}
                canCheckIn={canCheckIn}
              />
            )}
          </SectionBody>
        </Panel>

        <Panel
          title={OCCUPANCY_LABELS.remainingDepartures}
          subtitle="نزلاء ما زالوا في الفندق وتنتهي إقامتهم اليوم"
        >
          <SectionBody
            section={snapshot.departures}
            isEmpty={(rows) => rows.length === 0}
            empty="لا توجد مغادرات مجدولة اليوم"
          >
            {(rows) => <DeparturesList rows={rows} canOpenGuests={canOpenGuests} canOpenReservations={canOpenReservations} />}
          </SectionBody>
        </Panel>

        <Panel title="يحتاج انتباهك" subtitle="أمور تشغيلية تستدعي تدخلًا اليوم">
          <SectionBody
            section={snapshot.alerts}
            isEmpty={(rows) => rows.length === 0}
            empty="لا توجد تنبيهات — التشغيل يسير بلا معوقات"
          >
            {(rows) => <AlertsList alerts={rows} />}
          </SectionBody>
        </Panel>
      </div>

      {/* ---------------- financial ---------------- */}
      {snapshot.financial && (
        <Panel title="المؤشرات المالية" subtitle="حركة السيولة خلال الشهر التشغيلي الحالي">
          <SectionBody section={snapshot.financial}>
            {(data) => (
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "المقبوض اليوم", value: data.collectedToday },
                  { label: "المقبوض هذا الشهر", value: data.collectedThisMonth },
                  { label: "إيراد الإقامة الليلة", value: data.accommodationEarnedToday },
                  { label: "مصروفات هذا الشهر", value: data.expensesThisMonth },
                  { label: "صافي التدفق النقدي", value: data.netCashFlowThisMonth },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-line bg-surface-muted px-3.5 py-3"
                  >
                    <dt className="text-[12px] text-content-muted">{item.label}</dt>
                    <dd className="mt-1.5 text-[17px] font-semibold tabular-nums text-content">
                      {formatAmount(item.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </SectionBody>
        </Panel>
      )}

      {/* ---------------- charts ---------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="الإشغال — آخر 30 يومًا"
          subtitle="محسوب من فترات الإقامة الفعلية"
          className="xl:col-span-2"
        >
          <SectionBody
            section={snapshot.occupancyTrend ?? { ok: true, data: [] }}
            isEmpty={(points) => points.length === 0}
          >
            {(points) => <Sparkline points={points} unit="%" max={100} />}
          </SectionBody>
        </Panel>

        {snapshot.sources && (
          <Panel title="مصادر الحجز" subtitle="توزيع الحجوزات على قنوات البيع">
            <SectionBody section={snapshot.sources} isEmpty={(rows) => rows.length === 0}>
              {(rows) => (
                <RankedBars
                  items={rows.map((row) => ({
                    label:
                      RESERVATION_SOURCE[row.source.toLowerCase() as keyof typeof RESERVATION_SOURCE]
                        ?.label ?? row.source,
                    value: row.count,
                  }))}
                />
              )}
            </SectionBody>
          </Panel>
        )}
      </div>

      {snapshot.collectionTrend && (
        <Panel title="المقبوضات اليومية — آخر 30 يومًا" subtitle="مجموع الدفعات لكل يوم، بعد خصم المرتجعات">
          <SectionBody section={snapshot.collectionTrend} isEmpty={(points) => points.length === 0}>
            {(points) => <BarSeries points={points} />}
          </SectionBody>
        </Panel>
      )}

      {/* ---------------- recent reservations ---------------- */}
      {snapshot.recentReservations && (
        <Panel title="أحدث الحجوزات" subtitle="آخر عشرة حجوزات أُنشئت في النظام">
          <SectionBody
            section={snapshot.recentReservations}
            isEmpty={(rows) => rows.length === 0}
            empty="لم تُسجَّل حجوزات بعد"
          >
            {(rows) => <RecentReservationsTable rows={rows} canOpenGuests={canOpenGuests} canOpenReservations={canOpenReservations} />}
          </SectionBody>
        </Panel>
      )}

      {/* ---------------- operations detail ---------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        {snapshot.housekeeping && (
          <Panel
            title="النظافة"
            subtitle="مهام قائمة الآن"
            action={
              snapshot.housekeeping.ok && snapshot.housekeeping.data.urgent > 0 ? (
                <span className="rounded-full bg-warn-bg px-2.5 py-1 text-[11px] font-medium text-warn-fg">
                  {snapshot.housekeeping.data.urgent} عاجلة
                </span>
              ) : undefined
            }
          >
            <SectionBody
              section={snapshot.housekeeping}
              isEmpty={(data) => data.tasks.length === 0}
              empty="لا توجد مهام نظافة قائمة"
            >
              {(data) => (
                <>
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    <CountChip label="بانتظار" value={data.pending} tone="warn" />
                    <CountChip label="مُسنَدة" value={data.assigned} tone="info" />
                    <CountChip label="جارية" value={data.inProgress} tone="info" />
                  </div>
                  <HousekeepingList snapshot={data} />
                </>
              )}
            </SectionBody>
          </Panel>
        )}

        {snapshot.maintenance && (
          <Panel title="الصيانة" subtitle="بلاغات مفتوحة">
            <SectionBody
              section={snapshot.maintenance}
              isEmpty={(data) => data.tasks.length === 0}
              empty="لا توجد بلاغات صيانة مفتوحة"
            >
              {(data) => <MaintenanceList snapshot={data} />}
            </SectionBody>
          </Panel>
        )}

        {snapshot.lowStock && (
          <Panel title="مخزون تحت الحد الأدنى" subtitle="أصناف تحتاج إعادة طلب">
            <SectionBody
              section={snapshot.lowStock}
              isEmpty={(rows) => rows.length === 0}
              empty="جميع الأصناف ضمن الحدود الآمنة"
            >
              {(rows) => <LowStockList rows={rows} />}
            </SectionBody>
          </Panel>
        )}
      </div>

      {/* ---------------- activity ---------------- */}
      {snapshot.activity && (
        <Panel title="آخر النشاطات" subtitle="أحدث الإجراءات المسجّلة في النظام">
          <SectionBody
            section={snapshot.activity}
            isEmpty={(rows) => rows.length === 0}
            empty="لا توجد أنشطة مسجّلة بعد"
          >
            {(rows) => <ActivityList rows={rows} />}
          </SectionBody>
        </Panel>
      )}
    </div>
  );
}
