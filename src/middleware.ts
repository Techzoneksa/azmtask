import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

/**
 * Edge session gate.
 *
 * Decides only one thing: does this request carry a valid session? Whether that
 * session may see a particular screen is decided on the server by the page's own
 * `requirePermission` guard, next to the data it protects.
 */

/** Paths reachable without a session. */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  if (session) return NextResponse.next();

  // Unauthenticated API calls get a status code, not an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "لم يتم تسجيل الدخول" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }

  const response = NextResponse.redirect(loginUrl);
  // Clear an expired or tampered cookie so the browser stops resending it.
  if (token) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets:
     * _next/static, _next/image, favicon, and files with an extension.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)",
  ],
};
