import { SignJWT, jwtVerify } from "jose";

import { isRole, permissionsForRole, type Permission, type Role } from "@/lib/permissions";

/**
 * Session token handling.
 *
 * Kept free of `next/headers` and Node built-ins so the Edge middleware can verify a
 * request before it ever reaches a route handler.
 */

export const SESSION_COOKIE = "nokhba_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // one working shift

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string;
  propertyId: string | null;
};

export type Session = SessionUser & {
  permissions: readonly Permission[];
};

const ISSUER = "nokhba-pms";
const AUDIENCE = "nokhba-pms-web";

let cachedKey: Uint8Array | null = null;

function secretKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or shorter than 32 characters. Set it in the environment before starting the app.",
    );
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    name: user.name,
    email: user.email,
    role: user.role,
    jobTitle: user.jobTitle,
    propertyId: user.propertyId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/**
 * Returns the session for a valid token, or null for anything else — expired,
 * tampered with, signed by another key, or carrying a role we no longer recognise.
 * Permissions are always re-derived from the role here, never read from the token,
 * so a role's permission set can change without re-issuing every session.
 */
export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const role = payload.role;
    if (!isRole(role)) return null;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;

    return {
      id: payload.sub,
      name: typeof payload.name === "string" ? payload.name : payload.email,
      email: payload.email,
      role,
      jobTitle: typeof payload.jobTitle === "string" ? payload.jobTitle : "",
      propertyId: typeof payload.propertyId === "string" ? payload.propertyId : null,
      permissions: permissionsForRole(role),
    };
  } catch {
    return null;
  }
}
