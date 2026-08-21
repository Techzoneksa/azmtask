"use client";

import { CheckCircle2, Pencil, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Modal, Textarea, useConfirm, useToast } from "@/components/ui";

import { cancelReservationAction, confirmReservationAction } from "../actions";

/**
 * The operational controls on one booking.
 *
 * Users choose actions, never a status. "تأكيد الحجز" is a decision with consequences
 * — inventory is taken, the room comes off the board — and an enum dropdown would let
 * anyone set any value without any of them happening.
 *
 * A blocked action is not rendered as a disabled button with no explanation — the
 * reason is stated instead, because "you cannot cancel this" and "there is money on
 * this booking, settle it first" lead to completely different next steps. The reasons
 * render below the header rather than inside it: a sentence is not a button, and a
 * flex row sized for buttons cannot hold one without pushing the page sideways.
 */
export function ReservationActions({
  reservationId,
  reservationNumber,
  guards,
  canEdit,
  canConfirm,
  canCancel,
}: {
  reservationId: string;
  reservationNumber: string;
  guards: {
    canEdit: boolean;
    editBlockedReason: string | null;
    canConfirm: boolean;
    confirmBlockedReason: string | null;
    canCancel: boolean;
    cancelBlockedReason: string | null;
  };
  /** What the signed-in user is permitted to do, before the booking's own state. */
  canEdit: boolean;
  canConfirm: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [confirming, setConfirming] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function confirmBooking() {
    const agreed = await confirmDialog({
      title: `تأكيد الحجز ${reservationNumber}`,
      // Named consequences, not "هل أنت متأكد؟".
      description:
        "سيُحجز نوع الوحدة فعليًا وتخرج الوحدة من المتاح للبيع خلال هذه الفترة. يُعاد فحص التوفر الآن قبل التأكيد.",
      confirmLabel: "تأكيد الحجز",
      tone: "info",
    });
    if (!agreed) return;

    setConfirming(true);
    const result = await confirmReservationAction(reservationId);
    setConfirming(false);

    if (result.ok) {
      toast.success(`تم تأكيد الحجز ${reservationNumber}`);
      router.refresh();
      return;
    }
    // The common failure is real: somebody sold the room between the enquiry and now.
    toast.error("تعذّر تأكيد الحجز", result.error);
  }

  async function cancelBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cancelling) return;

    setCancelling(true);
    setCancelError(null);

    const result = await cancelReservationAction(reservationId, reason.trim() || null);
    setCancelling(false);

    if (result.ok) {
      toast.success(`تم إلغاء الحجز ${reservationNumber}`, "عادت الوحدة إلى المتاح للبيع.");
      setCancelOpen(false);
      setReason("");
      router.refresh();
      return;
    }
    setCancelError(result.error);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && guards.canEdit && (
          <Link
            href={`/reservations/${reservationId}/edit`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-[13px] font-medium text-content transition-colors hover:bg-surface-inset"
          >
            <Pencil className="size-4" aria-hidden />
            تعديل
          </Link>
        )}

        {canConfirm && guards.canConfirm && (
          <Button size="sm" icon={CheckCircle2} loading={confirming} onClick={confirmBooking}>
            تأكيد الحجز
          </Button>
        )}

        {canCancel && guards.canCancel && (
          <Button
            variant="secondary"
            size="sm"
            icon={XCircle}
            onClick={() => setCancelOpen(true)}
          >
            إلغاء الحجز
          </Button>
        )}
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => {
          if (!cancelling) {
            setCancelOpen(false);
            setCancelError(null);
          }
        }}
        title={`إلغاء الحجز ${reservationNumber}`}
        description="ستعود الوحدة إلى المتاح للبيع فورًا، ويُسجَّل الإلغاء باسمك."
        closeOnOverlay={false}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCancelOpen(false)}
              disabled={cancelling}
            >
              تراجع
            </Button>
            <Button
              type="submit"
              form="cancel-reservation-form"
              variant="danger"
              icon={XCircle}
              loading={cancelling}
            >
              تأكيد الإلغاء
            </Button>
          </>
        }
      >
        <form id="cancel-reservation-form" onSubmit={cancelBooking} className="space-y-4">
          {cancelError && (
            <div
              role="alert"
              className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3"
            >
              <p className="text-[13px] leading-relaxed text-danger-fg">{cancelError}</p>
            </div>
          )}

          <Textarea
            label="سبب الإلغاء"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="تغيّرت خطط النزيل · حجز مكرر · تعذّر السداد"
            hint="يُحفظ مع الحجز — سبب مكتوب يوفّر سؤالًا لاحقًا."
            data-autofocus
          />
        </form>
      </Modal>
    </>
  );
}
