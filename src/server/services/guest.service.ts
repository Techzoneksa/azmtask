import "server-only";

import { z } from "zod";

import { toISODate } from "@/lib/datetime";
import { prisma } from "@/lib/db";
import {
  IDENTIFICATION_TYPE_VALUES,
  maskIdentificationNumber,
  normalizeEmail,
  normalizeIdentificationNumber,
  normalizeMobile,
  normalizeName,
} from "@/lib/guest-identity";
import { add, money, toAmountString, type Money } from "@/lib/money";
import type { Permission } from "@/lib/permissions";
import { AppError, withDbErrors } from "@/server/errors";
import { getBusinessDate } from "@/server/business-date";
import { EmailSchema, IdSchema, fieldErrors, toSkipTake } from "@/server/validation";

import { recordActivity, type ActivityActor } from "./activity.service";

/**
 * Guests.
 *
 * Three ideas govern this file.
 *
 * **A guest is an identity, not a booking.** The same person returning next year must
 * resolve to the same row, or the hotel loses its own history — stay counts, balances
 * and preferences all scatter across near-duplicate profiles. So matching happens on
 * normalized values, and creating a second profile for someone already in the system
 * requires an explicit decision rather than a fast Enter key.
 *
 * **Identity is global; operations are not.** A person exists once across the group,
 * but their stays, money and room numbers belong to the property they happened at.
 * Every operational query here is filtered by the properties the caller may see, so a
 * profile opened by one property's staff shows that property's history and nothing
 * else — built now, while there is one property, because retrofitting scoping after a
 * second one exists means auditing every query written in between.
 *
 * **Permission decides what is fetched, not what is hidden.** A caller without
 * `payments.view` gets an object with no payment fields in it. Selecting the money and
 * then hiding it in the template puts it in the HTML, in the RSC payload, and in
 * anything that inspects the response.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Reservation statuses that mean the guest is physically in a room right now. */
const IN_HOUSE = ["CHECKED_IN"] as const;

/** Statuses that represent a stay the guest holds but has not started. */
const UPCOMING = ["PENDING", "CONFIRMED"] as const;

/** Statuses that count as a stay that actually happened. */
const COMPLETED = ["CHECKED_OUT"] as const;

/** Statuses that count toward "how many times has this guest stayed with us". */
const STAYED = ["CHECKED_IN", "CHECKED_OUT"] as const;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * How a search term is interpreted.
 *
 * Reception searches three ways, in this order of frequency: a phone number read off
 * a screen, a document number read off a card, and a name heard out loud. Each gets
 * its own lane rather than one query that ORs a leading wildcard across every column
 * — that shape cannot use an index on any of them.
 */
type SearchLane =
  | { kind: "mobile"; mobile: string }
  | { kind: "digits"; digits: string }
  | { kind: "text"; text: string };

export function classifySearchTerm(raw: string): SearchLane | null {
  const term = raw.trim();
  if (term.length === 0) return null;

  const mobile = normalizeMobile(term);
  if (mobile) return { kind: "mobile", mobile };

  const digits = normalizeIdentificationNumber(term);
  if (/^\d{3,}$/.test(digits)) return { kind: "digits", digits };

  return { kind: "text", text: normalizeName(term) };
}

/** Translates a lane into the `where` fragment that serves it. */
function searchWhere(lane: SearchLane) {
  switch (lane.kind) {
    /*
     * A complete Saudi mobile is unambiguous, so it is matched exactly — an equality
     * on the indexed `mobile` column, which is the fastest lookup in this module and
     * the one the front desk uses most.
     */
    case "mobile":
      return { mobile: lane.mobile };

    /*
     * A partial number could be either document or phone. Both are prefix matches so
     * both indexes are usable; a leading wildcard here would turn the desk's most
     * common lookup into a table scan.
     */
    case "digits":
      return {
        OR: [
          { identificationNumber: { startsWith: lane.digits } },
          { mobile: { startsWith: lane.digits } },
        ],
      };

    /*
     * Names are the one deliberate scan. An Arabic full name is given + father +
     * grandfather + family, and reception routinely searches by the family name,
     * which is last — a prefix match would fail exactly when it is needed. Bounded by
     * pagination, and noted in the report as the query to revisit with a full-text
     * index when the directory grows past a few tens of thousands of rows.
     */
    case "text":
      return {
        OR: [
          { fullName: { contains: lane.text } },
          { email: { startsWith: normalizeEmail(lane.text) } },
        ],
      };
  }
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export const GuestFilterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  nationality: z.string().trim().max(80).optional(),
  identificationType: z.enum(IDENTIFICATION_TYPE_VALUES).optional(),
  /** `current` = in house tonight, `repeat` = has stayed more than once before. */
  status: z.enum(["current", "upcoming", "repeat"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type GuestFilters = z.infer<typeof GuestFilterSchema>;

export type GuestRow = {
  id: string;
  fullName: string;
  nationality: string | null;
  mobile: string | null;
  email: string | null;
  identificationType: string | null;
  /**
   * Masked here, in the service. The directory has no role that needs whole document
   * numbers, so none are sent — masking in the template would still put every number
   * in the payload for anyone who opened the response.
   */
  identificationMasked: string | null;
  stayCount: number;
  reservationCount: number;
  lastStayDate: string | null;
  inHouse: boolean;
  hasUpcoming: boolean;
};

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown, message: string): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", message, { fields: fieldErrors(result.error) });
  }
  return result.data;
}

/**
 * The guest directory.
 *
 * Deliberately three queries regardless of page size, not three per guest. The page
 * of identities is read first, then every operational column for the whole page is
 * aggregated in one grouped query and one in-house query, both restricted to the
 * properties the caller may see. Loading each guest's reservations to count them
 * would be the obvious shape and would issue 25 extra round trips per page.
 */
export async function listGuests(
  propertyIds: string[],
  rawFilters: unknown,
): Promise<{ rows: GuestRow[]; total: number; page: number; pageSize: number }> {
  const filters = parse(GuestFilterSchema, rawFilters, "معايير البحث غير صالحة.");
  const { skip, take } = toSkipTake(filters);

  return withDbErrors("guest.list", async () => {
    const today = await getBusinessDate();
    const lane = filters.q ? classifySearchTerm(filters.q) : null;

    const conditions: Array<Record<string, unknown>> = [];
    if (lane) conditions.push(searchWhere(lane));
    if (filters.nationality) conditions.push({ nationality: filters.nationality });
    if (filters.identificationType) {
      conditions.push({ identificationType: filters.identificationType });
    }

    /*
     * Operational filters are expressed as a relation condition on reservations, so
     * the database resolves them — pulling every guest back to test "is in house" in
     * JavaScript would work on the demo and fall over on a real directory.
     */
    if (filters.status === "current") {
      conditions.push({
        reservations: {
          some: { propertyId: { in: propertyIds }, status: { in: [...IN_HOUSE] } },
        },
      });
    } else if (filters.status === "upcoming") {
      conditions.push({
        reservations: {
          some: {
            propertyId: { in: propertyIds },
            status: { in: [...UPCOMING] },
            checkInDate: { gte: today },
          },
        },
      });
    } else if (filters.status === "repeat") {
      conditions.push({
        reservations: {
          some: { propertyId: { in: propertyIds }, status: { in: [...COMPLETED] } },
        },
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const [total, guests] = await Promise.all([
      prisma.guest.count({ where }),
      prisma.guest.findMany({
        where,
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
        skip,
        take,
        select: {
          id: true,
          fullName: true,
          nationality: true,
          mobile: true,
          email: true,
          identificationType: true,
          identificationNumber: true,
        },
      }),
    ]);

    if (guests.length === 0) {
      return { rows: [], total, page: filters.page, pageSize: filters.pageSize };
    }

    const ids = guests.map((guest) => guest.id);

    // One grouped query for the whole page, not one per row.
    const [counts, stayed, latest, live] = await Promise.all([
      prisma.reservation.groupBy({
        by: ["guestId"],
        where: { guestId: { in: ids }, propertyId: { in: propertyIds } },
        _count: { _all: true },
      }),
      prisma.reservation.groupBy({
        by: ["guestId"],
        where: {
          guestId: { in: ids },
          propertyId: { in: propertyIds },
          status: { in: [...STAYED] },
        },
        _count: { _all: true },
      }),
      prisma.reservation.groupBy({
        by: ["guestId"],
        where: {
          guestId: { in: ids },
          propertyId: { in: propertyIds },
          status: { in: [...STAYED] },
        },
        _max: { checkInDate: true },
      }),
      prisma.reservation.findMany({
        where: {
          guestId: { in: ids },
          propertyId: { in: propertyIds },
          OR: [
            { status: { in: [...IN_HOUSE] } },
            { status: { in: [...UPCOMING] }, checkInDate: { gte: today } },
          ],
        },
        select: { guestId: true, status: true },
      }),
    ]);

    const countBy = new Map(counts.map((row) => [row.guestId, row._count._all]));
    const stayedBy = new Map(stayed.map((row) => [row.guestId, row._count._all]));
    const latestBy = new Map(latest.map((row) => [row.guestId, row._max.checkInDate]));
    const inHouseBy = new Set(
      live.filter((row) => row.status === "CHECKED_IN").map((row) => row.guestId),
    );
    const upcomingBy = new Set(
      live.filter((row) => row.status !== "CHECKED_IN").map((row) => row.guestId),
    );

    const rows: GuestRow[] = guests.map((guest) => ({
      id: guest.id,
      fullName: guest.fullName,
      nationality: guest.nationality,
      mobile: guest.mobile,
      email: guest.email,
      identificationType: guest.identificationType,
      identificationMasked: maskIdentificationNumber(guest.identificationNumber),
      stayCount: stayedBy.get(guest.id) ?? 0,
      reservationCount: countBy.get(guest.id) ?? 0,
      lastStayDate: latestBy.get(guest.id) ? toISODate(latestBy.get(guest.id)!) : null,
      inHouse: inHouseBy.has(guest.id),
      hasUpcoming: upcomingBy.has(guest.id),
    }));

    return { rows, total, page: filters.page, pageSize: filters.pageSize };
  });
}

/** The distinct nationalities present, for the filter. */
export async function listGuestNationalities(): Promise<string[]> {
  return withDbErrors("guest.nationalities", async () => {
    const rows = await prisma.guest.findMany({
      where: { nationality: { not: null } },
      distinct: ["nationality"],
      orderBy: { nationality: "asc" },
      select: { nationality: true },
    });
    return rows.map((row) => row.nationality!).filter(Boolean);
  });
}

// ---------------------------------------------------------------------------
// Duplicate prevention
// ---------------------------------------------------------------------------

/**
 * How strongly a candidate matches, and therefore what the system may do about it.
 *
 * `document` is a hard conflict: two people cannot hold one passport, so the second
 * profile is refused outright and the database's unique constraint backs that up even
 * if this check is somehow bypassed.
 *
 * `mobile` and `email` are warnings, never blocks. Families share a phone; a couple
 * shares an inbox; a company books its staff from one switchboard number. Refusing
 * those would be a rule the business never asked for, enforced against people who are
 * genuinely different. So the match is shown, and a human decides.
 */
export type DuplicateSeverity = "document" | "mobile" | "email";

export type DuplicateCandidate = {
  guestId: string;
  fullName: string;
  mobile: string | null;
  identificationType: string | null;
  /** Masked. A duplicate warning must not become a way to read documents. */
  identificationMasked: string | null;
  severity: DuplicateSeverity;
  reason: string;
};

const SEVERITY_REASON: Record<DuplicateSeverity, string> = {
  document: "نفس نوع ورقم الوثيقة",
  mobile: "نفس رقم الجوال",
  email: "نفس البريد الإلكتروني",
};

/**
 * Finds profiles that might already be this person.
 *
 * Matching is on normalized values only — same document, same phone, same email. Name
 * similarity is deliberately excluded: in a directory where a large share of guests
 * are named محمد or عبدالله, fuzzy name matching produces a warning on nearly every
 * creation, and a warning that always fires is one reception learns to dismiss without
 * reading. That would cost more than the duplicates it caught.
 */
export async function findGuestCandidates(
  input: {
    mobile?: string | null;
    email?: string | null;
    identificationType?: string | null;
    identificationNumber?: string | null;
  },
  options: { excludeGuestId?: string } = {},
): Promise<DuplicateCandidate[]> {
  const mobile = input.mobile ? normalizeMobile(input.mobile) : null;
  const email = input.email ? normalizeEmail(input.email) : null;
  const documentNumber = input.identificationNumber
    ? normalizeIdentificationNumber(input.identificationNumber)
    : null;
  const documentType = input.identificationType ?? null;

  const matchers: Array<Record<string, unknown>> = [];
  if (documentType && documentNumber) {
    matchers.push({ identificationType: documentType, identificationNumber: documentNumber });
  }
  if (mobile) matchers.push({ mobile });
  if (email) matchers.push({ email });

  if (matchers.length === 0) return [];

  return withDbErrors("guest.candidates", async () => {
    const found = await prisma.guest.findMany({
      where: {
        OR: matchers,
        ...(options.excludeGuestId ? { NOT: { id: options.excludeGuestId } } : {}),
      },
      // Bounded: a shared switchboard number can legitimately have many guests behind
      // it, and a warning listing two hundred of them helps nobody.
      take: 8,
      select: {
        id: true,
        fullName: true,
        mobile: true,
        email: true,
        identificationType: true,
        identificationNumber: true,
      },
    });

    return found.map((guest) => {
      const severity: DuplicateSeverity =
        documentType &&
        documentNumber &&
        guest.identificationType === documentType &&
        guest.identificationNumber === documentNumber
          ? "document"
          : mobile && guest.mobile === mobile
            ? "mobile"
            : "email";

      return {
        guestId: guest.id,
        fullName: guest.fullName,
        mobile: guest.mobile,
        identificationType: guest.identificationType,
        identificationMasked: maskIdentificationNumber(guest.identificationNumber),
        severity,
        reason: SEVERITY_REASON[severity],
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Create and update
// ---------------------------------------------------------------------------

/**
 * The writable shape of a guest.
 *
 * Only the name is required. A guest profile is a record that this person exists;
 * the full legal set — document, nationality, date of birth — is what check-in
 * demands before handing over a key, and that rule belongs to check-in. Enforcing it
 * here would mean reception cannot write down a name and a phone number while the
 * guest is still on the line.
 */
const GuestFieldsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "الاسم مطلوب")
    .max(160, "الاسم أطول من الحد المسموح")
    .transform(normalizeName),
  mobile: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .superRefine((value, ctx) => {
      if (value && normalizeMobile(value) === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "رقم الجوال غير صحيح. الصيغة المتوقعة: 05XXXXXXXX",
        });
      }
    })
    .transform((value) => (value ? normalizeMobile(value) : null)),
  email: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .superRefine((value, ctx) => {
      if (value && !EmailSchema.safeParse(value).success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "صيغة البريد الإلكتروني غير صحيحة" });
      }
    })
    .transform((value) => (value ? normalizeEmail(value) : null)),
  nationality: z.string().trim().max(80).nullable().optional().transform((v) => v || null),
  identificationType: z.enum(IDENTIFICATION_TYPE_VALUES).nullable().optional(),
  identificationNumber: z
    .string()
    .trim()
    .max(40, "رقم الوثيقة أطول من الحد المسموح")
    .nullable()
    .optional()
    .transform((value) => (value ? normalizeIdentificationNumber(value) : null)),
  dateOfBirth: z
    .string()
    .trim()
    .nullable()
    .optional()
    .superRefine((value, ctx) => {
      if (!value) return;
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "تاريخ الميلاد غير صالح" });
        return;
      }
      if (date.getTime() > Date.now()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "تاريخ الميلاد في المستقبل" });
      }
    })
    .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : null)),
  gender: z.enum(["MALE", "FEMALE"]).nullable().optional(),
  preferences: z.string().trim().max(2000).nullable().optional().transform((v) => v || null),
  notes: z.string().trim().max(2000).nullable().optional().transform((v) => v || null),
});

/*
 * A document is a type and a number together. Half of one identifies nobody and would
 * sit outside the unique constraint, so the pair is required or absent, never split.
 */
const documentPairing = (
  value: { identificationType?: string | null; identificationNumber?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (value.identificationNumber && !value.identificationType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "اختر نوع الوثيقة",
      path: ["identificationType"],
    });
  }
  if (value.identificationType && !value.identificationNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "أدخل رقم الوثيقة",
      path: ["identificationNumber"],
    });
  }
};

export const CreateGuestSchema = GuestFieldsSchema.extend({
  /** Set once the user has seen the possible matches and chosen to continue anyway. */
  confirmDuplicate: z.coerce.boolean().optional().default(false),
}).superRefine(documentPairing);

export type CreateGuestInput = z.input<typeof CreateGuestSchema>;

export const UpdateGuestSchema = GuestFieldsSchema.extend({
  guestId: IdSchema,
  confirmDuplicate: z.coerce.boolean().optional().default(false),
}).superRefine(documentPairing);

export type UpdateGuestInput = z.input<typeof UpdateGuestSchema>;

/**
 * Raised when creation stopped to show possible matches. Carries them so the form can
 * render the profiles rather than a bare "possible duplicate" with nothing to act on.
 */
export class DuplicateGuestError extends AppError {
  readonly candidates: DuplicateCandidate[];
  readonly blocking: boolean;

  constructor(message: string, candidates: DuplicateCandidate[], blocking: boolean) {
    super(blocking ? "DUPLICATE" : "CONFLICT", message, {
      fields: { candidates: JSON.stringify(candidates) },
    });
    this.name = "DuplicateGuestError";
    this.candidates = candidates;
    this.blocking = blocking;
  }
}

/**
 * Window in which an identical create is treated as the same submission replayed.
 *
 * Guards the case the unique constraint cannot: a guest with no document, submitted
 * twice because the first response was slow. Two genuinely different people with the
 * same name and the same phone entered within ten seconds of each other is not a
 * scenario a hotel encounters; the same button pressed twice is.
 */
const REPLAY_WINDOW_MS = 10_000;

export async function createGuest(
  rawInput: CreateGuestInput,
  actor: ActivityActor,
): Promise<{ id: string; fullName: string }> {
  const input = parse(CreateGuestSchema, rawInput, "بيانات النزيل غير صالحة.");

  const candidates = await findGuestCandidates(input);
  const blocking = candidates.filter((candidate) => candidate.severity === "document");

  if (blocking.length > 0) {
    throw new DuplicateGuestError(
      "يوجد نزيل مسجّل مسبقًا بهذه الوثيقة. افتح ملفه بدلًا من إنشاء ملف جديد.",
      blocking,
      true,
    );
  }

  if (candidates.length > 0 && !input.confirmDuplicate) {
    throw new DuplicateGuestError(
      "قد يكون هذا النزيل مسجّلًا لدينا بالفعل. راجع الملفات المطابقة قبل المتابعة.",
      candidates,
      false,
    );
  }

  return withDbErrors("guest.create", () =>
    prisma.$transaction(async (tx) => {
      /*
       * Replay guard. Runs inside the transaction so two requests racing each other
       * cannot both find nothing and both insert.
       */
      if (input.mobile) {
        const recent = await tx.guest.findFirst({
          where: {
            fullName: input.fullName,
            mobile: input.mobile,
            createdAt: { gte: new Date(Date.now() - REPLAY_WINDOW_MS) },
          },
          select: { id: true, fullName: true },
        });
        if (recent) return recent;
      }

      const guest = await tx.guest.create({
        data: {
          fullName: input.fullName,
          mobile: input.mobile,
          email: input.email,
          nationality: input.nationality ?? null,
          identificationType: input.identificationType ?? null,
          identificationNumber: input.identificationNumber ?? null,
          dateOfBirth: input.dateOfBirth ?? null,
          gender: input.gender ?? null,
          preferences: input.preferences ?? null,
          notes: input.notes ?? null,
        },
        select: { id: true, fullName: true },
      });

      await recordActivity(
        {
          actor,
          module: "guests",
          action: "create",
          entityType: "Guest",
          entityId: guest.id,
          description: `إنشاء ملف النزيل ${guest.fullName}`,
          // Which fields were filled, never what was in them: an audit trail that
          // copies document numbers becomes a second place they can leak from.
          metadata: {
            hasMobile: input.mobile !== null,
            hasEmail: input.email !== null,
            identificationType: input.identificationType ?? null,
            hasIdentificationNumber: input.identificationNumber !== null,
            confirmedPossibleDuplicate: input.confirmDuplicate === true,
          },
        },
        tx,
      );

      return guest;
    }),
  );
}

/** Fields worth naming in the audit trail when they change. */
const TRACKED_FIELDS = [
  "fullName",
  "mobile",
  "email",
  "nationality",
  "identificationType",
  "identificationNumber",
  "dateOfBirth",
  "gender",
  "preferences",
  "notes",
] as const;

/**
 * Edits a guest in place.
 *
 * Always an update of the same row — never a create-and-repoint. The guest id is the
 * thread every reservation, payment, invoice and log entry hangs from; replacing the
 * row to change a phone number would sever all of it.
 */
export async function updateGuest(
  rawInput: UpdateGuestInput,
  actor: ActivityActor,
): Promise<{ id: string; fullName: string }> {
  const input = parse(UpdateGuestSchema, rawInput, "بيانات النزيل غير صالحة.");

  const existing = await prisma.guest.findUnique({
    where: { id: input.guestId },
    select: {
      id: true,
      fullName: true,
      mobile: true,
      email: true,
      nationality: true,
      identificationType: true,
      identificationNumber: true,
      dateOfBirth: true,
      gender: true,
      preferences: true,
      notes: true,
    },
  });

  if (!existing) throw new AppError("NOT_FOUND", "النزيل غير موجود.");

  // Only re-check when the document actually changed; otherwise the guest's own row
  // would be its own conflict.
  const documentChanged =
    input.identificationType !== existing.identificationType ||
    input.identificationNumber !== existing.identificationNumber;

  if (documentChanged || input.mobile !== existing.mobile || input.email !== existing.email) {
    const candidates = await findGuestCandidates(input, { excludeGuestId: input.guestId });
    const blocking = candidates.filter((candidate) => candidate.severity === "document");

    if (blocking.length > 0) {
      throw new DuplicateGuestError(
        "يوجد نزيل آخر مسجّل بهذه الوثيقة. لا يمكن نقل الوثيقة إلى هذا الملف.",
        blocking,
        true,
      );
    }
    if (candidates.length > 0 && !input.confirmDuplicate) {
      throw new DuplicateGuestError(
        "توجد ملفات أخرى تشترك في هذه البيانات. راجعها قبل الحفظ.",
        candidates,
        false,
      );
    }
  }

  return withDbErrors("guest.update", () =>
    prisma.$transaction(async (tx) => {
      const next = {
        fullName: input.fullName,
        mobile: input.mobile,
        email: input.email,
        nationality: input.nationality ?? null,
        identificationType: input.identificationType ?? null,
        identificationNumber: input.identificationNumber ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
        preferences: input.preferences ?? null,
        notes: input.notes ?? null,
      };

      const guest = await tx.guest.update({
        where: { id: input.guestId },
        data: next,
        select: { id: true, fullName: true },
      });

      /*
       * The names of the fields that changed — not their values. Knowing that someone
       * altered a guest's document is the audit question; storing the old and new
       * numbers to answer it would put every historical document in the log table.
       */
      const changed = TRACKED_FIELDS.filter((field) => {
        const before = existing[field];
        const after = next[field];
        if (before instanceof Date || after instanceof Date) {
          return (before as Date | null)?.getTime() !== (after as Date | null)?.getTime();
        }
        return before !== after;
      });

      await recordActivity(
        {
          actor,
          module: "guests",
          action: "update",
          entityType: "Guest",
          entityId: guest.id,
          description: `تعديل ملف النزيل ${guest.fullName}`,
          metadata: { changedFields: changed },
        },
        tx,
      );

      return guest;
    }),
  );
}

// ---------------------------------------------------------------------------
// Guest profile
// ---------------------------------------------------------------------------

export type GuestIdentity = {
  id: string;
  fullName: string;
  nationality: string | null;
  mobile: string | null;
  email: string | null;
  identificationType: string | null;
  /** Raw only when the caller may read documents; otherwise null. */
  identificationNumber: string | null;
  /** Always present when a document exists, whatever the caller may read. */
  identificationMasked: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  preferences: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GuestStayRow = {
  id: string;
  reservationNumber: string;
  propertyName: string;
  unitNumber: string | null;
  unitTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  status: string;
  source: string;
  adults: number;
  children: number;
  /** Money is present only for callers holding `payments.view`. */
  total?: string;
  balance?: string;
  paymentStatus?: string;
};

export type GuestPaymentRow = {
  id: string;
  paymentNumber: string;
  reservationNumber: string;
  paymentDate: string;
  method: string;
  amount: string;
  isRefund: boolean;
  reference: string | null;
};

export type GuestInvoiceRow = {
  id: string;
  invoiceNumber: string;
  reservationNumber: string;
  issueDate: string;
  total: string;
  paid: string;
  balance: string;
  status: string;
};

export type GuestFinancialSummary = {
  totalInvoiced: string;
  totalReceipts: string;
  totalRefunds: string;
  netPaid: string;
  outstanding: string;
  invoiceCount: number;
  paymentCount: number;
};

export type GuestActivityRow = {
  id: string;
  action: string;
  module: string;
  description: string;
  userName: string;
  createdAt: string;
};

export type GuestProfile = {
  guest: GuestIdentity;
  /** True when the caller may read raw document numbers. Drives the UI's label. */
  canReadDocuments: boolean;
  stayCount: number;
  reservationCount: number;
  firstStayDate: string | null;
  lastStayDate: string | null;
  /**
   * Every room this guest is in right now. Usually one — but a family taking two
   * rooms is one guest with two live stays, and a profile showing only the first
   * would send the desk to the wrong door.
   */
  currentStays: GuestStayRow[];
  upcoming: GuestStayRow[];
  history: { rows: GuestStayRow[]; total: number; page: number; pageSize: number };
  /** Null — not empty — when the caller has no financial permission. */
  financial: GuestFinancialSummary | null;
  payments: GuestPaymentRow[] | null;
  invoices: GuestInvoiceRow[] | null;
  activity: GuestActivityRow[] | null;
};

/**
 * Activity touching this guest, directly or through their stays.
 *
 * "Profile updated" is logged against the guest; "checked in" and "payment recorded"
 * are logged against a reservation, and both belong on the guest's timeline. The
 * reservation ids are resolved under the property scope first, so a stay at another
 * property contributes nothing here — otherwise the log would narrate history the
 * reader is not allowed to see.
 */
async function guestActivity(
  guestId: string,
  propertyIds: string[],
): Promise<GuestActivityRow[]> {
  const reservations = await prisma.reservation.findMany({
    where: { guestId, propertyId: { in: propertyIds } },
    select: { id: true },
    // Bounded: a long-standing guest may have hundreds of stays, and the timeline
    // shows the most recent twenty entries whatever their spread.
    take: 200,
    orderBy: { checkInDate: "desc" },
  });

  return prisma.activityLog
    .findMany({
      where: {
        OR: [
          { entityType: "Guest", entityId: guestId },
          ...(reservations.length > 0
            ? [{ entityType: "Reservation", entityId: { in: reservations.map((r) => r.id) } }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        module: true,
        description: true,
        userName: true,
        createdAt: true,
      },
    })
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        module: row.module,
        description: row.description,
        userName: row.userName,
        createdAt: row.createdAt.toISOString(),
      })),
    );
}

/*
 * The three groups a guest's reservations fall into, defined so that every
 * reservation lands in exactly one.
 *
 * "Now" is a guest physically in a room. "Upcoming" is a booking they hold that has
 * not finished yet. "History" is everything else — completed, cancelled, no-show, and
 * bookings whose dates simply passed without becoming a stay. Overlapping definitions
 * would put one booking in two lists, and the guest's stay count would then disagree
 * with the list it was counted from.
 */
const UPCOMING_WHERE = (today: Date) => ({
  status: { in: [...UPCOMING] },
  checkOutDate: { gt: today },
});

const HISTORY_WHERE = (today: Date) => ({
  NOT: [
    { status: { in: [...IN_HOUSE] } },
    { status: { in: [...UPCOMING] }, checkOutDate: { gt: today } },
  ],
});

/** How many stays one page of history holds. A repeat guest may have hundreds. */
const HISTORY_PAGE_SIZE = 10;

function nights(checkIn: Date, checkOut: Date): number {
  return Math.max(
    1,
    Math.round((checkOut.getTime() - checkIn.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

/**
 * Everything one guest profile needs, in a single permission- and property-aware read.
 *
 * The sections are independent, so they are issued together rather than in sequence:
 * the profile takes as long as its slowest query, not the sum of all of them. Sections
 * the caller may not see are never queried at all — `payments.view` decides whether a
 * payments query is sent, not whether its result is rendered.
 */
export async function getGuestDetails(
  guestId: string,
  propertyIds: string[],
  permissions: ReadonlySet<Permission>,
  options: { historyPage?: number } = {},
): Promise<GuestProfile> {
  const id = parse(IdSchema, guestId, "معرّف النزيل غير صالح.");
  const canSeeMoney = permissions.has("payments.view");
  const canSeeInvoices = permissions.has("invoices.view");
  const canSeeActivity = permissions.has("activity.view");
  /*
   * Reading a document number is tied to editing guests, because that is the desk
   * function it exists for: verifying a card against the profile. A role that may look
   * a guest up but never handles their papers — the accountant reconciling a folio —
   * gets the masked form. Same page, same guest, less of their identity.
   */
  const canReadDocuments = permissions.has("guests.edit");

  const historyPage = Math.max(1, options.historyPage ?? 1);

  return withDbErrors("guest.details", async () => {
    const today = await getBusinessDate();

    const guest = await prisma.guest.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        nationality: true,
        mobile: true,
        email: true,
        identificationType: true,
        identificationNumber: true,
        dateOfBirth: true,
        gender: true,
        preferences: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!guest) throw new AppError("NOT_FOUND", "النزيل غير موجود.");

    /* Every operational query below carries this. It is the only thing standing
       between one property's staff and another property's stay history. */
    const scope = { guestId: id, propertyId: { in: propertyIds } };

    const stayShape = {
      id: true,
      reservationNumber: true,
      checkInDate: true,
      checkOutDate: true,
      status: true,
      source: true,
      adults: true,
      children: true,
      property: { select: { name: true } },
      unit: { select: { unitNumber: true } },
      unitType: { select: { name: true } },
      ...(canSeeMoney ? { total: true, balance: true, paymentStatus: true } : {}),
    } as const;

    const [
      current,
      upcomingRows,
      historyRows,
      historyTotal,
      reservationCount,
      stayAggregate,
      paymentRows,
      invoiceRows,
      activityRows,
    ] = await Promise.all([
      prisma.reservation.findMany({
        where: { ...scope, status: { in: [...IN_HOUSE] } },
        orderBy: { checkInDate: "desc" },
        select: stayShape,
      }),
      /*
       * Deliberately unbounded. The three groups partition the guest's reservations
       * exactly — history is defined as the complement of these two — so a `take`
       * here would drop a booking out of both lists and make it invisible. A guest
       * with tens of forward bookings is a corporate account, not a pathology.
       */
      prisma.reservation.findMany({
        where: { ...scope, ...UPCOMING_WHERE(today) },
        orderBy: { checkInDate: "asc" },
        select: stayShape,
      }),
      prisma.reservation.findMany({
        where: { ...scope, ...HISTORY_WHERE(today) },
        orderBy: [{ checkInDate: "desc" }, { id: "desc" }],
        skip: (historyPage - 1) * HISTORY_PAGE_SIZE,
        take: HISTORY_PAGE_SIZE,
        select: stayShape,
      }),
      prisma.reservation.count({ where: { ...scope, ...HISTORY_WHERE(today) } }),
      prisma.reservation.count({ where: scope }),
      prisma.reservation.aggregate({
        where: { ...scope, status: { in: [...STAYED] } },
        _count: { _all: true },
        _min: { checkInDate: true },
        _max: { checkInDate: true },
      }),
      canSeeMoney
        ? prisma.payment.findMany({
            where: scope,
            orderBy: { paymentDate: "desc" },
            take: 25,
            select: {
              id: true,
              paymentNumber: true,
              paymentDate: true,
              method: true,
              amount: true,
              reference: true,
              reservation: { select: { reservationNumber: true } },
            },
          })
        : Promise.resolve(null),
      canSeeInvoices
        ? prisma.invoice.findMany({
            where: scope,
            orderBy: { issueDate: "desc" },
            take: 25,
            select: {
              id: true,
              invoiceNumber: true,
              issueDate: true,
              total: true,
              paid: true,
              balance: true,
              status: true,
              reservation: { select: { reservationNumber: true } },
            },
          })
        : Promise.resolve(null),
      canSeeActivity ? guestActivity(id, propertyIds) : Promise.resolve(null),
    ]);

    const toStay = (row: (typeof current)[number]): GuestStayRow => ({
      id: row.id,
      reservationNumber: row.reservationNumber,
      propertyName: row.property.name,
      unitNumber: row.unit?.unitNumber ?? null,
      unitTypeName: row.unitType.name,
      checkInDate: toISODate(row.checkInDate),
      checkOutDate: toISODate(row.checkOutDate),
      nights: nights(row.checkInDate, row.checkOutDate),
      status: row.status,
      source: row.source,
      adults: row.adults,
      children: row.children,
      ...(canSeeMoney && "total" in row
        ? {
            total: toAmountString(row.total as Money),
            balance: toAmountString(row.balance as Money),
            paymentStatus: row.paymentStatus as string,
          }
        : {}),
    });

    /*
     * Totals are summed with the decimal helpers, never with `+`. A folio reconciled
     * in floating point drifts by fractions of a halala per row and then disagrees
     * with the invoice it is supposed to explain.
     */
    let financial: GuestFinancialSummary | null = null;
    if (canSeeMoney || canSeeInvoices) {
      const [invoiceTotals, receipts, refunds] = await Promise.all([
        canSeeInvoices
          ? prisma.invoice.aggregate({
              where: { ...scope, status: { not: "CANCELLED" } },
              _sum: { total: true, balance: true },
              _count: { _all: true },
            })
          : Promise.resolve(null),
        canSeeMoney
          ? prisma.payment.aggregate({
              where: { ...scope, amount: { gt: 0 } },
              _sum: { amount: true },
              _count: { _all: true },
            })
          : Promise.resolve(null),
        canSeeMoney
          ? prisma.payment.aggregate({
              where: { ...scope, amount: { lt: 0 } },
              _sum: { amount: true },
              _count: { _all: true },
            })
          : Promise.resolve(null),
      ]);

      const totalReceipts = money(receipts?._sum.amount ?? 0);
      // Refunds are stored negative so SUM(amount) is the true paid figure. The
      // summary shows the magnitude under its own label rather than a minus sign
      // floating beside a total nobody can tell the direction of.
      const totalRefunds = money(refunds?._sum.amount ?? 0);

      financial = {
        totalInvoiced: toAmountString(invoiceTotals?._sum.total ?? 0),
        totalReceipts: toAmountString(totalReceipts),
        totalRefunds: toAmountString(totalRefunds.abs()),
        netPaid: toAmountString(add(totalReceipts, totalRefunds)),
        outstanding: toAmountString(invoiceTotals?._sum.balance ?? 0),
        invoiceCount: invoiceTotals?._count._all ?? 0,
        paymentCount: (receipts?._count._all ?? 0) + (refunds?._count._all ?? 0),
      };
    }

    return {
      guest: {
        id: guest.id,
        fullName: guest.fullName,
        nationality: guest.nationality,
        mobile: guest.mobile,
        email: guest.email,
        identificationType: guest.identificationType,
        identificationNumber: canReadDocuments ? guest.identificationNumber : null,
        identificationMasked: maskIdentificationNumber(guest.identificationNumber),
        dateOfBirth: guest.dateOfBirth ? toISODate(guest.dateOfBirth) : null,
        gender: guest.gender,
        preferences: guest.preferences,
        notes: guest.notes,
        createdAt: guest.createdAt.toISOString(),
        updatedAt: guest.updatedAt.toISOString(),
      },
      canReadDocuments,
      stayCount: stayAggregate._count._all,
      reservationCount,
      firstStayDate: stayAggregate._min.checkInDate
        ? toISODate(stayAggregate._min.checkInDate)
        : null,
      lastStayDate: stayAggregate._max.checkInDate
        ? toISODate(stayAggregate._max.checkInDate)
        : null,
      currentStays: current.map(toStay),
      upcoming: upcomingRows.map(toStay),
      history: {
        rows: historyRows.map(toStay),
        total: historyTotal,
        page: historyPage,
        pageSize: HISTORY_PAGE_SIZE,
      },
      financial,
      payments:
        paymentRows?.map((row) => ({
          id: row.id,
          paymentNumber: row.paymentNumber,
          reservationNumber: row.reservation.reservationNumber,
          paymentDate: row.paymentDate.toISOString(),
          method: row.method,
          amount: toAmountString(row.amount),
          isRefund: row.amount.isNegative(),
          reference: row.reference,
        })) ?? null,
      invoices:
        invoiceRows?.map((row) => ({
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          reservationNumber: row.reservation.reservationNumber,
          issueDate: toISODate(row.issueDate),
          total: toAmountString(row.total),
          paid: toAmountString(row.paid),
          balance: toAmountString(row.balance),
          status: row.status,
        })) ?? null,
      activity: activityRows,
    };
  });
}
