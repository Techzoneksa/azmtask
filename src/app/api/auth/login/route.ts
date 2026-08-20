import { NextResponse } from "next/server";
import { z } from "zod";

import { createSession } from "@/lib/auth/session";
import { defaultRouteFor } from "@/lib/nav";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { toAppError } from "@/server/errors";
import { touchLastLogin, verifyCredentials } from "@/server/services/user.service";
import { recordActivity } from "@/server/services/activity.service";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "البريد الإلكتروني مطلوب")
    .email("صيغة البريد الإلكتروني غير صحيحة"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

const KNOWN_PERMISSIONS = new Set<string>(PERMISSIONS);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" },
      { status: 400 },
    );
  }

  try {
    const result = await verifyCredentials(parsed.data.email, parsed.data.password);

    if (!result.ok) {
      /*
       * One message for a wrong password, an unknown email and a disabled account.
       * Distinguishing them tells an attacker which addresses are worth attacking —
       * and the verification path already spends the same time on each.
       */
      return NextResponse.json(
        { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
        { status: 401 },
      );
    }

    await createSession({
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
    });

    await touchLastLogin(result.user.id);

    await recordActivity({
      actor: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        roles: result.user.roleKeys,
      },
      propertyId: result.user.propertyId,
      module: "auth",
      action: "login",
      entityType: "User",
      entityId: result.user.id,
      description: `تسجيل دخول ${result.user.name}`,
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    const permissions = result.user.permissions.filter(
      (key): key is Permission => KNOWN_PERMISSIONS.has(key),
    );

    return NextResponse.json({
      ok: true,
      redirectTo: defaultRouteFor(permissions),
    });
  } catch (error) {
    const appError = toAppError(error);
    console.error("[auth:login]", appError.cause ?? appError);

    // Never surface a database error verbatim on the login screen.
    return NextResponse.json(
      {
        error:
          appError.code === "UNAVAILABLE"
            ? "تعذّر الاتصال بقاعدة البيانات. حاول مجددًا بعد قليل."
            : "تعذّر تسجيل الدخول. حاول مجددًا.",
      },
      { status: appError.code === "UNAVAILABLE" ? 503 : 500 },
    );
  }
}
