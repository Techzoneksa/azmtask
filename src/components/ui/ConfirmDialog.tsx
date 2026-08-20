"use client";

import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "./Button";
import { Modal } from "./Modal";

/**
 * Confirmation dialogs.
 *
 * Exposed as an imperative promise — `await confirm({...})` — so a destructive
 * handler reads top to bottom instead of splitting across callbacks. Every
 * irreversible action in the system goes through here.
 */

export type ConfirmTone = "danger" | "warning" | "info";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const TONE_STYLES: Record<ConfirmTone, { wrap: string; icon: string; Icon: typeof Info }> = {
  danger: { wrap: "bg-danger-bg", icon: "text-danger-fg", Icon: ShieldAlert },
  warning: { wrap: "bg-warn-bg", icon: "text-warn-fg", Icon: AlertTriangle },
  info: { wrap: "bg-info-bg", icon: "text-info-fg", Icon: Info },
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const tone = options?.tone ?? "danger";
  const { wrap, icon, Icon } = TONE_STYLES[tone];

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ""}
        size="sm"
        closeOnOverlay={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)}>
              {options?.cancelLabel ?? "إلغاء"}
            </Button>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              onClick={() => settle(true)}
              data-autofocus
            >
              {options?.confirmLabel ?? "تأكيد"}
            </Button>
          </>
        }
      >
        <div className="flex gap-4">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${wrap}`}
          >
            <Icon className={`h-5 w-5 ${icon}`} aria-hidden />
          </div>
          <p className="pt-1.5 text-sm leading-relaxed text-content-muted">
            {options?.description ?? "هل أنت متأكد من تنفيذ هذا الإجراء؟"}
          </p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return context;
}
