"use client";

import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { findNavItem } from "@/lib/nav";

import { UserMenu } from "./UserMenu";

export function Topbar({
  propertyName,
  onOpenSidebar,
  user,
  canOpenSettings,
}: {
  onOpenSidebar: () => void;
  user: { name: string; email: string; role: string; jobTitle: string };
  propertyName: string;
  canOpenSettings: boolean;
}) {
  const pathname = usePathname();
  const current = findNavItem(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/80 lg:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="فتح القائمة"
        className="-ms-1 rounded-lg p-2 text-content-muted transition-colors hover:bg-surface-inset hover:text-content lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {/*
        The section name, not the page's heading — every page renders its own h1,
        and a second one here would give mobile readers two competing top headings.
      */}
      <p className="truncate text-[15px] font-semibold text-content lg:hidden">
        {current?.label ?? propertyName}
      </p>

      {/*
        Global search is wired to real records in a later stage; for now it is
        presented as a disabled affordance rather than a button that does nothing.
      */}
      <div className="hidden flex-1 lg:block">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-content-subtle"
            aria-hidden
          />
          <input
            type="search"
            disabled
            placeholder="البحث الشامل — يُفعّل مع بيانات النظام"
            aria-label="البحث الشامل"
            title="يُفعّل البحث الشامل بعد ربط قاعدة البيانات"
            className="h-9 w-full cursor-not-allowed rounded-lg border border-line bg-surface-muted ps-9 pe-3 text-[13px] text-content-muted placeholder:text-content-subtle"
          />
        </div>
      </div>

      <div className="ms-auto flex items-center gap-1.5 lg:ms-0">
        <UserMenu
          name={user.name}
          email={user.email}
          role={user.role}
          jobTitle={user.jobTitle}
          canOpenSettings={canOpenSettings}
        />
      </div>
    </header>
  );
}
