import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { toISODate } from "@/lib/datetime";
import * as Money from "@/lib/money";
import { getBusinessDate } from "@/server/business-date";
import { getVatRate } from "@/server/pricing";
import { getCurrentProperty } from "@/server/services/property.service";
import { listUnitTypes } from "@/server/services/unit.service";

import { BookingForm } from "../components/BookingForm";

/**
 * Taking a booking.
 *
 * Its own route rather than a dialog: five sections, a live availability grid and a
 * price breakdown do not fit a modal on the phone reception actually holds — and a
 * URL means a half-filled form survives the back button.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "حجز جديد" };

export default async function NewReservationPage() {
  await requirePermission("reservations.create", "/reservations/new");

  const property = await getCurrentProperty();
  if (!property) {
    return (
      <div className="space-y-6">
        <PageHeader title="حجز جديد" description="اختيار النزيل والتواريخ والوحدة" />
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لا توجد منشأة مُهيّأة بعد</p>
        </div>
      </div>
    );
  }

  const [unitTypes, vatRate, businessDate, canOverrideRate] = await Promise.all([
    listUnitTypes(property.id),
    getVatRate(property.id),
    getBusinessDate(),
    // Negotiating a rate is a pricing decision, so it follows the edit permission
    // rather than the create one: anyone may take a booking, not everyone may discount.
    can("reservations.edit"),
  ]);

  const active = unitTypes.filter((type) => type.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <PageHeader
        title="حجز جديد"
        description="التوفر محسوب على الفترة المطلوبة فعليًا — لا على حالة الوحدة اليوم."
        actions={
          <Link
            href="/reservations"
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-content transition-colors hover:bg-surface-inset"
          >
            <ArrowRight className="size-4" aria-hidden />
            كل الحجوزات
          </Link>
        }
      />

      {active.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لا توجد أنواع وحدات مفعّلة</p>
          <p className="mt-1.5 text-[13px] text-content-muted">
            أضِف نوع وحدة واحدًا على الأقل قبل استقبال الحجوزات.
          </p>
          <Link
            href="/units/types"
            className="mt-4 inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-[13px] font-medium text-content transition-colors hover:bg-surface-inset"
          >
            أنواع الوحدات
          </Link>
        </div>
      ) : (
        <div className="max-w-4xl">
          <BookingForm
            mode="create"
            canOverrideRate={canOverrideRate}
            vatRate={Money.toAmountString(vatRate)}
            businessDate={toISODate(businessDate)}
            unitTypes={active.map((type) => ({
              id: type.id,
              name: type.name,
              capacity: type.capacity,
              baseRate: type.baseRate,
            }))}
          />
        </div>
      )}
    </div>
  );
}
