"use client";

import { ChevronDown, LogOut, Settings, ShieldCheck, UserCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui";
import { useToast } from "@/components/ui";
import { initials } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function UserMenu({
  name,
  email,
  role,
  jobTitle,
  canOpenSettings,
}: {
  name: string;
  email: string;
  role: Role;
  jobTitle: string;
  canOpenSettings: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setSigningOut(false);
      toast.error("تعذّر تسجيل الخروج", "تحقق من الاتصال ثم أعد المحاولة.");
    }
  }

  return (
    <Dropdown
      align="end"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            "flex items-center gap-2.5 rounded-lg py-1.5 pe-2 ps-1.5 transition-colors",
            open ? "bg-surface-inset" : "hover:bg-surface-inset",
          )}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-800"
            aria-hidden
          >
            {initials(name)}
          </span>
          <span className="hidden min-w-0 text-start leading-tight sm:block">
            <span className="block truncate text-[13px] font-medium text-content">
              {name}
            </span>
            <span className="block truncate text-[11px] text-content-subtle">
              {ROLE_LABELS[role]}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-content-subtle" aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-medium text-content">{name}</p>
            <p className="truncate text-[12px] text-content-muted" dir="ltr">
              {email}
            </p>
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              {jobTitle || ROLE_LABELS[role]}
            </p>
          </div>

          <div className="pt-1">
            <DropdownItem icon={UserCircle2} href="/profile" onClick={close}>
              الملف الشخصي
            </DropdownItem>
            {canOpenSettings && (
              <DropdownItem icon={Settings} href="/settings" onClick={close}>
                إعدادات النظام
              </DropdownItem>
            )}
          </div>

          <DropdownSeparator />

          <DropdownItem
            icon={LogOut}
            tone="danger"
            disabled={signingOut}
            onClick={() => {
              close();
              void signOut();
            }}
          >
            {signingOut ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}
