import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/guard";
import { listGuestNationalities } from "@/server/services/guest.service";

import { GuestForm } from "../components/GuestForm";

/**
 * Creating a guest.
 *
 * Its own route rather than a dialog: the form is long, the duplicate warning can list
 * several profiles, and a URL means the browser's back button does the right thing.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "إضافة نزيل" };

export default async function NewGuestPage() {
  await requirePermission("guests.create", "/guests/new");

  const nationalities = await listGuestNationalities();

  return (
    <div className="space-y-6">
      <PageHeader
        title="إضافة نزيل"
        description="ملف النزيل هوية دائمة — يُنشأ مرة ويُربط بكل حجز لاحق."
        actions={
          <Link
            href="/guests"
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-content transition-colors hover:bg-surface-inset"
          >
            <ArrowRight className="size-4" aria-hidden />
            كل النزلاء
          </Link>
        }
      />

      <div className="max-w-3xl">
        <GuestForm mode="create" nationalities={nationalities} />
      </div>
    </div>
  );
}
