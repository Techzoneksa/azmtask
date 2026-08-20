import "server-only";

import { z } from "zod";

/**
 * Environment validation.
 *
 * Parsed once, at first import on the server. A misconfigured deployment fails here
 * with a message naming the variable, rather than starting up and failing later in
 * a way that looks like an application bug — or worse, silently falling back to an
 * insecure default.
 */

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL مطلوب")
    .refine((value) => value.startsWith("mysql://"), {
      message: "DATABASE_URL يجب أن يبدأ بـ mysql://",
    }),

  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET يجب أن يكون 32 حرفًا على الأقل"),

  /** Optional: when set, the login screen lists the demo accounts. Unset in production. */
  DEMO_PASSWORD_HINT: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    // Never echo the values themselves — only which variable failed and why.
    throw new Error(
      `إعدادات البيئة غير صالحة. صحّح المتغيرات التالية قبل تشغيل التطبيق:\n${details}`,
    );
  }

  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}
