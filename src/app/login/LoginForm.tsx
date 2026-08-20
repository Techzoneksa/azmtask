"use client";

import { AlertCircle, KeyRound, LogIn, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Input } from "@/components/ui";
/** Identity-only view of a demo account — no credentials cross into the client. */
export type DemoAccountOption = {
  email: string;
  roleName: string;
  roleDescription: string;
};

/** Rejects absolute URLs so `?next=` cannot be used to bounce off our domain. */
function safeNext(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function LoginForm({
  nextPath,
  demoAccounts = [],
  demoPassword,
  unavailable = false,
}: {
  nextPath?: string;
  demoAccounts?: DemoAccountOption[];
  demoPassword?: string;
  /** The service could not reach its database. Say so before anyone tries. */
  unavailable?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as { error?: string; redirectTo?: string };

      if (!response.ok) {
        setError(data.error ?? "تعذّر تسجيل الدخول. أعد المحاولة.");
        setSubmitting(false);
        return;
      }

      router.replace(safeNext(nextPath) ?? data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setError("تعذّر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة.");
      setSubmitting(false);
    }
  }

  function fillDemoAccount(accountEmail: string) {
    setEmail(accountEmail);
    setPassword(demoPassword ?? "");
    setError(null);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {/*
          Shown before anyone types: the service is up but cannot reach its data, so
          a sign-in cannot succeed no matter how correct the credentials are. Saying
          that up front beats letting someone doubt their own password.
        */}
        {unavailable && !error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-warn-fg/25 bg-warn-bg px-3.5 py-3"
          >
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-warn-fg" aria-hidden />
            <p className="text-[13px] leading-relaxed text-warn-fg">
              الخدمة غير متاحة مؤقتًا — تعذّر الاتصال بقاعدة البيانات. تسجيل الدخول
              لن ينجح حتى تُستعاد. راجع مدير النظام.
            </p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3"
          >
            <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-danger-fg" aria-hidden />
            <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>
          </div>
        )}

        <Input
          label="البريد الإلكتروني"
          type="email"
          name="email"
          autoComplete="username"
          dir="ltr"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          leading={<Mail className="h-4 w-4" aria-hidden />}
        />

        <Input
          label="كلمة المرور"
          type="password"
          name="password"
          autoComplete="current-password"
          dir="ltr"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          leading={<KeyRound className="h-4 w-4" aria-hidden />}
        />

        <Button type="submit" size="lg" icon={LogIn} loading={submitting} className="w-full">
          {submitting ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
        </Button>
      </form>

      {demoAccounts.length > 0 && demoPassword && (
      <div className="rounded-card border border-line bg-surface-muted p-4">
        <p className="text-[13px] font-semibold text-content">حسابات العرض التجريبي</p>
        <p className="mt-1 text-[12px] leading-relaxed text-content-muted">
          اختر أحد الحسابات لتجربة اختلاف الصلاحيات بين الأدوار. كلمة المرور للجميع:{" "}
          <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-content" dir="ltr">
            {demoPassword}
          </span>
        </p>

        <ul className="mt-3 space-y-1.5">
          {demoAccounts.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => fillDemoAccount(account.email)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-start transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-content">
                    {account.roleName}
                  </span>
                  <span className="block truncate text-[11px] text-content-subtle">
                    {account.roleDescription}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[11px] text-content-subtle"
                  dir="ltr"
                >
                  {account.email.split("@")[0]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      )}
    </div>
  );
}
