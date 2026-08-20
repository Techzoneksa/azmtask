"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const CONTROL_BASE =
  "w-full rounded-lg border bg-surface px-3 text-sm text-content transition-colors placeholder:text-content-subtle " +
  "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-content-muted";

function controlClasses(invalid?: boolean) {
  return cn(
    CONTROL_BASE,
    invalid
      ? "border-danger-fg/50 focus:border-danger-fg"
      : "border-line-strong hover:border-content-subtle focus:border-brand-500",
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-[13px] font-medium text-content-muted"
        >
          {label}
          {required && (
            <span className="ms-1 text-danger-fg" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[12px] text-danger-fg">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-content-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  wrapperClassName?: string;
  /** Rendered inside the control on the leading edge — a search or currency glyph. */
  leading?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, wrapperClassName, leading, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const control = (
    <div className="relative">
      {leading && (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex w-9 items-center justify-center text-content-subtle">
          {leading}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(controlClasses(Boolean(error)), "h-10", leading && "ps-9", className)}
        {...props}
      />
    </div>
  );

  if (!label && !hint && !error) return control;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      {control}
    </Field>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, required, rows = 3, ...props },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  const control = (
    <textarea
      ref={ref}
      id={textareaId}
      rows={rows}
      required={required}
      aria-invalid={error ? true : undefined}
      className={cn(controlClasses(Boolean(error)), "py-2 leading-relaxed", className)}
      {...props}
    />
  );

  if (!label && !hint && !error) return control;

  return (
    <Field label={label} htmlFor={textareaId} hint={hint} error={error} required={required}>
      {control}
    </Field>
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, required, placeholder, children, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  const control = (
    <select
      ref={ref}
      id={selectId}
      required={required}
      aria-invalid={error ? true : undefined}
      className={cn(
        controlClasses(Boolean(error)),
        "h-10 appearance-none bg-[length:16px] bg-no-repeat pe-9",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23859599' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: "left 0.75rem center",
      }}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {children}
    </select>
  );

  if (!label && !hint && !error) return control;

  return (
    <Field label={label} htmlFor={selectId} hint={hint} error={error} required={required}>
      {control}
    </Field>
  );
});

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <div className="flex items-start gap-2.5">
      <input
        ref={ref}
        id={checkboxId}
        type="checkbox"
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong text-brand-600 accent-brand-600",
          className,
        )}
        {...props}
      />
      <label htmlFor={checkboxId} className="text-sm text-content">
        {label}
        {hint && <span className="block text-[12px] text-content-subtle">{hint}</span>}
      </label>
    </div>
  );
});
