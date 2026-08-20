import { NextResponse } from "next/server";

import { getSession, destroySession } from "@/lib/auth/session";
import { recordActivity } from "@/server/services/activity.service";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();

  await destroySession();

  if (session) {
    await recordActivity({
      actor: {
        id: session.id,
        name: session.name,
        email: session.email,
        roles: session.roleKeys,
      },
      propertyId: session.propertyId,
      module: "auth",
      action: "logout",
      entityType: "User",
      entityId: session.id,
      description: `تسجيل خروج ${session.name}`,
    });
  }

  return NextResponse.json({ ok: true });
}
