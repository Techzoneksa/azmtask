import "server-only";

import bcrypt from "bcryptjs";

import { DEMO_ACCOUNTS, type DemoAccount } from "./demo-accounts";
import type { SessionUser } from "./token";

/**
 * Credential verification.
 *
 * `server-only` at the top is load-bearing: it makes the build fail rather than
 * quietly shipping bcrypt and the password hash to the browser if a client
 * component ever imports this file by mistake.
 *
 * Stage 2 swaps the in-memory roster for the `users` table; the two exported
 * functions keep their signatures so nothing calling them has to change.
 */

/** Shared demo password hash. Override per deployment via the environment. */
const DEMO_PASSWORD_HASH =
  process.env.DEMO_PASSWORD_HASH ??
  "$2a$10$4ZPq5tXp8bsPhw4LkLI9xu/asRUA4bQi1Y/Dj6gWBMMgH3QCKUEz6";

export async function findUserByEmail(email: string): Promise<DemoAccount | null> {
  const normalized = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((user) => user.email.toLowerCase() === normalized) ?? null;
}

export type CredentialResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "invalid" | "inactive" };

/**
 * Verifies an email/password pair. A missing user still runs a bcrypt comparison
 * against the same hash so response timing does not reveal which emails exist.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<CredentialResult> {
  const user = await findUserByEmail(email);

  if (!user) {
    await bcrypt.compare(password, DEMO_PASSWORD_HASH);
    return { ok: false, reason: "invalid" };
  }

  const matches = await bcrypt.compare(password, DEMO_PASSWORD_HASH);
  if (!matches) return { ok: false, reason: "invalid" };
  if (!user.active) return { ok: false, reason: "inactive" };

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      propertyId: user.propertyId,
    },
  };
}
