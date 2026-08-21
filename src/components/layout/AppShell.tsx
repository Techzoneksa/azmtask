"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ConfirmProvider, ToastProvider } from "@/components/ui";

import { SchemaBanner } from "./SchemaBanner";
import { visibleSections } from "@/lib/nav";
import type { Permission } from "@/lib/permissions";

import { SidebarContent } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * Application shell.
 *
 * Owns the responsive sidebar and mounts the toast and confirm providers so every
 * screen below has access to them without wiring anything itself.
 *
 * Takes the permission list rather than a ready-made nav tree: nav items carry icon
 * components, and a server component cannot serialize functions across the client
 * boundary. Permissions are plain strings, so the tree is built here instead.
 */

export function AppShell({
  propertyName,
  permissions,
  user,
  canOpenSettings,
  pendingMigrations,
  children,
}: {
  permissions: Permission[];
  user: { name: string; email: string; role: string; jobTitle: string };
  propertyName: string;
  canOpenSettings: boolean;
  /** Migrations the database has not run. Empty on a healthy deployment. */
  pendingMigrations: string[];
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const sections = useMemo(() => visibleSections(permissions), [permissions]);

  // Navigating from the mobile drawer should close it.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen">
          {/* Persistent sidebar from lg upward */}
          <aside className="fixed inset-y-0 start-0 hidden w-64 border-e border-line lg:block">
            <SidebarContent propertyName={propertyName} sections={sections} />
          </aside>

          {/* Mobile drawer */}
          {mobileOpen && (
            <div className="lg:hidden">
              <div
                className="fixed inset-0 z-40 animate-fade-in bg-brand-950/40"
                onClick={() => setMobileOpen(false)}
                aria-hidden
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-label="القائمة الرئيسية"
                className="fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] animate-slide-in border-e border-line shadow-overlay"
              >
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="إغلاق القائمة"
                  className="absolute end-3 top-4 z-10 rounded-md p-1.5 text-content-subtle transition-colors hover:bg-surface-inset hover:text-content"
                >
                  <X className="h-4.5 w-4.5" aria-hidden />
                </button>
                <SidebarContent propertyName={propertyName}
                  sections={sections}
                  onNavigate={() => setMobileOpen(false)}
                />
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col lg:ms-64">
            <Topbar propertyName={propertyName}
              onOpenSidebar={() => setMobileOpen(true)}
              user={user}
              canOpenSettings={canOpenSettings}
            />
            {/* Nothing at all on a healthy deployment; a plain explanation when the
                database is behind the code. */}
            <SchemaBanner pending={pendingMigrations} />
            <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
              <div className="mx-auto w-full max-w-[1600px] space-y-5">{children}</div>
            </main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
