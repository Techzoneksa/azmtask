import Link from "next/link";
import type { Metadata } from "next";
import { UserPlus } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth/guard";
import { formatNumber } from "@/lib/format";
import {
  getAccessiblePropertyIds,
  getCurrentProperty,
} from "@/server/services/property.service";
import {
  GuestFilterSchema,
  listGuestNationalities,
  listGuests,
} from "@/server/services/guest.service";

import { GuestFilters } from "./components/GuestFilters";
import { GuestsTable } from "./components/GuestsTable";
import { PagerLinks } from "./components/PagerLinks";

/**
 * The guest directory.
 *
 * Reception's most-used screen after the dashboard, and its job is one thing: find a
 * person in a few seconds. So the search box is the first element, the whole row opens
 * the profile, and nothing competes with either.
 *
 * Dynamic: a guest checks in and their row changes. A directory cached for a minute
 * shows the desk a guest as "not arrived" while they are standing at it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "النزلاء" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function GuestsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("guests.view", "/guests");

  const [property, propertyIds, canCreate] = await Promise.all([
    getCurrentProperty(),
    getAccessiblePropertyIds(),
    can("guests.create"),
  ]);

  if (!property) {
    return (
      <div className="space-y-6">
        <PageHeader title="النزلاء" description="سجل النزلاء وبياناتهم وتاريخ إقاماتهم" />
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لا توجد منشأة مُهيّأة بعد</p>
        </div>
      </div>
    );
  }

  const raw = await searchParams;
  const value = (key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key]);

  /*
   * A hand-edited or stale URL falls back to defaults rather than erroring. Someone
   * arriving from an old bookmark should see the directory, not a stack trace.
   */
  const parsed = GuestFilterSchema.safeParse({
    q: value("q"),
    nationality: value("nationality"),
    identificationType: value("identificationType"),
    status: value("status"),
    page: value("page") ?? 1,
    pageSize: 25,
  });

  const filters = parsed.success ? parsed.data : GuestFilterSchema.parse({ page: 1, pageSize: 25 });

  const [{ rows, total, page, pageSize }, nationalities] = await Promise.all([
    listGuests(propertyIds, filters),
    listGuestNationalities(),
  ]);

  const filtered = Boolean(
    filters.q || filters.nationality || filters.identificationType || filters.status,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="النزلاء"
        description={`${formatNumber(total)} نزيل${filtered ? " مطابق للبحث" : ""} في ${property.name}`}
        actions={
          canCreate ? (
            <Link
              href="/guests/new"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
            >
              <UserPlus className="size-4" aria-hidden />
              إضافة نزيل
            </Link>
          ) : undefined
        }
      />

      <GuestFilters nationalities={nationalities} />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          {/* Two different situations, two different messages: an empty directory
              needs a first guest, an empty search needs a different term. */}
          {filtered ? (
            <>
              <p className="text-[15px] font-medium text-content">لا يوجد نزيل مطابق</p>
              <p className="mt-1.5 text-[13px] text-content-muted">
                جرّب رقم الجوال أو رقم الوثيقة — البحث بالاسم يحتاج تطابقًا في الكتابة.
              </p>
              {canCreate && (
                <Link
                  href="/guests/new"
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3.5 text-[13px] font-medium text-content transition-colors hover:bg-surface-inset"
                >
                  <UserPlus className="size-4" aria-hidden />
                  إضافة نزيل جديد
                </Link>
              )}
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-content">لم يُسجَّل نزلاء بعد</p>
              <p className="mt-1.5 text-[13px] text-content-muted">
                ملف النزيل هوية دائمة — يُنشأ مرة ويُستخدم في كل حجز لاحق.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-3 sm:p-4">
          <GuestsTable rows={rows} />
          {total > pageSize && (
            <div className="mt-4 border-t border-line pt-4">
              <PagerLinks
                page={page}
                pageSize={pageSize}
                total={total}
                params={{
                  q: filters.q,
                  nationality: filters.nationality,
                  identificationType: filters.identificationType,
                  status: filters.status,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
