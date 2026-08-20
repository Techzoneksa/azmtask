import { CircleDashed, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, PageHeader } from "@/components/ui";

/**
 * Placeholder body for a module whose data layer lands in a later stage.
 *
 * The route, its permission guard, its title and its navigation entry are all real —
 * what is missing is the data, and this states exactly that rather than showing a
 * fake table or a button that does nothing.
 */
export function ModuleScaffold({
  title,
  description,
  icon: Icon = CircleDashed,
  stage,
  capabilities,
  actions,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** Which build stage delivers this module's working functionality. */
  stage: string;
  capabilities: string[];
  actions?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />

      <Card>
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-inset">
            <Icon className="h-6 w-6 text-content-subtle" aria-hidden />
          </div>

          <h2 className="text-[15px] font-semibold text-content">
            الشاشة جاهزة — بانتظار ربط البيانات
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-content-muted">
            تم إنشاء المسار والصلاحيات والتنقل الخاص بهذه الوحدة ضمن{" "}
            <span className="font-medium text-content">المرحلة 1</span>. تُفعَّل
            وظائفها الفعلية في{" "}
            <span className="font-medium text-brand-700">{stage}</span>.
          </p>

          <div className="mt-7 w-full max-w-lg rounded-lg border border-line bg-surface-muted p-4 text-start">
            <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-content-subtle">
              ما ستوفره هذه الشاشة
            </p>
            <ul className="space-y-2">
              {capabilities.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[13px] text-content-muted">
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"
                    aria-hidden
                  />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </>
  );
}
