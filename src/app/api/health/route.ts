import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { diagnoseConnection, logConnectionDiagnosis } from "@/server/db-diagnose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check.
 *
 * Answers one question — is the app up and can it reach its database — and nothing
 * more. No version numbers, no connection strings, no schema details, no error text:
 * an unauthenticated endpoint is a reconnaissance surface, so a failure returns 503
 * and a fixed message while the real cause goes to the server log.
 */
/** Length-independent comparison, so a wrong token reveals nothing by how long it takes. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i++) differences |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differences === 0;
}

export async function GET(request: Request) {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        latencyMs: Date.now() - startedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] database check failed", error);

    /*
     * The pool reports every cause as a timeout, so the log above is not actionable
     * on its own. One direct connection recovers the server's real error and writes
     * it here — to the log only. The response below stays vague on purpose.
     */
    await logConnectionDiagnosis("health");

    /*
     * The detail is normally log-only, because a public endpoint that explains why
     * a database refused it is describing the infrastructure to strangers. But an
     * operator without shell access cannot read that log, and a 503 with no cause
     * is a dead end.
     *
     * So the reason is returned only when the caller presents a token the operator
     * put in the environment themselves. No token set, or a wrong one, and the
     * response is exactly as before. The token is compared in full — an early
     * return on the first wrong character leaks its length through timing.
     */
    const expected = process.env.HEALTH_DIAGNOSTIC_TOKEN;
    const offered = new URL(request.url).searchParams.get("token");

    if (expected && offered && timingSafeEqual(offered, expected)) {
      const { diagnosis, detail } = await diagnoseConnection();
      return NextResponse.json(
        { status: "degraded", database: "unreachable", diagnosis, detail },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
