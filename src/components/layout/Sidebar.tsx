"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

import { Brand } from "./Brand";

export function SidebarContent({
  propertyName,
  sections,
  onNavigate,
}: {
  /** The property being operated, shown beside the mark. */
  propertyName: string;
  sections: NavSection[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-4">
        <Brand propertyName={propertyName} />
      </div>

      <nav
        aria-label="التنقل الرئيسي"
        className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4"
      >
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-content-subtle">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-brand-50 text-brand-800"
                          : "text-content-muted hover:bg-surface-inset hover:text-content",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 transition-colors",
                          active
                            ? "text-brand-600"
                            : "text-content-subtle group-hover:text-content-muted",
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{item.label}</span>
                      {active && (
                        <span
                          className="ms-auto h-4 w-1 rounded-full bg-brand-600"
                          aria-hidden
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line px-4 py-3">
        <p className="text-[11px] leading-relaxed text-content-subtle">
          نسخة تجريبية — المرحلة الأولى
        </p>
      </div>
    </div>
  );
}
