"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui";

import { UnitFormDialog, type UnitTypeOption } from "./UnitFormDialog";

/**
 * Opens the create-unit form.
 *
 * A unit cannot exist without a type, so with no types defined this points at the
 * types screen instead of opening a form whose only required field has nothing to
 * choose from.
 */
export function AddUnitButton({ unitTypes }: { unitTypes: UnitTypeOption[] }) {
  const [open, setOpen] = useState(false);

  if (unitTypes.length === 0) {
    return (
      <Link
        href="/units/types"
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
      >
        <Plus className="size-4" aria-hidden />
        أضف نوع وحدة أولًا
      </Link>
    );
  }

  return (
    <>
      <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
        إضافة وحدة
      </Button>
      <UnitFormDialog open={open} onClose={() => setOpen(false)} unitTypes={unitTypes} />
    </>
  );
}
