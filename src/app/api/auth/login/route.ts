import { NextResponse } from "next/server";
import { z } from "zod";

import { createSession } from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/auth/users";
import { defaultRouteFor } from "@/lib/nav";
import { permissionsForRole } from "@/lib/permissions";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().trim().min(1, "البريد الإلكتروني مطلوب").email("صيغة البريد الإلكتروني غير صحيحة"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

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

  const result = await verifyCredentials(parsed.data.email, parsed.data.password);

  if (!result.ok) {
    // The same message for a wrong password and an unknown email — revealing which
    // one failed would let an attacker enumerate valid accounts.
    const message =
      result.reason === "inactive"
        ? "هذا الحساب موقوف. تواصل مع مدير النظام."
        : "البريد الإلكتروني أو كلمة المرور غير صحيحة";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  await createSession(result.user);

  return NextResponse.json({
    ok: true,
    redirectTo: defaultRouteFor(permissionsForRole(result.user.role)),
  });
}
