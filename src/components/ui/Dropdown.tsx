"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Lightweight dropdown menu.
 *
 * Closes on outside click, Escape, and route change; anchored to the trigger's
 * inline-start edge so it opens toward the page centre in RTL.
 */

export function Dropdown({
  trigger,
  children,
  align = "start",
  className,
  menuClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {trigger({ open, toggle: () => setOpen((current) => !current) })}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-[calc(100%+0.35rem)] z-50 min-w-[13rem] animate-scale-in overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-overlay",
            align === "start" ? "start-0" : "end-0",
            menuClassName,
          )}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  icon: Icon,
  href,
  onClick,
  tone = "default",
  disabled,
  children,
}: {
  icon?: LucideIcon;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  children: ReactNode;
}) {
  const classes = cn(
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-sm transition-colors",
    tone === "danger"
      ? "text-danger-fg hover:bg-danger-bg"
      : "text-content hover:bg-surface-inset",
    disabled && "pointer-events-none opacity-50",
  );

  const content = (
    <>
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />}
      <span className="truncate">{children}</span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} role="menuitem" className={classes} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} className={classes}>
      {content}
    </button>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-content-subtle">
      {children}
    </p>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-line" role="separator" />;
}
