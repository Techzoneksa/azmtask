import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/guard";
import { AppError } from "@/server/errors";
import { getGuestDetails, listGuestNationalities } from "@/server/services/guest.service";
import { getAccessiblePropertyIds } from "@/server/services/property.service";

/**
 * Editing a guest.
 *
 * Always an edit of the same record. The guest id is what every reservation, payment,
 * invoice and log entry hangs from, so a correction to a phone number must never
 * become a new profile — the service enforces that, and this page only ever hands it
 * an existing id.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "تعديل بيانات النزيل" };

import { GuestForm } from "../../components/GuestForm";

export default async function EditGuestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("guests.edit");
  const { id } = await params;

  const propertyIds = await getAccessiblePropertyIds();

  let profile;
  try {
    profile = await getGuestDetails(id, propertyIds, new Set(session.permissions));
  } catch (error) {
    // A guest that does not exist and one the caller may not reach look identical, on
    // purpose: otherwise an id becomes a way to test for existence.
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const nationalities = await listGuestNationalities();
  const { guest } = profile;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تعديل بيانات النزيل"
        description={guest.fullName}
        actions={
          <Link
            href={`/guests/${guest.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-content transition-colors hover:bg-surface-inset"
          >
            <ArrowRight className="size-4" aria-hidden />
            رجوع للملف
          </Link>
        }
      />

      <div className="max-w-3xl">
        <GuestForm
          mode="edit"
          nationalities={nationalities}
          initial={{
            guestId: guest.id,
            fullName: guest.fullName,
            mobile: guest.mobile ?? "",
            email: guest.email ?? "",
            nationality: guest.nationality ?? "",
            identificationType: guest.identificationType ?? "",
            // Editing requires `guests.edit`, which is exactly the permission that
            // grants the raw number — so the field is always editable, never
            // pre-filled with a mask that would be saved back over the real value.
            identificationNumber: guest.identificationNumber ?? "",
            dateOfBirth: guest.dateOfBirth ?? "",
            gender: guest.gender ?? "",
            preferences: guest.preferences ?? "",
            notes: guest.notes ?? "",
          }}
        />
      </div>
    </div>
  );
}
