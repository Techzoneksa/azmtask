import { CircleDashed, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, PageHeader } from "@/components/ui";

/**
 * Placeholder body for a module whose screen has not been built yet.
 *
 * The route, its permission guard, its title and its navigation entry are all real.
 * What is missing is the screen — not the data, which several of these modules
 * already have in the database. Saying "waiting for the data" would send someone to
 * check a connection that is fine.
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
  /**
   * Which stage delivers this module. Must name a stage that has not happened yet —
   * a placeholder promising a stage already passed is worse than one promising
   * nothing, because it reads as a bug in the deployment.
   */
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
            هذه الشاشة قيد التطوير
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-content-muted">
            المسار والصلاحيات والتنقل جاهزة. تُبنى وظائف هذه الشاشة في{" "}
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
