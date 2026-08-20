import "server-only";

import { redirect } from "next/navigation";

import type { Permission } from "@/lib/permissions";

import { getSession, type Session } from "./session";

/**
 * Server-side authorization.
 *
 * The middleware only decides whether a request carries a valid session; deciding
 * whether that session may see a specific page or run a specific action happens
 * here, on the server, next to the data. Hiding a button in the UI is a courtesy,
 * never the control.
 */

/** Session or a redirect to the login screen. Never returns null. */
export async function requireSession(returnTo?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const target = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";
    redirect(target);
  }
  return session;
}

/** Session holding `permission`, or a redirect to the no-access screen. */
export async function requirePermission(
  permission: Permission,
  returnTo?: string,
): Promise<Session> {
  const session = await requireSession(returnTo);
  if (!session.permissions.includes(permission)) {
    redirect(`/no-access?required=${encodeURIComponent(permission)}`);
  }
  return session;
}

/** Non-redirecting check, for conditionally rendering parts of a page. */
export async function can(permission: Permission): Promise<boolean> {
  const session = await getSession();
  return session?.permissions.includes(permission) ?? false;
}

/**
 * Guard for server actions and route handlers, where a redirect is the wrong answer.
 * Throws so the caller's error boundary turns it into a 403 rather than silently
 * continuing with an unauthorized write.
 */
export async function assertPermission(permission: Permission): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new AuthorizationError("لم يتم تسجيل الدخول", 401);
  }
  if (!session.permissions.includes(permission)) {
    throw new AuthorizationError("لا تملك صلاحية تنفيذ هذا الإجراء", 403);
  }
  return session;
}

export class AuthorizationError extends Error {
  readonly status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}
