import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Brand } from "@/components/layout/Brand";
import { DEMO_ACCOUNTS } from "@/lib/auth/demo-accounts";
import { getSession } from "@/lib/auth/session";
import { defaultRouteFor } from "@/lib/nav";

import { LoginForm } from "./LoginForm";

/**
 * The demo-account shortcut list is opt-in via DEMO_PASSWORD_HINT. Leave that
 * variable unset in a real deployment and the panel disappears entirely — no
 * account list and no password ever reach the browser.
 */
const DEMO_PASSWORD_HINT = process.env.DEMO_PASSWORD_HINT?.trim() || null;

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // An already-signed-in visitor has no business on the login screen.
  const session = await getSession();
  if (session) redirect(defaultRouteFor(session.permissions));

  const { next } = await searchParams;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Brand className="mb-8" />
          <h1 className="text-2xl font-semibold tracking-tight text-content">
            تسجيل الدخول
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-content-muted">
            أدخل بيانات حسابك للوصول إلى نظام إدارة الفندق.
          </p>
          <div className="mt-7">
            <LoginForm
              nextPath={next}
              demoPassword={DEMO_PASSWORD_HINT ?? undefined}
              demoAccounts={
                DEMO_PASSWORD_HINT
                  ? DEMO_ACCOUNTS.map((account) => ({
                      email: account.email,
                      role: account.role,
                    }))
                  : []
              }
            />
          </div>
        </div>
      </div>

      {/* Brand panel — hidden on small screens where the form should own the viewport */}
      <div className="relative hidden overflow-hidden bg-brand-800 lg:block">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-center px-12 xl:px-16">
          <p className="text-[13px] font-medium uppercase tracking-wider text-brand-300">
            نظام إدارة الفنادق والشقق المخدومة
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-snug text-white xl:text-4xl">
            دورة تشغيلية كاملة
            <br />
            من الحجز حتى المغادرة
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-brand-100/85">
            إدارة الحجوزات والنزلاء والوحدات والنظافة والصيانة والمدفوعات والفواتير
            والتقارير من مكان واحد، بواجهة عربية مصممة لسرعة العمل في الاستقبال.
          </p>

          <ul className="mt-9 space-y-3">
            {[
              "لوحة تشغيل يومية بأرقام فعلية",
              "منع تعارض الحجوزات على الوحدة الواحدة",
              "ربط النظافة والصيانة بحالة الوحدة تلقائيًا",
              "صلاحيات دقيقة لكل دور وظيفي",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-[15px] text-brand-50">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/80"
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                    <path
                      d="m5 13 4 4L19 7"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
