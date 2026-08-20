"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Modal dialog.
 *
 * Built on a portal with focus containment, Escape-to-close and body scroll locking,
 * so every dialog in the system behaves the same way regardless of what it contains.
 */

type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  children,
  closeOnOverlay = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: Size;
  footer?: ReactNode;
  children: ReactNode;
  closeOnOverlay?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog so keyboard users start inside it.
    const focusTimer = setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        "[data-autofocus], input:not([type=hidden]), textarea, select, button",
      );
      (target ?? panelRef.current)?.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 animate-fade-in bg-brand-950/40 backdrop-blur-[2px]"
        onClick={closeOnOverlay ? onClose : undefined}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn(
          "relative my-auto w-full animate-scale-in rounded-card border border-line bg-surface shadow-overlay",
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-content">{title}</h2>
            {description && (
              <p className="mt-1 text-[13px] leading-relaxed text-content-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-me-1.5 -mt-1 shrink-0 rounded-md p-1.5 text-content-subtle transition-colors hover:bg-surface-inset hover:text-content"
          >
            <X className="h-4.5 w-4.5" aria-hidden />
          </button>
        </div>

        <div className="scrollbar-thin max-h-[calc(100vh-16rem)] overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-muted px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
