"use server";

import { revalidatePath } from "next/cache";

import { assertPermission } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AppError, serializeError } from "@/server/errors";
import {
  CHECK_IN_PERMISSION,
  checkInReservation,
  markNoShow,
  type CheckInResult,
} from "@/server/services/checkin.service";
import { updateGuest } from "@/server/services/guest.service";
import { getAccessiblePropertyIds } from "@/server/services/property.service";

/**
 * Write endpoints for arrivals.
 *
 * The client sends which booking and which room; it never sends who it is or which
 * property it may touch. Both are re-derived here from the session on every call, so
 * a crafted request carries no more authority than the person making it already had.
 *
 * Neither of these re-implements a rule. Eligibility, guest requirements, availability,
 * readiness and locking all live in the service — an action that decided any of them
 * for itself would be a second implementation, and the one that matters is whichever
 * one the database ends up believing.
 */

export type CheckInActionResult =
  | { ok: true; result: CheckInResult }
  | { ok: false; error: string; code: string; fields?: Record<string, string> };

export type NoShowActionResult =
  | { ok: true; reservationId: string }
  | { ok: false; error: string; code: string; fields?: Record<string, string> };

async function context() {
  await assertPermission(CHECK_IN_PERMISSION);
  const session = await getSession();
  const propertyIds = await getAccessiblePropertyIds();

  if (!session || propertyIds.length === 0) {
    throw new Error("لا توجد جلسة أو منشأة نشطة.");
  }

  return {
    propertyIds,
    actor: { id: session.id, name: session.name, email: session.email, roles: session.roleKeys },
  };
}

/**
 * Every surface that shows where a guest is has just changed its answer, so all of
 * them are revalidated together. Leaving one out is how a room board keeps insisting
 * a room is free while the guest is standing in it.
 */
function revalidateAfterStayChange(reservationId: string, unitId?: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath(`/reservations/${reservationId}/check-in`);
  revalidatePath("/reservations/calendar");
  revalidatePath("/units");
  if (unitId) revalidatePath(`/units/${unitId}`);
  revalidatePath("/guests");
}

export async function checkInAction(input: {
  reservationId: string;
  unitId?: string | null;
  notes?: string | null;
}): Promise<CheckInActionResult> {
  try {
    const { propertyIds, actor } = await context();
    const result = await checkInReservation(input, actor, propertyIds);

    revalidateAfterStayChange(result.reservationId, result.unitId);
    revalidatePath(`/guests/${result.guestId}`);

    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function markNoShowAction(input: {
  reservationId: string;
  reason: string;
}): Promise<NoShowActionResult> {
  try {
    const { propertyIds, actor } = await context();
    const result = await markNoShow(input, actor, propertyIds);

    revalidateAfterStayChange(result.reservationId);

    return { ok: true, reservationId: result.reservationId };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export type CompleteGuestResult =
  | { ok: true; guestId: string }
  | { ok: false; error: string; code: string; fields?: Record<string, string> };

/**
 * Fills in the operational fields a guest record is missing, from the arrival screen.
 *
 * It does not validate anything itself. The submitted fields are merged over the
 * profile as it stands and handed to `updateGuest`, so normalisation, the document
 * uniqueness constraint and the duplicate check are the same ones the guest module
 * enforces — reached by a different door, not reimplemented behind it.
 *
 * Merging rather than replacing matters: this form shows five fields, and a plain
 * update built from five fields would silently erase the preferences and notes
 * somebody recorded on an earlier stay.
 */
export async function completeGuestForCheckInAction(input: {
  guestId: string;
  fullName?: string;
  mobile?: string;
  nationality?: string;
  identificationType?: string;
  identificationNumber?: string;
  confirmDuplicate?: boolean;
}): Promise<CompleteGuestResult> {
  try {
    await assertPermission("guests.edit");
    const session = await getSession();
    if (!session) throw new Error("لا توجد جلسة نشطة.");

    const existing = await prisma.guest.findUnique({
      where: { id: input.guestId },
      select: {
        id: true,
        fullName: true,
        mobile: true,
        email: true,
        nationality: true,
        identificationType: true,
        identificationNumber: true,
        dateOfBirth: true,
        gender: true,
        preferences: true,
        notes: true,
      },
    });

    if (!existing) throw new AppError("NOT_FOUND", "النزيل غير موجود.");

    const pick = (submitted: string | undefined, current: string | null) => {
      const trimmed = submitted?.trim();
      return trimmed ? trimmed : current;
    };

    const guest = await updateGuest(
      {
        guestId: existing.id,
        fullName: pick(input.fullName, existing.fullName) ?? existing.fullName,
        mobile: pick(input.mobile, existing.mobile),
        email: existing.email,
        nationality: pick(input.nationality, existing.nationality),
        identificationType: pick(input.identificationType, existing.identificationType),
        identificationNumber: pick(input.identificationNumber, existing.identificationNumber),
        dateOfBirth: existing.dateOfBirth ? existing.dateOfBirth.toISOString().slice(0, 10) : null,
        gender: existing.gender,
        preferences: existing.preferences,
        notes: existing.notes,
        confirmDuplicate: input.confirmDuplicate ?? false,
      } as never,
      { id: session.id, name: session.name, email: session.email, roles: session.roleKeys },
    );

    revalidatePath(`/guests/${guest.id}`);
    revalidatePath("/guests");

    return { ok: true, guestId: guest.id };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}
