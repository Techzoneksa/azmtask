"use client";

import { Search, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, Input, Modal, useToast } from "@/components/ui";
import { formatMobile } from "@/lib/format";

import { quickCreateGuestAction } from "../actions";
import { searchGuestsAction } from "../search-actions";

/**
 * Finding — or creating — the guest a booking is for.
 *
 * Search first, create second, and deliberately in that order: the whole point of the
 * Phase 6 identity layer is that a returning guest resolves to the record the hotel
 * already has. A booking form that offered "new guest" as the obvious path would mint
 * a fresh profile every time someone rang back, and the stay history would scatter.
 *
 * Creation here is the same service the guests module uses — the same normalization,
 * the same blocked document duplicate, the same warned shared mobile. A quick-create
 * with relaxed rules would make this screen the way around them.
 */

export type GuestOption = {
  id: string;
  fullName: string;
  mobile: string | null;
};

export function GuestPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (guest: GuestOption) => void;
}) {
  const toast = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<GuestOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newName, setNewName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFields, setCreateFields] = useState<Record<string, string>>({});

  const token = useRef(0);

  useEffect(() => {
    if (!open) return;
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }

    const current = ++token.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchGuestsAction(term);
      // Out-of-order responses must not overwrite a newer result.
      if (current !== token.current) return;
      setSearching(false);
      setResults(found);
    }, 300);

    return () => clearTimeout(timer);
  }, [term, open]);

  function reset() {
    setTerm("");
    setResults([]);
    setCreating(false);
    setNewName("");
    setNewMobile("");
    setCreateError(null);
    setCreateFields({});
  }

  async function create() {
    if (saving) return;
    setSaving(true);
    setCreateError(null);
    setCreateFields({});

    const result = await quickCreateGuestAction({
      fullName: newName,
      mobile: newMobile || null,
      // Acknowledged up front: a shared family phone is a warning in the guests
      // module, and stopping a booking for it would be worse than the duplicate.
      // An exact document duplicate is still blocked — no document is entered here.
      confirmDuplicate: true,
    });

    setSaving(false);

    if (result.ok) {
      toast.success(`تمت إضافة ${result.fullName}`);
      onPick({ id: result.guestId, fullName: result.fullName, mobile: newMobile || null });
      reset();
      return;
    }

    setCreateError(result.error);
    setCreateFields(result.fields ?? {});
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={creating ? "نزيل جديد" : "اختيار النزيل"}
      description={
        creating
          ? "الاسم وحده كافٍ. بقية البيانات تُستكمل من ملف النزيل لاحقًا."
          : "ابحث بالاسم أو رقم الجوال أو رقم الوثيقة."
      }
      size="lg"
    >
      {creating ? (
        <div className="space-y-4">
          {createError && (
            <div
              role="alert"
              className="rounded-lg border border-danger-fg/25 bg-danger-bg px-3.5 py-3"
            >
              <p className="text-[13px] leading-relaxed text-danger-fg">{createError}</p>
            </div>
          )}

          <Input
            label="الاسم الكامل"
            required
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="محمد بن عبدالله الشهري"
            error={createFields.fullName}
            data-autofocus
          />
          <Input
            label="رقم الجوال"
            type="tel"
            dir="ltr"
            value={newMobile}
            onChange={(event) => setNewMobile(event.target.value)}
            placeholder="05XXXXXXXX"
            error={createFields.mobile}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setCreating(false)} disabled={saving}>
              رجوع للبحث
            </Button>
            <Button icon={UserPlus} loading={saving} onClick={create}>
              إضافة واختيار
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-content-subtle"
              aria-hidden
            />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              aria-label="ابحث عن النزيل"
              placeholder="الاسم أو الجوال أو رقم الوثيقة"
              data-autofocus
              className="h-10 w-full rounded-lg border border-line bg-surface ps-9 pe-3 text-[13px] text-content placeholder:text-content-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            />
          </div>

          <div className="min-h-[10rem]">
            {term.trim().length < 2 ? (
              <p className="py-8 text-center text-[13px] text-content-subtle">
                اكتب حرفين على الأقل للبحث.
              </p>
            ) : searching ? (
              <p className="py-8 text-center text-[13px] text-content-subtle">جارٍ البحث…</p>
            ) : results.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[13px] text-content">لا يوجد نزيل مطابق</p>
                <p className="mt-1 text-[12px] text-content-muted">
                  تأكد من الرقم، أو أضِف نزيلًا جديدًا.
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {results.map((guest) => (
                  <li key={guest.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(guest);
                        reset();
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-start transition-colors hover:border-brand-300 hover:bg-brand-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-content">
                          {guest.fullName}
                        </span>
                        <span
                          className="block truncate text-[12px] tabular-nums text-content-subtle"
                          dir="ltr"
                        >
                          {formatMobile(guest.mobile)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] text-brand-700">اختيار</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line pt-3">
            <Button
              variant="secondary"
              icon={UserPlus}
              onClick={() => {
                setNewName(term.trim());
                setCreating(true);
              }}
              className="w-full"
            >
              نزيل جديد
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
