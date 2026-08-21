"use server";

import { assertPermission } from "@/lib/auth/guard";
import { listGuests } from "@/server/services/guest.service";
import { getAccessiblePropertyIds } from "@/server/services/property.service";

/**
 * Guest lookup for the booking form.
 *
 * Delegates to the Phase 6 directory, so the same three search lanes apply — a whole
 * mobile is an exact match, a partial number is a prefix, and text searches the name.
 * The projection is narrowed to what a picker shows: a name and a phone, never a
 * document or a stay history.
 */
export async function searchGuestsAction(
  term: string,
): Promise<Array<{ id: string; fullName: string; mobile: string | null }>> {
  try {
    await assertPermission("guests.view");
    const propertyIds = await getAccessiblePropertyIds();

    const { rows } = await listGuests(propertyIds, { q: term, page: 1, pageSize: 8 });
    return rows.map((row) => ({ id: row.id, fullName: row.fullName, mobile: row.mobile }));
  } catch {
    // A failing lookup must degrade to "no matches", not break the booking form.
    return [];
  }
}
