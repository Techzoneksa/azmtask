"use client";

import { Lock, LockOpen, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, useConfirm, useToast } from "@/components/ui";

import { unblockUnitAction } from "../actions";
import { BlockDialog } from "./BlockDialog";
import { UnitFormDialog, type UnitFormValues, type UnitTypeOption } from "./UnitFormDialog";

/**
 * The operational controls on a single unit.
 *
 * Only actions that are both permitted and currently valid are rendered. A room with
 * a guest in it shows no block button at all rather than one that fails on click:
 * an action that cannot succeed should not be offered, and the reason is stated
 * where the button would have been.
 */
export function UnitActions({
  unitId,
  unitNumber,
  status,
  isBlocked,
  canChangeStatus,
  canManage,
  unitTypes = [],
  unit,
}: {
  unitId: string;
  unitNumber: string;
  status: string;
  isBlocked: boolean;
  canChangeStatus: boolean;
  canManage: boolean;
  /** Needed only when editing is offered. */
  unitTypes?: UnitTypeOption[];
  unit?: UnitFormValues;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [blockOpen, setBlockOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [unblocking, setUnblocking] = useState(false);

  const occupied = status === "OCCUPIED";
  const canEdit = canManage && unit !== undefined && unitTypes.length > 0;

  async function unblock() {
    const confirmed = await confirm({
      title: `إعادة تفعيل الوحدة ${unitNumber}`,
      // Named consequences, not "هل أنت متأكد؟" — the person clicking should know
      // exactly what changes the moment they confirm.
      description: `ستعود الوحدة ${unitNumber} إلى الوحدات المتاحة ويمكن حجزها من جديد. سيُسجَّل إنهاء الإيقاف باسمك.`,
      confirmLabel: "إعادة التفعيل",
      tone: "warning",
    });
    if (!confirmed) return;

    setUnblocking(true);
    const result = await unblockUnitAction(unitId);
    setUnblocking(false);

    if (result.ok) {
      toast.success(`تمت إعادة تفعيل الوحدة ${unitNumber}`);
      router.refresh();
      return;
    }

    toast.error("تعذّرت إعادة التفعيل", result.error);
  }

  return (
    <>
      {canEdit && (
        <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditOpen(true)}>
          تعديل
        </Button>
      )}

      {canChangeStatus &&
        (isBlocked ? (
          <Button
            variant="secondary"
            size="sm"
            icon={LockOpen}
            loading={unblocking}
            onClick={unblock}
          >
            إعادة التفعيل
          </Button>
        ) : occupied ? (
          // Stated rather than offered-and-refused: blocking claims nobody will be in
          // the room, which is false while a guest is checked in.
          <span className="text-[12px] text-content-subtle">
            لا يمكن إيقاف وحدة بها نزيل
          </span>
        ) : (
          <Button variant="secondary" size="sm" icon={Lock} onClick={() => setBlockOpen(true)}>
            إيقاف الوحدة
          </Button>
        ))}

      <BlockDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        unitId={unitId}
        unitNumber={unitNumber}
      />

      {canEdit && (
        <UnitFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          unitTypes={unitTypes}
          unit={unit}
        />
      )}
    </>
  );
}
