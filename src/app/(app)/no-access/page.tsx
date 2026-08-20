import type { Metadata } from "next";
import Link from "next/link";

import { Card, NoAccessState } from "@/components/ui";
import { requireSession } from "@/lib/auth/guard";
import { defaultRouteFor } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/permissions";

export const metadata: Metadata = { title: "لا تملك صلاحية الوصول" };

/** Where a page guard sends a signed-in user who lacks the required permission. */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const session = await requireSession();
  const { required } = await searchParams;
  const home = defaultRouteFor(session.permissions);

  return (
    <div className="mx-auto max-w-xl pt-6">
      <Card>
        <NoAccessState
          description={
            <>
              دورك الحالي هو{" "}
              <span className="font-medium text-content">{ROLE_LABELS[session.role]}</span>،
              وهو لا يشمل صلاحية فتح هذه الشاشة
              {required && (
                <>
                  {" "}
                  (<span className="font-mono text-[12px]" dir="ltr">{required}</span>)
                </>
              )}
              . إذا كنت بحاجة للوصول إليها تواصل مع مدير النظام.
            </>
          }
          action={
            <Link
              href={home}
              className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              العودة إلى الشاشة الرئيسية
            </Link>
          }
        />
      </Card>
    </div>
  );
}
