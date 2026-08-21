import "server-only";

import { HousekeepingStatus, ReservationStatus } from "@/generated/prisma/enums";
import { toISODate } from "@/lib/datetime";
import type { Permission } from "@/lib/permissions";

/**
 * The rules of an arrival, with nothing else attached.
 *
 * Pure functions over plain facts: no database, no session, no transaction. They live
 * apart from the service so that everything which needs to answer "can this booking be
 * checked in?" — the arrival screen, the reservation detail page deciding whether to
 * offer the button, the transaction that performs it — reaches the same answer from
 * the same code. A page that decided for itself would eventually offer an action the
 * service refuses, which is worse than not offering it at all.
 *
 * It also breaks what would otherwise be a cycle: the check-in service needs the
 * booking engine's locks, and the booking engine's detail view needs these rules.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Housekeeping states a room may be handed over in.
 *
 * CLEAN is a room that has been serviced. INSPECTED is a clean room a supervisor has
 * signed off — strictly stronger, so it is equally acceptable. DIRTY and CLEANING are
 * both refusals: one has not been touched, the other is mid-service with a trolley in
 * the doorway, and neither is a room a guest can be walked into.
 */
export const READY_HOUSEKEEPING_STATUSES: HousekeepingStatus[] = [
  HousekeepingStatus.CLEAN,
  HousekeepingStatus.INSPECTED,
];

/** The permission that gates every write in this module. */
export const CHECK_IN_PERMISSION: Permission = "reservations.checkin";

export function isReady(housekeepingStatus: string): boolean {
  return (READY_HOUSEKEEPING_STATUSES as string[]).includes(housekeepingStatus);
}

/**
 * What a guest record must contain before a key is handed over.
 *
 * Stage 6 deliberately let reception create a guest from a name alone — somebody on
 * the phone gives a name and a number, and a booking system that refuses to write
 * that down is useless. Check-in is the other end of that trade: the person is at the
 * desk with their documents, and this is the point where the record becomes an
 * operational one.
 *
 * These are the fields this system needs to run a front desk. They are not a claim of
 * compliance with any registration authority — no such integration exists yet, and
 * saying otherwise in a field label would be a lie the operator only discovers during
 * an inspection.
 */
export const GUEST_REQUIREMENTS = [
  { field: "fullName", label: "الاسم الكامل" },
  { field: "identificationType", label: "نوع الوثيقة" },
  { field: "identificationNumber", label: "رقم الوثيقة" },
  { field: "nationality", label: "الجنسية" },
  { field: "mobile", label: "رقم الجوال" },
] as const;

export type GuestRequirement = (typeof GUEST_REQUIREMENTS)[number];

type GuestFacts = {
  fullName: string | null;
  identificationType: string | null;
  identificationNumber: string | null;
  nationality: string | null;
  mobile: string | null;
};

/** The required fields this guest is still missing, in the order the form shows them. */
export function missingGuestFields(guest: GuestFacts): GuestRequirement[] {
  return GUEST_REQUIREMENTS.filter((requirement) => {
    const value = guest[requirement.field as keyof GuestFacts];
    return value === null || value === undefined || String(value).trim() === "";
  });
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type CheckInEligibility = {
  eligible: boolean;
  blockedReason: string | null;
  /** The stay started on an earlier business date and the guest is only arriving now. */
  lateArrival: boolean;
  /** Already in house — a replay, not a failure. */
  alreadyCheckedIn: boolean;
};

type EligibilityFacts = {
  status: ReservationStatus;
  checkInDate: Date;
  checkOutDate: Date;
  businessDay: Date;
};

/**
 * Whether this booking may be checked in today, and why not when it may not.
 *
 * Pure, so the page deciding whether to offer the action and the transaction deciding
 * whether to perform it cannot disagree. Two implementations of "can this be checked
 * in" is two chances to show a button that fails.
 *
 * The date window is half-open, exactly like the stay itself: a booking of 20→23 may
 * be checked in on the 20th, 21st or 22nd, but not on the 23rd — that is the morning
 * the room is sold to somebody else. Arriving after the first night is an ordinary
 * hotel event, not an error; arriving before it is a booking that has not started.
 */
export function evaluateCheckInEligibility(facts: EligibilityFacts): CheckInEligibility {
  const base = { lateArrival: false, alreadyCheckedIn: false };

  if (facts.status === ReservationStatus.CHECKED_IN) {
    return {
      ...base,
      alreadyCheckedIn: true,
      eligible: false,
      blockedReason: "تم تسجيل وصول هذا الحجز مسبقًا.",
    };
  }

  if (facts.status === ReservationStatus.PENDING) {
    return {
      ...base,
      eligible: false,
      blockedReason: "الحجز غير مؤكد. أكّد الحجز أولًا ثم سجّل الوصول.",
    };
  }

  if (facts.status === ReservationStatus.CANCELLED) {
    return { ...base, eligible: false, blockedReason: "الحجز ملغي ولا يقبل تسجيل الوصول." };
  }

  if (facts.status === ReservationStatus.NO_SHOW) {
    return {
      ...base,
      eligible: false,
      blockedReason: "سُجّل هذا الحجز كعدم حضور. أنشئ حجزًا جديدًا إذا حضر النزيل.",
    };
  }

  if (facts.status === ReservationStatus.CHECKED_OUT) {
    return { ...base, eligible: false, blockedReason: "انتهت إقامة هذا الحجز بالمغادرة." };
  }

  const today = facts.businessDay.getTime();
  const arrival = facts.checkInDate.getTime();
  const departure = facts.checkOutDate.getTime();

  if (today < arrival) {
    return {
      ...base,
      eligible: false,
      blockedReason: "لا يمكن تسجيل الوصول قبل تاريخ بداية الحجز.",
    };
  }

  if (today >= departure) {
    return {
      ...base,
      eligible: false,
      blockedReason: `انتهت فترة هذا الحجز في ${toISODate(facts.checkOutDate)} ولا يمكن تسجيل الوصول عليه.`,
    };
  }

  return { ...base, eligible: true, blockedReason: null, lateArrival: today > arrival };
}

/**
 * The night the guest is actually starting from.
 *
 * A late arrival does not rewrite the booking — the nights already sold stay sold,
 * and the arrival date is a commercial fact somebody agreed to. But the room only has
 * to be free for the nights still ahead: a guest arriving on the 21st against a 20→23
 * booking can perfectly well be put in a room somebody else left on the morning of the
 * 21st. Validating against the original arrival date would refuse that room for a
 * night nobody is going to sleep in.
 */
export function remainingStayStart(checkInDate: Date, businessDay: Date): Date {
  return businessDay.getTime() > checkInDate.getTime() ? businessDay : checkInDate;
}

// ---------------------------------------------------------------------------
// No-show
// ---------------------------------------------------------------------------

export type NoShowEligibility = { eligible: boolean; blockedReason: string | null };

type NoShowFacts = {
  status: ReservationStatus;
  checkInDate: Date;
  businessDay: Date;
  issuedInvoices: number;
};

/**
 * Whether a booking may be recorded as a no-show.
 *
 * Only after the arrival day has passed. Marking a same-day arrival as a no-show at
 * four in the afternoon is a guess — the guest may be in traffic — and the rule that
 * decides when the day is over is a night-audit cut-off this system does not have
 * yet. Inventing one here would quietly cancel bookings on a threshold nobody agreed.
 *
 * An issued invoice blocks it, on the same principle as cancellation: a document has
 * left the building describing a stay, and re-labelling the booking underneath it
 * would make the document describe nothing. Payments do not block — see
 * `markNoShow` for why, and for what happens to them.
 */
export function evaluateNoShowEligibility(facts: NoShowFacts): NoShowEligibility {
  if (facts.status === ReservationStatus.NO_SHOW) {
    return { eligible: false, blockedReason: "سُجّل هذا الحجز كعدم حضور مسبقًا." };
  }
  if (facts.status !== ReservationStatus.CONFIRMED) {
    return { eligible: false, blockedReason: "تسجيل عدم الحضور متاح للحجوزات المؤكدة فقط." };
  }
  if (facts.businessDay.getTime() <= facts.checkInDate.getTime()) {
    return {
      eligible: false,
      blockedReason: "لا يمكن تسجيل عدم الحضور في يوم الوصول نفسه. انتظر انتهاء يوم التشغيل.",
    };
  }
  if (facts.issuedInvoices > 0) {
    return {
      eligible: false,
      blockedReason: "صدرت فاتورة لهذا الحجز. عالج الفاتورة قبل تسجيل عدم الحضور.",
    };
  }
  return { eligible: true, blockedReason: null };
}
