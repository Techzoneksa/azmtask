"use client";

import { Check, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  Badge,
  Button,
  Input,
  Modal,
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
  useConfirm,
  useToast,
} from "@/components/ui";
import { formatAmount } from "@/lib/format";

import { createUnitTypeAction, updateUnitTypeAction } from "../actions";

/**
 * Unit types — the catalogue every room, rate and reservation reads through.
 *
 * A type in use is never deleted, only deactivated, and only once no rooms point at
 * it: rates and past reservations reference it, and removing it would rewrite history
 * that already happened. The table says how many rooms and reservations depend on
 * each type so that constraint is visible before it is hit.
 */

export type UnitTypeRowView = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  baseRate: string;
  status: string;
  unitCount: number;
  reservationCount: number;
  canDeactivate: boolean;
};

type Draft = {
  unitTypeId?: string;
  name: string;
  description: string;
  capacity: string;
  baseRate: string;
};

const BLANK: Draft = { name: "", description: "", capacity: "2", baseRate: "" };

export function UnitTypesManager({ types }: { types: UnitTypeRowView[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const editing = draft?.unitTypeId !== undefined;

  function open(next: Draft) {
    setDraft(next);
    setError(null);
    setFieldErrors({});
  }

  function close() {
    if (submitting) return;
    setDraft(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || submitting) return;

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() === "" ? null : draft.description.trim(),
      capacity: draft.capacity,
      baseRate: draft.baseRate.trim(),
    };

    const result = draft.unitTypeId
      ? await updateUnitTypeAction({ ...payload, unitTypeId: draft.unitTypeId })
      : await createUnitTypeAction(payload);

    if (result.ok) {
      toast.success(draft.unitTypeId ? `تم حفظ ${payload.name}` : `تمت إضافة ${payload.name}`);
      setDraft(null);
      setSubmitting(false);
      router.refresh();
      return;
    }

    setSubmitting(false);
    setError(result.error);
    setFieldErrors(result.fields ?? {});
  }

  async function toggleStatus(type: UnitTypeRowView) {
    const activating = type.status !== "ACTIVE";

    const confirmed = await confirm({
      title: activating ? `تفعيل ${type.name}` : `تعطيل ${type.name}`,
      description: activating
        ? `سيعود ${type.name} متاحًا عند إضافة الوحدات والحجوزات الجديدة.`
        : `لن يظهر ${type.name} عند إضافة وحدة أو حجز جديد. الوحدات والحجوزات القائمة عليه تبقى كما هي.`,
      confirmLabel: activating ? "تفعيل" : "تعطيل",
      tone: activating ? "info" : "warning",
    });
    if (!confirmed) return;

    setBusyId(type.id);
    const result = await updateUnitTypeAction({
      unitTypeId: type.id,
      status: activating ? "ACTIVE" : "INACTIVE",
    });
    setBusyId(null);

    if (result.ok) {
      toast.success(activating ? `تم تفعيل ${type.name}` : `تم تعطيل ${type.name}`);
      router.refresh();
      return;
    }

    toast.error("تعذّر تغيير حالة النوع", result.error);
  }

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" icon={Plus} onClick={() => open({ ...BLANK })}>
          إضافة نوع
        </Button>
      </div>

      {types.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-content">لم تُضَف أنواع وحدات بعد</p>
          <p className="mt-1.5 text-[13px] text-content-muted">
            النوع يحدد السعة والسعر الأساسي، وكل وحدة تنتمي إلى نوع.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4">
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>النوع</TH>
                  <TH>السعة</TH>
                  <TH>السعر الأساسي</TH>
                  <TH>الوحدات</TH>
                  <TH>الحجوزات</TH>
                  <TH>الحالة</TH>
                  <TH>إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {types.map((type) => (
                  <TR key={type.id}>
                    <TD>
                      <span className="font-medium text-content">{type.name}</span>
                      {type.description && (
                        <span className="mt-0.5 block text-[12px] text-content-muted">
                          {type.description}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <span className="tabular-nums">{type.capacity}</span>
                    </TD>
                    <TD>
                      <span className="tabular-nums">{formatAmount(type.baseRate)}</span>
                    </TD>
                    <TD>
                      <span className="tabular-nums">{type.unitCount}</span>
                    </TD>
                    <TD>
                      <span className="tabular-nums">{type.reservationCount}</span>
                    </TD>
                    <TD>
                      <Badge tone={type.status === "ACTIVE" ? "ok" : "neutral"}>
                        {type.status === "ACTIVE" ? "مفعّل" : "معطّل"}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Pencil}
                          onClick={() =>
                            open({
                              unitTypeId: type.id,
                              name: type.name,
                              description: type.description ?? "",
                              capacity: String(type.capacity),
                              baseRate: type.baseRate,
                            })
                          }
                        >
                          تعديل
                        </Button>
                        {type.status === "ACTIVE" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busyId === type.id}
                            disabled={!type.canDeactivate}
                            title={
                              type.canDeactivate
                                ? undefined
                                : `لا يمكن تعطيل النوع وبه ${type.unitCount} وحدة`
                            }
                            onClick={() => toggleStatus(type)}
                          >
                            تعطيل
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busyId === type.id}
                            onClick={() => toggleStatus(type)}
                          >
                            تفعيل
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>

          {/* Stated once under the table rather than repeated in every disabled row. */}
          {types.some((type) => type.status === "ACTIVE" && !type.canDeactivate) && (
            <p className="mt-3 border-t border-line pt-3 text-[12px] text-content-muted">
              النوع الذي تنتمي إليه وحدات قائمة لا يمكن تعطيله — انقل وحداته إلى نوع آخر أولًا.
            </p>
          )}
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={close}
        title={editing ? `تعديل ${draft?.name}` : "إضافة نوع وحدة"}
        description="النوع يحدد السعة والسعر الأساسي لكل وحدة تنتمي إليه."
        closeOnOverlay={false}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" form="unit-type-form" icon={Check} loading={submitting}>
              {editing ? "حفظ التعديلات" : "إضافة النوع"}
            </Button>
          </>
        }
      >
        {draft && (
          <form id="unit-type-form" onSubmit={submit} className="space-y-4" noValidate>
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3"
              >
                <p className="text-[13px] leading-relaxed text-danger-fg">{error}</p>
              </div>
            )}

            <Input
              label="اسم النوع"
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="غرفة مزدوجة"
              error={fieldErrors.name}
              data-autofocus
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="السعة"
                type="number"
                min={1}
                max={20}
                required
                value={draft.capacity}
                onChange={(event) => setDraft({ ...draft, capacity: event.target.value })}
                hint="عدد النزلاء"
                error={fieldErrors.capacity}
              />
              <Input
                label="السعر الأساسي"
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                required
                value={draft.baseRate}
                onChange={(event) => setDraft({ ...draft, baseRate: event.target.value })}
                hint="ريال لليلة الواحدة"
                error={fieldErrors.baseRate}
              />
            </div>

            <Textarea
              label="الوصف"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="ما الذي يميّز هذا النوع؟"
              error={fieldErrors.description}
            />
          </form>
        )}
      </Modal>
    </>
  );
}
