import "server-only";

import type { Db } from "@/lib/db";
import { businessToday } from "@/lib/datetime";

/**
 * Document numbering.
 *
 * Reservation, payment, invoice and expense numbers are what staff and guests
 * quote to each other, so they must be sequential, readable and never reused.
 *
 * Generating them from `MAX(number) + 1` is the obvious approach and it is wrong:
 * two receptionists confirming a booking in the same second both read the same
 * maximum. Instead each sequence is a row in `system_settings`, locked FOR UPDATE
 * before it is read, which serialises concurrent callers behind the database.
 *
 * Always call inside a transaction — the lock is only held until it commits.
 */

export type DocumentKind = "RES" | "PAY" | "INV" | "EXP" | "MNT" | "HKP";

const PREFIXES: Record<DocumentKind, string> = {
  RES: "RES",
  PAY: "PAY",
  INV: "INV",
  EXP: "EXP",
  MNT: "MNT",
  HKP: "HKP",
};

/**
 * Returns the next number for a kind, scoped per year: `RES-2026-000042`.
 *
 * The sequence is **global, not per property**, and that is deliberate — the columns
 * these numbers land in (`reservations.reservationNumber`, `invoices.invoiceNumber`,
 * and the rest) carry a global unique constraint. A per-property counter under a
 * global constraint is incoherent: every property's first booking of the year would
 * be `RES-2026-000001`, and the second property to take one would be rejected by the
 * database. It worked only because the deployment had one property.
 *
 * `propertyId` is still accepted, because it is the thing that would have to change
 * if per-property sequences are ever wanted. That is a schema decision, not a
 * numbering one: the unique constraint would have to become `(propertyId, number)`
 * and the number would have to carry a property discriminator, or two properties
 * would still print the same reference on two different folios.
 *
 * Restarting the count each year keeps numbers short and is what accounting expects.
 */
export async function nextDocumentNumber(
  tx: Db,
  kind: DocumentKind,
  propertyId: string,
  at: Date = businessToday(),
): Promise<string> {
  const year = at.getUTCFullYear();
  const sequenceKey = `sequence:${kind}:${year}`;

  /*
   * The counter row is global, so it is stored with a null property. `= NULL` never
   * matches in SQL — the comparison has to be `IS NULL`, and getting that wrong is
   * how a lock silently protects nothing and every caller reads the same value.
   */
  const locked = await tx.$queryRawUnsafe<Array<{ value: string }>>(
    "SELECT `value` FROM `system_settings` WHERE `propertyId` IS NULL AND `key` = ? FOR UPDATE",
    sequenceKey,
  );

  const current = locked.length > 0 ? Number.parseInt(locked[0].value, 10) : 0;
  const next = (Number.isFinite(current) ? current : 0) + 1;

  /*
   * Raw, because Prisma's composite-unique `where` cannot express a null component —
   * and this row's uniqueness is precisely (null, key). ON DUPLICATE KEY makes the
   * first-ever call safe: a row that does not exist yet cannot be locked, so two
   * callers can reach here together, and the loser becomes an update.
   */
  await tx.$executeRawUnsafe(
    "INSERT INTO `system_settings` (`id`, `propertyId`, `key`, `value`, `updatedAt`) " +
      "VALUES (?, NULL, ?, ?, NOW(3)) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updatedAt` = NOW(3)",
    `seq_${kind}_${year}`,
    sequenceKey,
    String(next),
  );

  return `${PREFIXES[kind]}-${year}-${String(next).padStart(6, "0")}`;
}
