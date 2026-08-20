"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { shortId } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Toast notifications.
 *
 * One provider is mounted at the app shell; anything below it calls `useToast()`.
 * Toasts announce results of actions — they never carry information the user has no
 * other way to reach.
 */

export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Errors default to staying until dismissed. */
  duration?: number;
};

type ToastRecord = ToastOptions & { id: string; variant: ToastVariant };

type ToastContextValue = {
  toast: (options: ToastOptions) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { bar: string; icon: string; Icon: typeof Info }> = {
  success: { bar: "bg-ok-fg", icon: "text-ok-fg", Icon: CheckCircle2 },
  error: { bar: "bg-danger-fg", icon: "text-danger-fg", Icon: XCircle },
  warning: { bar: "bg-warn-fg", icon: "text-warn-fg", Icon: AlertTriangle },
  info: { bar: "bg-info-fg", icon: "text-info-fg", Icon: Info },
};

const DEFAULT_DURATION = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = shortId("toast");
      const variant = options.variant ?? "info";
      // Errors persist: the user needs time to read what went wrong.
      const duration =
        options.duration ?? (variant === "error" ? 0 : DEFAULT_DURATION);

      setToasts((current) => [...current.slice(-3), { ...options, id, variant }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  // Clear pending timers if the provider unmounts mid-flight.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ title, description, variant: "success" }),
      error: (title, description) => toast({ title, description, variant: "error" }),
      warning: (title, description) => toast({ title, description, variant: "warning" }),
      info: (title, description) => toast({ title, description, variant: "info" }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="الإشعارات"
        className="pointer-events-none fixed bottom-4 start-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((entry) => (
          <ToastCard key={entry.id} toast={entry} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  const { bar, icon, Icon } = VARIANT_STYLES[toast.variant];

  return (
    <div
      role="status"
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      className="pointer-events-auto flex animate-slide-in overflow-hidden rounded-lg border border-line bg-surface shadow-raised"
    >
      <div className={cn("w-1 shrink-0", bar)} aria-hidden />
      <div className="flex flex-1 items-start gap-3 p-3.5">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", icon)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-content">{toast.title}</p>
          {toast.description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-content-muted">
              {toast.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="إغلاق الإشعار"
          className="-me-1 -mt-1 rounded-md p-1 text-content-subtle transition-colors hover:bg-surface-inset hover:text-content"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}
