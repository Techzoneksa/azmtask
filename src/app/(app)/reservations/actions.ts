"use server";

import { revalidatePath } from "next/cache";

import { assertPermission } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { serializeError } from "@/server/errors";
import { getReservationAvailability, type AvailabilityResult } from "@/server/services/availability.service";
import { createGuest } from "@/server/services/guest.service";
import { getAccessiblePropertyIds } from "@/server/services/property.service";
import {
  cancelReservation,
  confirmReservation,
  createReservation,
  updateReservation,
} from "@/server/services/reservation.service";

/**
 * Write endpoints for the booking module.
 *
 * The client sends what to book; it never sends who it is or which property it may
 * touch. Both are re-derived here from the session on every call, so a crafted
 * request carries no more authority than the person making it already had.
 *
 * None of these re-implement a rule. Availability, pricing, locking and the status
 * guards all live in the services — an action that decided any of them for itself
 * would be a second implementation, and the one that matters is whichever one the
 * database ends up believing.
 */

export type ActionResult =
  | { ok: true; reservationId: string; reservationNumber?: string }
  | { ok: false; error: string; code: string; fields?: Record<string, string> };

async function context(permission: Parameters<typeof assertPermission>[0]) {
  await assertPermission(permission);
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

export async function createReservationAction(input: unknown): Promise<ActionResult> {
  try {
    const { propertyIds, actor } = await context("reservations.create");

    // The property is the session's, never the payload's.
    const reservation = await createReservation(
      { ...(input as Record<string, unknown>), propertyId: propertyIds[0] } as never,
      actor,
    );

    revalidatePath("/reservations");
    revalidatePath("/dashboard");
    revalidatePath("/units");
    return {
      ok: true,
      reservationId: reservation.id,
      reservationNumber: reservation.reservationNumber,
    };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function updateReservationAction(input: unknown): Promise<ActionResult> {
  try {
    const { propertyIds, actor } = await context("reservations.edit");
    const reservation = await updateReservation(input as never, actor, propertyIds);

    revalidatePath("/reservations");
    revalidatePath(`/reservations/${reservation.id}`);
    revalidatePath("/dashboard");
    revalidatePath("/units");
    return { ok: true, reservationId: reservation.id };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function confirmReservationAction(reservationId: string): Promise<ActionResult> {
  try {
    const { propertyIds, actor } = await context("reservations.edit");
    const reservation = await confirmReservation(reservationId, propertyIds, actor);

    revalidatePath("/reservations");
    revalidatePath(`/reservations/${reservationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/units");
    return { ok: true, reservationId: reservation.id };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function cancelReservationAction(
  reservationId: string,
  reason: string | null,
): Promise<ActionResult> {
  try {
    const { propertyIds, actor } = await context("reservations.cancel");
    const reservation = await cancelReservation(reservationId, reason, actor, propertyIds);

    revalidatePath("/reservations");
    revalidatePath(`/reservations/${reservationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/units");
    return { ok: true, reservationId: reservation.id };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

/**
 * Live availability for the booking form.
 *
 * Exactly the function the save runs, so the rooms shown as free are the rooms the
 * server will accept. A preview computed one way and enforced another is how a system
 * shows a room and then refuses to sell it.
 */
export async function checkAvailabilityAction(input: {
  unitTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  excludeReservationId?: string;
}): Promise<
  { ok: true; availability: AvailabilityResult } | { ok: false; error: string }
> {
  try {
    await assertPermission("reservations.view");
    const propertyIds = await getAccessiblePropertyIds();
    if (propertyIds.length === 0) throw new Error("لا توجد منشأة نشطة.");

    const availability = await getReservationAvailability({
      propertyId: propertyIds[0],
      unitTypeId: input.unitTypeId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      excludeReservationId: input.excludeReservationId,
    });
    return { ok: true, availability };
  } catch (error) {
    return { ok: false, error: serializeError(error).error };
  }
}

/**
 * Creates a guest from inside the booking form.
 *
 * Delegates entirely to the Phase 6 service — the same normalization, the same
 * blocked document duplicate, the same warned shared mobile. A quick-create that
 * relaxed those rules would make the booking screen the way around them.
 */
export async function quickCreateGuestAction(
  input: unknown,
): Promise<
  | { ok: true; guestId: string; fullName: string }
  | { ok: false; error: string; code: string; fields?: Record<string, string> }
> {
  try {
    await assertPermission("guests.create");
    const session = await getSession();
    if (!session) throw new Error("لا توجد جلسة نشطة.");

    const guest = await createGuest(input as never, {
      id: session.id,
      name: session.name,
      email: session.email,
      roles: session.roleKeys,
    });
    return { ok: true, guestId: guest.id, fullName: guest.fullName };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}
