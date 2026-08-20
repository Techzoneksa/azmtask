import { AlertTriangle, Inbox, Lock, SearchX, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Empty / error / no-access states.
 *
 * Every list in the system uses these rather than rendering nothing, so a screen
 * with no data still explains itself and offers the next action.
 */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-inset">
        <Icon className="h-6 w-6 text-content-subtle" aria-hidden />
      </div>
      <h3 className="text-[15px] font-semibold text-content">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-content-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Empty state tuned for "filters matched nothing" — a different problem from "no data yet". */
export function NoResultsState({
  onReset,
  query,
}: {
  onReset?: ReactNode;
  query?: string;
}) {
  return (
    <EmptyState
      icon={SearchX}
      title="لا توجد نتائج مطابقة"
      description={
        query
          ? `لم يُعثر على نتائج تطابق «${query}». جرّب تعديل كلمات البحث أو إزالة بعض عوامل التصفية.`
          : "لا توجد سجلات تطابق عوامل التصفية المحددة. جرّب توسيع نطاق البحث."
      }
      action={onReset}
    />
  );
}

export function ErrorState({
  title = "تعذّر تحميل البيانات",
  description = "حدث خطأ غير متوقع أثناء جلب البيانات. يمكنك إعادة المحاولة، وإذا تكرر الخطأ تواصل مع مدير النظام.",
  action,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg">
        <AlertTriangle className="h-6 w-6 text-danger-fg" aria-hidden />
      </div>
      <h3 className="text-[15px] font-semibold text-content">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-content-muted">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function NoAccessState({
  title = "لا تملك صلاحية الوصول",
  description,
  action,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warn-bg">
        <Lock className="h-6 w-6 text-warn-fg" aria-hidden />
      </div>
      <h3 className="text-[15px] font-semibold text-content">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-content-muted">
        {description ??
          "هذه الشاشة غير متاحة لدورك الحالي. إذا كنت بحاجة للوصول إليها تواصل مع مدير النظام لتعديل صلاحياتك."}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
