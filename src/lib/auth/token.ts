import { SignJWT, jwtVerify } from "jose";

/**
 * Session token.
 *
 * The token carries identity and nothing else — a user id, plus a name and email
 * for cheap display. It deliberately does not carry permissions.
 *
 * That matters: a token is a snapshot signed at login and valid for hours. If it
 * carried permissions, revoking a role would leave every already-issued session
 * holding the old access until it expired. Permissions are therefore resolved from
 * the database on each request, and a change takes effect on the very next one.
 *
 * Kept free of `next/headers`, Prisma and Node built-ins so the Edge middleware can
 * verify a request before it reaches a route handler.
 */

export const SESSION_COOKIE = "nokhba_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // one working shift

const ISSUER = "nokhba-pms";
const AUDIENCE = "nokhba-pms-web";

/** Everything the token itself asserts. Authorization is not part of it. */
export type SessionIdentity = {
  userId: string;
  name: string;
  email: string;
};

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

export async function signSession(identity: SessionIdentity): Promise<string> {
  return new SignJWT({ name: identity.name, email: identity.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/**
 * Returns the identity a valid token asserts, or null for anything else — expired,
 * tampered with, or signed by a different key. Proves only that the bearer signed in
 * as this user; what they may then do is decided against the database.
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionIdentity | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }

    return {
      userId: payload.sub,
      name: typeof payload.name === "string" ? payload.name : payload.email,
      email: payload.email,
    };
  } catch {
    return null;
  }
}
