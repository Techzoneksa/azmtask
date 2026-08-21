"use server";

import { revalidatePath } from "next/cache";

import { assertPermission } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { serializeError } from "@/server/errors";
import {
  createGuest,
  findGuestCandidates,
  updateGuest,
  type DuplicateCandidate,
} from "@/server/services/guest.service";

/**
 * Write endpoints for the guests module.
 *
 * The client sends what to record; it never sends who it is. Identity and permission
 * are re-derived here from the session on every call, so a crafted request carries no
 * more authority than the person making it already had.
 */

export type ActionResult =
  | { ok: true; guestId: string }
  | { ok: false; error: string; code: string; fields?: Record<string, string> };

async function actor(permission: Parameters<typeof assertPermission>[0]) {
  await assertPermission(permission);
  const session = await getSession();
  if (!session) throw new Error("لا توجد جلسة نشطة.");

  return { id: session.id, name: session.name, email: session.email, roles: session.roleKeys };
}

export async function createGuestAction(input: unknown): Promise<ActionResult> {
  try {
    const who = await actor("guests.create");
    const guest = await createGuest(input as never, who);
    revalidatePath("/guests");
    return { ok: true, guestId: guest.id };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function updateGuestAction(input: unknown): Promise<ActionResult> {
  try {
    const who = await actor("guests.edit");
    const guest = await updateGuest(input as never, who);
    revalidatePath("/guests");
    revalidatePath(`/guests/${guest.id}`);
    return { ok: true, guestId: guest.id };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

/**
 * Looks for existing profiles matching what has been typed so far.
 *
 * Called while the form is still being filled in, so reception sees "this person is
 * already in the system" before writing the rest of the record — not after pressing
 * save. Returns matches only; the decision stays with the user.
 */
export async function findCandidatesAction(input: {
  mobile?: string | null;
  email?: string | null;
  identificationType?: string | null;
  identificationNumber?: string | null;
  excludeGuestId?: string;
}): Promise<DuplicateCandidate[]> {
  try {
    await assertPermission("guests.view");
    const { excludeGuestId, ...fields } = input;
    return await findGuestCandidates(fields, { excludeGuestId });
  } catch {
    // A lookup that fails must not block the form — it is an aid, not a gate. The
    // real checks run inside createGuest, where they cannot be skipped.
    return [];
  }
}
