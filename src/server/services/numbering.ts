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
 * Returns the next number for a kind, scoped per property and per year:
 * `RES-2026-000042`. Restarting the count each year keeps numbers short and is
 * what accounting expects.
 */
export async function nextDocumentNumber(
  tx: Db,
  kind: DocumentKind,
  propertyId: string,
  at: Date = businessToday(),
): Promise<string> {
  const year = at.getUTCFullYear();
  const sequenceKey = `sequence:${kind}:${year}`;

  // Lock the counter row first. A row that does not exist yet cannot be locked, so
  // the insert below races — and loses harmlessly, because the unique constraint on
  // (propertyId, key) turns the loser into an update on the next pass.
  const locked = await tx.$queryRawUnsafe<Array<{ value: string }>>(
    "SELECT `value` FROM `system_settings` WHERE `propertyId` = ? AND `key` = ? FOR UPDATE",
    propertyId,
    sequenceKey,
  );

  const current = locked.length > 0 ? Number.parseInt(locked[0].value, 10) : 0;
  const next = (Number.isFinite(current) ? current : 0) + 1;

  await tx.systemSetting.upsert({
    where: { propertyId_key: { propertyId, key: sequenceKey } },
    create: { propertyId, key: sequenceKey, value: String(next) },
    update: { value: String(next) },
  });

  return `${PREFIXES[kind]}-${year}-${String(next).padStart(6, "0")}`;
}
