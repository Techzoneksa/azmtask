import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

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
export async function GET() {
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

    return NextResponse.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
