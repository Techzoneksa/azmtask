import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Table primitives.
 *
 * The wrapper owns horizontal scrolling so a wide operational table never forces the
 * page itself to scroll sideways — important on the tablets reception uses.
 */

export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("scrollbar-thin w-full overflow-x-auto", className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn("w-full min-w-[640px] border-collapse text-sm", className)}
      {...props}
    />
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("bg-surface-muted text-[12px] uppercase text-content-muted", className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TR({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        interactive && "cursor-pointer transition-colors hover:bg-surface-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  align = "start",
  ...props
}: Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & {
  align?: "start" | "end" | "center";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-line px-4 py-3 font-semibold tracking-wide",
        align === "start" && "text-start",
        align === "end" && "text-end",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  align = "start",
  ...props
}: Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
  align?: "start" | "end" | "center";
}) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 text-content",
        align === "start" && "text-start",
        align === "end" && "text-end",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

/** Full-width row used to host an empty or error state inside a table body. */
export function TableMessageRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        {children}
      </td>
    </tr>
  );
}
