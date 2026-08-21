import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { toISODate } from "@/lib/datetime";
import * as Money from "@/lib/money";
import { getBusinessDate } from "@/server/business-date";
import { AppError } from "@/server/errors";
import { getVatRate } from "@/server/pricing";
import { getAccessiblePropertyIds } from "@/server/services/property.service";
import { getReservationDetail } from "@/server/services/reservation.service";
import { listUnitTypes } from "@/server/services/unit.service";

import { BookingForm } from "../../components/BookingForm";

/**
 * Editing a booking.
 *
 * The same guards the detail page uses to decide whether to offer the button decide
 * here whether to render the form at all — and the service refuses the write
 * regardless. Three layers, one rule, evaluated in one place.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "تعديل الحجز" };

export default async function EditReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("reservations.edit");
  const { id } = await params;

  const propertyIds = await getAccessiblePropertyIds();

  let detail;
  try {
    detail = await getReservationDetail(id, propertyIds, new Set(session.permissions));
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [unitTypes, vatRate, businessDate, canOverrideRate] = await Promise.all([
    listUnitTypes(detail.propertyId),
    getVatRate(detail.propertyId),
    getBusinessDate(),
    can("reservations.edit"),
  ]);

  const back = (
    <Link
      href={`/reservations/${detail.id}`}
      className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-content transition-colors hover:bg-surface-inset"
    >
      <ArrowRight className="size-4" aria-hidden />
      رجوع للحجز
    </Link>
  );

  // A booking the rules will not let anyone change does not get a form that pretends
  // otherwise — it gets the reason, in the place the form would have been.
  if (!detail.guards.canEdit) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="تعديل الحجز"
          description={detail.reservationNumber}
          actions={back}
        />
        <div className="flex items-start gap-3 rounded-xl border border-warn-fg/25 bg-warn-bg px-4 py-3.5">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn-fg" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-warn-fg">لا يمكن تعديل هذا الحجز</p>
            <p className="mt-1 text-[12px] leading-relaxed text-warn-fg/90">
              {detail.guards.editBlockedReason}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const active = unitTypes.filter(
    (type) => type.status === "ACTIVE" || type.id === detail.stay.unitTypeId,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="تعديل الحجز"
        description={`${detail.reservationNumber} · ${detail.guest.fullName}`}
        actions={back}
      />

      <div className="max-w-4xl">
        <BookingForm
          mode="edit"
          canOverrideRate={canOverrideRate}
          vatRate={Money.toAmountString(vatRate)}
          businessDate={toISODate(businessDate)}
          unitTypes={active.map((type) => ({
            id: type.id,
            name: type.name,
            capacity: type.capacity,
            baseRate: type.baseRate,
          }))}
          initial={{
            reservationId: detail.id,
            guest: {
              id: detail.guest.id,
              fullName: detail.guest.fullName,
              mobile: detail.guest.mobile,
            },
            unitTypeId: detail.stay.unitTypeId,
            unitId: detail.stay.unitId ?? "",
            checkInDate: detail.stay.checkInDate,
            checkOutDate: detail.stay.checkOutDate,
            adults: String(detail.stay.adults),
            children: String(detail.stay.children),
            // Editing requires the permission that also allows rate changes, so the
            // real figures are always available to prefill here.
            nightlyRate: detail.financial?.nightlyRate ?? "",
            discount: detail.financial?.discount ?? "",
            source: detail.source,
            status: detail.status,
            specialRequests: detail.requests.specialRequests ?? "",
            internalNotes: detail.requests.internalNotes ?? "",
          }}
        />
      </div>
    </div>
  );
}
