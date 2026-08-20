import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { getAuthenticatedUser } from "@/server/services/user.service";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSession,
  verifySessionToken,
  type SessionIdentity,
} from "./token";

/**
 * The current session.
 *
 * Two steps, deliberately separate: the cookie proves *who* is asking, the database
 * decides *what they may do*. Permissions are never taken from the token, so
 * revoking a role is effective immediately rather than whenever sessions expire.
 *
 * `cache()` scopes one database read to one request — a page, its layout and any
 * server action it triggers all share a single lookup.
 */

export type Session = {
  id: string;
  name: string;
  email: string;
  /** Role keys held by the user; a user may hold more than one. */
  roleKeys: string[];
  roleNames: string[];
  /** Primary role, used for display where a single label is wanted. */
  role: string;
  jobTitle: string;
  propertyId: string | null;
  /** Effective permissions: the union of everything their roles grant. */
  permissions: Permission[];
};

const KNOWN_PERMISSIONS = new Set<string>(PERMISSIONS);

/**
 * Keeps only permission keys the application actually recognises. A stale row left
 * in the database after a rename should not become an unchecked capability.
 */
function knownPermissions(keys: string[]): Permission[] {
  return keys.filter((key): key is Permission => KNOWN_PERMISSIONS.has(key));
}

export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const identity = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!identity) return null;

  // The token may name a user who has since been deleted or disabled.
  const user = await getAuthenticatedUser(identity.userId);
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKeys: user.roleKeys,
    roleNames: user.roleNames,
    role: user.roleKeys[0] ?? "",
    jobTitle: user.roleNames[0] ?? "",
    propertyId: user.propertyId,
    permissions: knownPermissions(user.permissions),
  };
});

export async function createSession(identity: SessionIdentity): Promise<void> {
  const token = await signSession(identity);
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export type { SessionIdentity };
