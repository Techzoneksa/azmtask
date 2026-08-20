"use client";

import { Loader2, type LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50",
  secondary:
    "bg-surface text-content border border-line-strong shadow-sm hover:bg-surface-subtle active:bg-surface-inset",
  outline:
    "bg-transparent text-brand-700 border border-brand-300 hover:bg-brand-50 active:bg-brand-100",
  ghost: "bg-transparent text-content-muted hover:bg-surface-inset hover:text-content",
  danger:
    "bg-danger-fg text-white shadow-sm hover:brightness-110 active:brightness-95 disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "h-9 w-9 p-0",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  /** Renders the icon after the label instead of before it. */
  iconEnd?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading = false,
    icon: Icon,
    iconEnd = false,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        Icon && !iconEnd && <Icon className="h-4 w-4 shrink-0" aria-hidden />
      )}
      {children}
      {!loading && Icon && iconEnd && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
    </button>
  );
});
