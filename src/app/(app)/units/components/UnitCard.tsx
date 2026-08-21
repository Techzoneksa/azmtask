import Link from "next/link";
import { CalendarClock, Lock, User, Wrench } from "lucide-react";

import { UNIT_STATUS, HOUSEKEEPING_STATUS } from "@/lib/status";
import { formatDateShort } from "@/lib/format";
import type { UnitRow } from "@/server/services/unit.service";

/**
 * One room on the board.
 *
 * Sized so a supervisor can sweep forty of them at a glance, which rules out putting
 * everything on the card — only what changes what someone does next: who is in it,
 * when they leave, and why it is unavailable if it is.
 *
 * State is never carried by colour alone. Every card shows its status in words; the
 * tint and the left edge reinforce that reading for people who scan rather than
 * read, and carry no meaning of their own.
 */

const TONE: Record<string, { surface: string; edge: string; text: string }> = {
  available: { surface: "bg-ok-bg/40 hover:bg-ok-bg/70", edge: "bg-ok-fg", text: "text-ok-fg" },
  occupied: { surface: "bg-brand-50 hover:bg-brand-100", edge: "bg-brand-600", text: "text-brand-700" },
  reserved: { surface: "bg-info-bg/50 hover:bg-info-bg", edge: "bg-info-fg", text: "text-info-fg" },
  cleaning: { surface: "bg-warn-bg/40 hover:bg-warn-bg/70", edge: "bg-warn-fg", text: "text-warn-fg" },
  maintenance: { surface: "bg-danger-bg/40 hover:bg-danger-bg/70", edge: "bg-danger-fg", text: "text-danger-fg" },
  blocked: { surface: "bg-surface-inset hover:bg-line", edge: "bg-content-subtle", text: "text-content-muted" },
};

export function UnitCard({ unit }: { unit: UnitRow }) {
  const key = unit.status.toLowerCase();
  const meta = UNIT_STATUS[key as keyof typeof UNIT_STATUS];
  const tone = TONE[key] ?? TONE.blocked;
  const housekeeping =
    HOUSEKEEPING_STATUS[unit.housekeepingStatus.toLowerCase() as keyof typeof HOUSEKEEPING_STATUS];

  return (
    <Link
      href={`/units/${unit.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-line ps-2.5 transition-colors ${tone.surface}`}
      aria-label={`الوحدة ${unit.unitNumber} — ${meta?.label ?? unit.status}`}
    >
      <span className={`absolute inset-y-0 start-0 w-1 ${tone.edge}`} aria-hidden />

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[17px] font-semibold tabular-nums text-content">
            {unit.unitNumber}
          </span>
          <span className="text-[11px] text-content-subtle">
            {unit.floor === null ? "—" : `ط${unit.floor}`}
          </span>
        </div>

        <span className="truncate text-[11px] text-content-muted">{unit.unitTypeName}</span>

        {/* The status in words, never colour alone. */}
        <span className={`text-[12px] font-medium ${tone.text}`}>{meta?.label ?? unit.status}</span>

        <div className="mt-auto space-y-1 pt-1.5">
          {unit.currentGuest && (
            <span className="flex items-center gap-1 text-[11px] text-content-muted">
              <User className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{unit.currentGuest}</span>
            </span>
          )}
          {unit.checkOutDate && (
            <span className="flex items-center gap-1 text-[11px] text-content-subtle">
              <CalendarClock className="size-3 shrink-0" aria-hidden />
              مغادرة {formatDateShort(unit.checkOutDate)}
            </span>
          )}
          {unit.blockReason && (
            <span className="flex items-center gap-1 text-[11px] text-content-muted">
              <Lock className="size-3 shrink-0" aria-hidden />
              <span className="truncate">موقوفة</span>
            </span>
          )}
          {unit.openMaintenance && (
            <span className="flex items-center gap-1 text-[11px] text-danger-fg">
              <Wrench className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{unit.openMaintenance}</span>
            </span>
          )}
          {/* Housekeeping only when it is something other than clean — a "clean"
              badge on every idle room is noise that hides the three that are not. */}
          {unit.housekeepingStatus !== "CLEAN" && !unit.currentGuest && (
            <span className="text-[11px] text-content-subtle">{housekeeping?.label}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
