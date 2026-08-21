import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  maskIdentificationNumber,
  normalizeDigits,
  normalizeEmail,
  normalizeIdentificationNumber,
  normalizeMobile,
  normalizeName,
} from "@/lib/guest-identity";
import { prisma } from "@/lib/db";
import type { Permission } from "@/lib/permissions";
import { getBusinessDate } from "@/server/business-date";
import { AppError } from "@/server/errors";
import {
  DuplicateGuestError,
  classifySearchTerm,
  createGuest,
  findGuestCandidates,
  getGuestDetails,
  listGuests,
  updateGuest,
} from "@/server/services/guest.service";

import { findDemoProperty } from "../prisma/demo/reset";

/**
 * Phase 6 — guests.
 *
 * The rules under test are the ones that decide whether the guest table stays an
 * identity layer or degrades into a pile of near-duplicates: one person reduces to
 * one row however their phone was typed, a document cannot belong to two people, a
 * shared family phone is not an error, and a profile shows only the property and only
 * the money the reader is entitled to.
 */

const run = promisify(execFile);

let propertyId: string;

const ACTOR = { id: null, name: "مشغّل الاختبار", email: "test@arwiqah-demo.sa", roles: ["admin"] };

const perms = (...list: Permission[]) => new Set<Permission>(list);
const ALL = perms("payments.view", "invoices.view", "activity.view", "guests.edit", "guests.view");
const VIEW_ONLY = perms("guests.view");

/** A unique document number per test, so tests never collide on the unique index. */
let sequence = 0;
const uniqueDoc = () => `109${String(700000 + sequence++).padStart(7, "0")}`;

beforeAll(async () => {
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL! };
  await run("npx", ["tsx", "prisma/seed.ts"], { env });
  await run("npx", ["tsx", "prisma/demo-seed.ts"], { env });

  const found = await findDemoProperty(prisma);
  if (!found) throw new Error("تعذّر إنشاء بيانات العرض.");
  propertyId = found;
}, 300_000);

// ---------------------------------------------------------------------------

describe("normalization", () => {
  it("reads Arabic-Indic digits as the numbers they are", () => {
    expect(normalizeDigits("٠٥٥١٢٣٤٥٦٧")).toBe("0551234567");
    expect(normalizeDigits("۰۵۵")).toBe("055");
  });

  it("reduces every Saudi mobile form to one canonical value", () => {
    const canonical = "0551234567";
    for (const written of [
      "0551234567",
      "05 5123 4567",
      "055-123-4567",
      "+966551234567",
      "00966551234567",
      "966551234567",
      "٠٥٥١٢٣٤٥٦٧",
      "  0551234567  ",
    ]) {
      expect(normalizeMobile(written)).toBe(canonical);
    }
  });

  it("refuses what is not a Saudi mobile rather than storing a guess", () => {
    expect(normalizeMobile("12345")).toBeNull();
    expect(normalizeMobile("0451234567")).toBeNull();
    expect(normalizeMobile("محمد")).toBeNull();
  });

  it("tidies a document number without altering it", () => {
    // Case and spacing are presentation; the characters are identity.
    expect(normalizeIdentificationNumber(" a123 4567 ")).toBe("A1234567");
    expect(normalizeIdentificationNumber("١٠٩٨٧٦٥٤٣٢")).toBe("1098765432");
    // A hyphen inside a passport number survives — it may be part of the number.
    expect(normalizeIdentificationNumber("X-99887")).toBe("X-99887");
  });

  it("collapses whitespace in a name without touching its spelling", () => {
    expect(normalizeName("  محمد   بن   عبدالله  ")).toBe("محمد بن عبدالله");
    // Diacritics and hamza forms are how the name is spelled, and are left alone.
    expect(normalizeName("إبراهيم")).toBe("إبراهيم");
  });

  it("lowercases email for comparison", () => {
    expect(normalizeEmail("  Guest@Example.COM ")).toBe("guest@example.com");
  });

  it("masks a document down to its last four characters", () => {
    expect(maskIdentificationNumber("1098765432")).toBe("••••••5432");
    expect(maskIdentificationNumber("A1B2")).toBe("••••");
    expect(maskIdentificationNumber(null)).toBe("—");
  });
});

describe("search classification", () => {
  it("treats a complete mobile as an exact lookup", () => {
    expect(classifySearchTerm("+966551234567")).toEqual({ kind: "mobile", mobile: "0551234567" });
  });

  it("treats a partial number as a prefix lookup on document and phone", () => {
    expect(classifySearchTerm("10987")).toEqual({ kind: "digits", digits: "10987" });
  });

  it("treats anything with letters as a name search", () => {
    expect(classifySearchTerm("محمد")).toEqual({ kind: "text", text: "محمد" });
  });

  it("ignores an empty term rather than matching everything", () => {
    expect(classifySearchTerm("   ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("directory", () => {
  it("returns a page of guests with operational columns", async () => {
    const { rows, total } = await listGuests([propertyId], { page: 1, pageSize: 25 });

    expect(total).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(25);
    expect(rows[0]).toHaveProperty("stayCount");
    expect(rows[0]).toHaveProperty("lastStayDate");
  });

  it("paginates on the server", async () => {
    const first = await listGuests([propertyId], { page: 1, pageSize: 5 });
    const second = await listGuests([propertyId], { page: 2, pageSize: 5 });

    expect(first.rows).toHaveLength(5);
    expect(second.rows).toHaveLength(5);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(10);
  });

  it("never sends a whole document number to the directory", async () => {
    const { rows } = await listGuests([propertyId], { page: 1, pageSize: 50 });
    const withDocument = rows.filter((row) => row.identificationMasked !== "—");

    expect(withDocument.length).toBeGreaterThan(0);
    for (const row of withDocument) {
      expect(row.identificationMasked).toMatch(/^•+/);
    }
    // The raw value is absent from the payload, not merely unrendered.
    expect(JSON.stringify(rows)).not.toContain("identificationNumber");
  });

  it("finds a guest by name", async () => {
    const anyGuest = await prisma.guest.findFirst({ select: { fullName: true } });
    const family = anyGuest!.fullName.split(" ").pop()!;

    const { rows } = await listGuests([propertyId], { q: family, page: 1, pageSize: 25 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.fullName.includes(family))).toBe(true);
  });

  it("finds a guest by mobile, however the number was typed", async () => {
    const guest = await prisma.guest.findFirst({
      where: { mobile: { not: null } },
      select: { id: true, mobile: true },
    });

    const local = await listGuests([propertyId], { q: guest!.mobile!, page: 1, pageSize: 25 });
    const international = await listGuests([propertyId], {
      q: `+966${guest!.mobile!.slice(1)}`,
      page: 1,
      pageSize: 25,
    });

    expect(local.rows.map((r) => r.id)).toContain(guest!.id);
    expect(international.rows.map((r) => r.id)).toContain(guest!.id);
  });

  it("finds a guest by document number", async () => {
    const guest = await prisma.guest.findFirst({
      where: { identificationNumber: { not: null } },
      select: { id: true, identificationNumber: true },
    });

    const { rows } = await listGuests([propertyId], {
      q: guest!.identificationNumber!,
      page: 1,
      pageSize: 25,
    });
    expect(rows.map((r) => r.id)).toContain(guest!.id);
  });

  it("returns nothing rather than everything for a term that matches no one", async () => {
    const { rows, total } = await listGuests([propertyId], {
      q: "لاأحديحملهذاالاسم",
      page: 1,
      pageSize: 25,
    });
    expect(total).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("filters to guests currently in house", async () => {
    const { rows } = await listGuests([propertyId], { status: "current", page: 1, pageSize: 100 });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.inHouse)).toBe(true);

    const inHouseTotal = await prisma.reservation.groupBy({
      by: ["guestId"],
      where: { propertyId, status: "CHECKED_IN" },
    });
    expect(rows.length).toBe(inHouseTotal.length);
  });

  it("filters by nationality", async () => {
    const sample = await prisma.guest.findFirst({
      where: { nationality: { not: null } },
      select: { nationality: true },
    });

    const { rows } = await listGuests([propertyId], {
      nationality: sample!.nationality!,
      page: 1,
      pageSize: 100,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.nationality === sample!.nationality)).toBe(true);
  });

  it("costs the same number of queries whatever the page size", async () => {
    /*
     * The N+1 test, stated as the property that actually matters: the statement count
     * must not grow with the number of rows. Measuring a page of 5 against a page of
     * 25 cancels out every constant — the counter's own statements included — and a
     * per-row implementation would show a difference of about eighty.
     */
    const measure = async (pageSize: number) => {
      const before = await queryCount();
      await listGuests([propertyId], { page: 1, pageSize });
      return (await queryCount()) - before;
    };

    // Warm anything cached per process, so the first call is not charged for it.
    await measure(5);

    const small = await measure(5);
    const large = await measure(25);

    /*
     * Not exact equality: the connection pool adds a statement or two of its own
     * housekeeping, which drifts run to run. The claim under test is that the count
     * does not grow with the rows — a per-guest implementation would put `large` near
     * a hundred against `small` near twenty, which this catches by a wide margin.
     */
    expect(large).toBeLessThanOrEqual(small + 3);
    expect(large).toBeLessThanOrEqual(12);
  });
});

/**
 * Statements executed, read from the server itself.
 *
 * Global rather than per-session: Prisma hands each statement whichever pooled
 * connection is free, so a session counter would be read on a different connection
 * from the one that did the work. The suite runs serially against a private database,
 * so the global counter attributes cleanly.
 */
async function queryCount(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ Variable_name: string; Value: string }>>(
    "SHOW GLOBAL STATUS LIKE 'Questions'",
  );
  return Number(rows[0]?.Value ?? 0);
}

// ---------------------------------------------------------------------------

describe("creating a guest", () => {
  it("creates a guest from a name alone", async () => {
    // A profile is a record that this person exists. The full legal set is what
    // check-in demands, and that rule belongs to check-in.
    const guest = await createGuest({ fullName: "فهد بن ناصر القحطاني" }, ACTOR);

    const stored = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(stored.fullName).toBe("فهد بن ناصر القحطاني");
    expect(stored.mobile).toBeNull();
    expect(stored.identificationNumber).toBeNull();
  });

  it("stores the canonical mobile, not the typed one", async () => {
    const guest = await createGuest(
      { fullName: "ريم بنت سالم", mobile: "+966 55 987 6543" },
      ACTOR,
    );

    const stored = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(stored.mobile).toBe("0559876543");
  });

  it("collapses whitespace in the stored name", async () => {
    const guest = await createGuest({ fullName: "  عمر   بن   يوسف  " }, ACTOR);
    const stored = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(stored.fullName).toBe("عمر بن يوسف");
  });

  it("rejects a malformed email", async () => {
    await expect(
      createGuest({ fullName: "سارة العتيبي", email: "not-an-email" }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a mobile that is not a Saudi number", async () => {
    await expect(
      createGuest({ fullName: "بدر الشمري", mobile: "12345" }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a name too short to identify anyone", async () => {
    await expect(createGuest({ fullName: "أ" }, ACTOR)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuses half a document, because half identifies nobody", async () => {
    await expect(
      createGuest({ fullName: "نايف الدوسري", identificationNumber: "1098765432" }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      createGuest({ fullName: "نايف الدوسري", identificationType: "PASSPORT" }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a date of birth in the future", async () => {
    await expect(
      createGuest({ fullName: "لينا الحربي", dateOfBirth: "2090-01-01" }, ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("writes an activity entry naming the guest", async () => {
    const guest = await createGuest({ fullName: "طلال بن مشعل" }, ACTOR);

    const entry = await prisma.activityLog.findFirst({
      where: { entityType: "Guest", entityId: guest.id, action: "create" },
    });
    expect(entry).not.toBeNull();
    expect(entry!.description).toContain("طلال بن مشعل");
  });

  it("keeps document values out of the activity metadata", async () => {
    const documentNumber = uniqueDoc();
    const guest = await createGuest(
      {
        fullName: "وليد بن راشد",
        identificationType: "NATIONAL_ID",
        identificationNumber: documentNumber,
        mobile: "0533221100",
      },
      ACTOR,
    );

    const entry = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "Guest", entityId: guest.id, action: "create" },
    });

    // The log records that a document was recorded, never which one.
    const serialized = JSON.stringify(entry.metadata);
    expect(serialized).not.toContain(documentNumber);
    expect(serialized).not.toContain("0533221100");
    expect(serialized).toContain("hasIdentificationNumber");
  });
});

describe("duplicate prevention", () => {
  it("blocks a second profile holding the same document", async () => {
    const documentNumber = uniqueDoc();
    const first = await createGuest(
      {
        fullName: "خالد بن عبدالعزيز",
        identificationType: "NATIONAL_ID",
        identificationNumber: documentNumber,
      },
      ACTOR,
    );

    const attempt = createGuest(
      {
        fullName: "خالد عبدالعزيز",
        identificationType: "NATIONAL_ID",
        identificationNumber: documentNumber,
      },
      ACTOR,
    );

    await expect(attempt).rejects.toBeInstanceOf(DuplicateGuestError);
    await attempt.catch((error: DuplicateGuestError) => {
      expect(error.blocking).toBe(true);
      expect(error.candidates[0].guestId).toBe(first.id);
      expect(error.candidates[0].severity).toBe("document");
      // Even the refusal masks the number it is refusing over.
      expect(error.candidates[0].identificationMasked).toMatch(/^•+/);
      expect(error.message).toContain("مسجّل مسبقًا");
    });
  });

  it("blocks the duplicate even when the number was typed differently", async () => {
    const documentNumber = uniqueDoc();
    await createGuest(
      {
        fullName: "منيرة الغامدي",
        identificationType: "IQAMA",
        identificationNumber: documentNumber,
      },
      ACTOR,
    );

    // Same document, Arabic-Indic digits and stray spaces.
    const arabicForm = ` ${documentNumber.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)])} `;
    await expect(
      createGuest(
        {
          fullName: "منيرة سعيد الغامدي",
          identificationType: "IQAMA",
          identificationNumber: arabicForm,
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(DuplicateGuestError);
  });

  it("warns on a shared mobile but does not forbid it", async () => {
    // A family shares one phone. Refusing that would enforce a rule nobody asked for.
    const shared = "0567778899";
    const parent = await createGuest({ fullName: "أبو محمد الزهراني", mobile: shared }, ACTOR);

    const warned = createGuest({ fullName: "محمد الزهراني", mobile: shared }, ACTOR);
    await expect(warned).rejects.toBeInstanceOf(DuplicateGuestError);
    await warned.catch((error: DuplicateGuestError) => {
      expect(error.blocking).toBe(false);
      expect(error.candidates.map((c) => c.guestId)).toContain(parent.id);
      expect(error.candidates[0].severity).toBe("mobile");
    });

    // With the match seen and acknowledged, the second profile is created.
    const child = await createGuest(
      { fullName: "محمد الزهراني", mobile: shared, confirmDuplicate: true },
      ACTOR,
    );
    expect(child.id).not.toBe(parent.id);

    const both = await prisma.guest.count({ where: { mobile: shared } });
    expect(both).toBe(2);
  });

  it("warns on a shared email", async () => {
    const shared = "family.alharbi@example.com";
    await createGuest({ fullName: "سلمان الحربي", email: shared }, ACTOR);

    const warned = createGuest({ fullName: "هند الحربي", email: shared }, ACTOR);
    await expect(warned).rejects.toBeInstanceOf(DuplicateGuestError);
    await warned.catch((error: DuplicateGuestError) => {
      expect(error.blocking).toBe(false);
      expect(error.candidates[0].severity).toBe("email");
    });
  });

  it("does not treat a similar name as a duplicate", async () => {
    // In a directory full of محمد, name matching would warn on nearly every creation
    // — and a warning that always fires is one nobody reads.
    await createGuest({ fullName: "محمد بن أحمد السلمي" }, ACTOR);
    const other = await createGuest({ fullName: "محمد بن أحمد السالمي" }, ACTOR);

    expect(other.id).toBeTruthy();
    const candidates = await findGuestCandidates({ mobile: null, email: null });
    expect(candidates).toHaveLength(0);
  });

  it("treats an immediate identical resubmission as one submission", async () => {
    // The defence the unique index cannot provide: a documentless guest, submitted
    // twice because the first response was slow.
    const payload = { fullName: "عبدالرحمن بن فيصل", mobile: "0544332211" };

    const first = await createGuest(payload, ACTOR);
    const second = await createGuest({ ...payload, confirmDuplicate: true }, ACTOR);

    expect(second.id).toBe(first.id);
    expect(await prisma.guest.count({ where: { mobile: "0544332211" } })).toBe(1);
  });
});

describe("editing a guest", () => {
  it("updates in place, keeping the id and everything hanging from it", async () => {
    const guest = await prisma.guest.findFirstOrThrow({
      where: { reservations: { some: {} } },
      select: { id: true, fullName: true },
    });
    const before = await prisma.reservation.count({ where: { guestId: guest.id } });

    const updated = await updateGuest(
      { guestId: guest.id, fullName: `${guest.fullName}`, preferences: "يفضل غرفة هادئة" },
      ACTOR,
    );

    expect(updated.id).toBe(guest.id);
    expect(await prisma.reservation.count({ where: { guestId: guest.id } })).toBe(before);

    const stored = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(stored.preferences).toBe("يفضل غرفة هادئة");
  });

  it("refuses to move a document onto a profile that would collide", async () => {
    const documentNumber = uniqueDoc();
    await createGuest(
      {
        fullName: "صاحب الوثيقة",
        identificationType: "PASSPORT",
        identificationNumber: documentNumber,
      },
      ACTOR,
    );
    const other = await createGuest({ fullName: "شخص آخر تمامًا" }, ACTOR);

    const attempt = updateGuest(
      {
        guestId: other.id,
        fullName: "شخص آخر تمامًا",
        identificationType: "PASSPORT",
        identificationNumber: documentNumber,
      },
      ACTOR,
    );

    await expect(attempt).rejects.toBeInstanceOf(DuplicateGuestError);
    await attempt.catch((error: DuplicateGuestError) => expect(error.blocking).toBe(true));
  });

  it("does not flag a guest's own unchanged document as a conflict", async () => {
    const documentNumber = uniqueDoc();
    const guest = await createGuest(
      {
        fullName: "ثابت الوثيقة",
        identificationType: "GCC_ID",
        identificationNumber: documentNumber,
      },
      ACTOR,
    );

    const updated = await updateGuest(
      {
        guestId: guest.id,
        fullName: "ثابت الوثيقة المعدّل",
        identificationType: "GCC_ID",
        identificationNumber: documentNumber,
      },
      ACTOR,
    );
    expect(updated.fullName).toBe("ثابت الوثيقة المعدّل");
  });

  it("rejects an unknown guest id", async () => {
    await expect(
      updateGuest({ guestId: "cmzzzzzzzzzzzzzzzzzzzzzzz", fullName: "لا أحد" }, ACTOR),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("logs which fields changed, never their values", async () => {
    const guest = await createGuest({ fullName: "قابل للتعديل", mobile: "0512340000" }, ACTOR);

    await updateGuest(
      { guestId: guest.id, fullName: "قابل للتعديل", mobile: "0512349999" },
      ACTOR,
    );

    const entry = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: "Guest", entityId: guest.id, action: "update" },
      orderBy: { createdAt: "desc" },
    });

    const serialized = JSON.stringify(entry.metadata);
    expect(serialized).toContain("mobile");
    expect(serialized).not.toContain("0512340000");
    expect(serialized).not.toContain("0512349999");
  });
});

// ---------------------------------------------------------------------------

describe("guest profile", () => {
  it("separates the current stay from upcoming and completed ones", async () => {
    const inHouse = await prisma.reservation.findFirstOrThrow({
      where: { propertyId, status: "CHECKED_IN" },
      select: { guestId: true, id: true, reservationNumber: true },
    });

    const profile = await getGuestDetails(inHouse.guestId, [propertyId], ALL);

    // A guest holding two rooms has two live stays, and both must be listed.
    expect(profile.currentStays.length).toBeGreaterThan(0);
    expect(profile.currentStays.map((row) => row.id)).toContain(inHouse.id);

    // The three groups are disjoint — a stay never appears in two of them.
    const ids = [
      ...profile.currentStays.map((row) => row.id),
      ...profile.upcoming.map((row) => row.id),
      ...profile.history.rows.map((row) => row.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders no current stay as absence, not a placeholder", async () => {
    const guest = await createGuest({ fullName: "بلا إقامة حالية" }, ACTOR);
    const profile = await getGuestDetails(guest.id, [propertyId], ALL);

    expect(profile.currentStays).toEqual([]);
    expect(profile.upcoming).toEqual([]);
    expect(profile.history.rows).toEqual([]);
    expect(profile.history.total).toBe(0);
    expect(profile.stayCount).toBe(0);
  });

  it("shows a confirmed future booking as upcoming", async () => {
    const today = await getBusinessDate();
    const future = await prisma.reservation.findFirstOrThrow({
      where: { propertyId, status: "CONFIRMED", checkInDate: { gt: today } },
      select: { guestId: true, id: true },
    });

    const profile = await getGuestDetails(future.guestId, [propertyId], ALL);
    expect(profile.upcoming.map((row) => row.id)).toContain(future.id);
  });

  it("counts stays the way the reservations table does", async () => {
    const guest = await prisma.reservation.groupBy({
      by: ["guestId"],
      where: { propertyId, status: { in: ["CHECKED_IN", "CHECKED_OUT"] } },
      _count: { _all: true },
      orderBy: { _count: { guestId: "desc" } },
      take: 1,
    });

    const profile = await getGuestDetails(guest[0].guestId, [propertyId], ALL);
    expect(profile.stayCount).toBe(guest[0]._count._all);
  });

  it("paginates a long stay history rather than loading all of it", async () => {
    const busiest = await prisma.reservation.groupBy({
      by: ["guestId"],
      where: { propertyId },
      _count: { _all: true },
      orderBy: { _count: { guestId: "desc" } },
      take: 1,
    });

    const page1 = await getGuestDetails(busiest[0].guestId, [propertyId], ALL, { historyPage: 1 });
    expect(page1.history.rows.length).toBeLessThanOrEqual(page1.history.pageSize);

    if (page1.history.total > page1.history.pageSize) {
      const page2 = await getGuestDetails(busiest[0].guestId, [propertyId], ALL, {
        historyPage: 2,
      });
      const overlap = page1.history.rows
        .map((r) => r.id)
        .filter((id) => page2.history.rows.some((r) => r.id === id));
      expect(overlap).toHaveLength(0);
    }
  });

  it("reconciles the financial summary against the tables it summarises", async () => {
    const guest = await prisma.payment.groupBy({
      by: ["guestId"],
      where: { propertyId },
      _count: { _all: true },
      orderBy: { _count: { guestId: "desc" } },
      take: 1,
    });

    const profile = await getGuestDetails(guest[0].guestId, [propertyId], ALL);
    expect(profile.financial).not.toBeNull();

    const [receipts, refunds, invoices] = await Promise.all([
      prisma.payment.aggregate({
        where: { guestId: guest[0].guestId, propertyId, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { guestId: guest[0].guestId, propertyId, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { guestId: guest[0].guestId, propertyId, status: { not: "CANCELLED" } },
        _sum: { total: true, balance: true },
      }),
    ]);

    expect(Number(profile.financial!.totalReceipts)).toBe(Number(receipts._sum.amount ?? 0));
    expect(Number(profile.financial!.totalInvoiced)).toBe(Number(invoices._sum.total ?? 0));
    expect(Number(profile.financial!.outstanding)).toBe(Number(invoices._sum.balance ?? 0));
    // Refunds shown as a magnitude, and netted rather than added.
    expect(profile.financial!.totalRefunds.startsWith("-")).toBe(false);
    expect(Number(profile.financial!.netPaid)).toBe(
      Number(receipts._sum.amount ?? 0) + Number(refunds._sum.amount ?? 0),
    );
    // Every figure carries two decimal places — money is never a bare integer.
    expect(profile.financial!.totalInvoiced).toMatch(/\.\d{2}$/);
  });

  it("marks a refund as a refund rather than a smaller receipt", async () => {
    const refund = await prisma.payment.findFirst({
      where: { propertyId, amount: { lt: 0 } },
      select: { guestId: true, id: true },
    });

    if (refund) {
      const profile = await getGuestDetails(refund.guestId, [propertyId], ALL);
      const row = profile.payments!.find((p) => p.id === refund.id);
      expect(row?.isRefund).toBe(true);
    }
  });

  it("shows activity from the guest's own record and from their stays", async () => {
    const inHouse = await prisma.reservation.findFirstOrThrow({
      where: { propertyId, status: "CHECKED_IN" },
      select: { guestId: true },
    });

    const profile = await getGuestDetails(inHouse.guestId, [propertyId], ALL);
    expect(profile.activity).not.toBeNull();
    expect(Array.isArray(profile.activity)).toBe(true);
  });

  it("rejects an unknown guest id without revealing whether it ever existed", async () => {
    await expect(
      getGuestDetails("cmzzzzzzzzzzzzzzzzzzzzzzz", [propertyId], ALL),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a malformed guest id", async () => {
    await expect(getGuestDetails("../../etc/passwd", [propertyId], ALL)).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

// ---------------------------------------------------------------------------

describe("financial data and permissions", () => {
  it("omits money from the payload entirely for a caller without payments.view", async () => {
    const guest = await prisma.payment.findFirstOrThrow({
      where: { propertyId },
      select: { guestId: true },
    });

    const restricted = await getGuestDetails(guest.guestId, [propertyId], VIEW_ONLY);

    // Not hidden in a template — absent from the object that would be serialised.
    expect(restricted.payments).toBeNull();
    expect(restricted.invoices).toBeNull();
    expect(restricted.financial).toBeNull();

    const serialized = JSON.stringify(restricted);
    expect(serialized).not.toContain('"amount"');
    expect(serialized).not.toContain('"balance"');
    expect(serialized).not.toContain('"totalInvoiced"');
    expect(serialized).not.toContain('"paymentStatus"');
  });

  it("omits per-stay totals from history for a caller without payments.view", async () => {
    const guest = await prisma.reservation.findFirstOrThrow({
      where: { propertyId, status: "CHECKED_OUT" },
      select: { guestId: true },
    });

    const restricted = await getGuestDetails(guest.guestId, [propertyId], VIEW_ONLY);
    expect(restricted.history.rows.length).toBeGreaterThan(0);
    for (const row of restricted.history.rows) {
      expect(row).not.toHaveProperty("total");
      expect(row).not.toHaveProperty("balance");
    }
  });

  it("gives invoices to a caller with invoices.view but no payment history", async () => {
    const guest = await prisma.invoice.findFirstOrThrow({
      where: { propertyId },
      select: { guestId: true },
    });

    const profile = await getGuestDetails(
      guest.guestId,
      [propertyId],
      perms("guests.view", "invoices.view"),
    );

    expect(profile.invoices).not.toBeNull();
    expect(profile.payments).toBeNull();
    // The summary exists but carries no payment figures.
    expect(profile.financial!.totalInvoiced).toBeTruthy();
    expect(Number(profile.financial!.totalReceipts)).toBe(0);
  });

  it("withholds the activity log from a caller without activity.view", async () => {
    const guest = await prisma.guest.findFirstOrThrow({ select: { id: true } });
    const profile = await getGuestDetails(guest.id, [propertyId], perms("guests.view"));
    expect(profile.activity).toBeNull();
  });
});

describe("document visibility", () => {
  it("gives the whole number only to a caller who handles documents", async () => {
    const guest = await prisma.guest.findFirstOrThrow({
      where: { identificationNumber: { not: null } },
      select: { id: true, identificationNumber: true },
    });

    const desk = await getGuestDetails(guest.id, [propertyId], ALL);
    expect(desk.canReadDocuments).toBe(true);
    expect(desk.guest.identificationNumber).toBe(guest.identificationNumber);
  });

  it("masks the number for a caller who only looks guests up", async () => {
    const guest = await prisma.guest.findFirstOrThrow({
      where: { identificationNumber: { not: null } },
      select: { id: true, identificationNumber: true },
    });

    const viewer = await getGuestDetails(guest.id, [propertyId], VIEW_ONLY);

    expect(viewer.canReadDocuments).toBe(false);
    expect(viewer.guest.identificationNumber).toBeNull();
    expect(viewer.guest.identificationMasked).toMatch(/^•+/);
    // The raw value is not somewhere else in the payload either.
    expect(JSON.stringify(viewer)).not.toContain(guest.identificationNumber!);
  });
});

// ---------------------------------------------------------------------------

/**
 * Multi-property scoping.
 *
 * A guest is one identity across the group; their stays belong to the property they
 * happened at. Built and tested now, while the demo has one property — a scoping bug
 * found after a second property exists means auditing every query written before it.
 */
describe("property scoping", () => {
  let alpha: string;
  let beta: string;
  let sharedGuest: string;
  let alphaReservation: string;
  let betaReservation: string;

  /*
   * Torn down and rebuilt each run. These fixtures use fixed reservation numbers,
   * which are globally unique — leftovers from an interrupted run would make every
   * later run fail on the constraint rather than on the behaviour under test.
   */
  const SCOPE_PROPERTIES = ["منشأة ألف", "منشأة باء"];

  async function removeScopeFixtures() {
    const properties = await prisma.property.findMany({
      where: { name: { in: SCOPE_PROPERTIES } },
      select: { id: true },
    });
    if (properties.length === 0) return;

    const ids = properties.map((property) => property.id);
    const scope = { propertyId: { in: ids } };

    await prisma.activityLog.deleteMany({ where: scope });
    await prisma.invoice.deleteMany({ where: scope });
    await prisma.payment.deleteMany({ where: scope });
    await prisma.reservationCharge.deleteMany({
      where: { reservation: { propertyId: { in: ids } } },
    });
    await prisma.reservation.deleteMany({ where: scope });
    await prisma.unitBlock.deleteMany({ where: scope });
    await prisma.unit.deleteMany({ where: scope });
    await prisma.unitType.deleteMany({ where: scope });
    await prisma.property.deleteMany({ where: { id: { in: ids } } });
    await prisma.guest.deleteMany({ where: { mobile: "0500000001" } });
  }

  beforeAll(async () => {
    await removeScopeFixtures();

    const build = async (name: string, unitNumber: string) => {
      const property = await prisma.property.create({
        data: { name, type: "HOTEL", city: "الرياض" },
      });
      const unitType = await prisma.unitType.create({
        data: { propertyId: property.id, name: "غرفة", capacity: 2, baseRate: "500.00" },
      });
      const unit = await prisma.unit.create({
        data: { propertyId: property.id, unitTypeId: unitType.id, unitNumber },
      });
      return { property, unitType, unit };
    };

    const a = await build("منشأة ألف", "A-101");
    const b = await build("منشأة باء", "B-909");
    alpha = a.property.id;
    beta = b.property.id;

    const guest = await createGuest(
      { fullName: "نزيل يقيم في المنشأتين", mobile: "0500000001" },
      ACTOR,
    );
    sharedGuest = guest.id;

    const stay = async (
      built: Awaited<ReturnType<typeof build>>,
      number: string,
      total: string,
    ) => {
      const reservation = await prisma.reservation.create({
        data: {
          reservationNumber: number,
          propertyId: built.property.id,
          guestId: guest.id,
          unitId: built.unit.id,
          unitTypeId: built.unitType.id,
          checkInDate: new Date("2026-06-01T00:00:00.000Z"),
          checkOutDate: new Date("2026-06-04T00:00:00.000Z"),
          nightlyRate: "500.00",
          subtotal: total,
          total,
          paidAmount: total,
          balance: "0.00",
          status: "CHECKED_OUT",
          paymentStatus: "PAID",
        },
      });
      await prisma.payment.create({
        data: {
          paymentNumber: `PAY-${number}`,
          reservationId: reservation.id,
          guestId: guest.id,
          propertyId: built.property.id,
          amount: total,
          method: "CASH",
        },
      });
      await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${number}`,
          propertyId: built.property.id,
          reservationId: reservation.id,
          guestId: guest.id,
          subtotal: total,
          total,
          paid: total,
          balance: "0.00",
          status: "PAID",
          issueDate: new Date("2026-06-04T00:00:00.000Z"),
        },
      });
      return reservation.id;
    };

    alphaReservation = await stay(a, "SCOPE-A-1", "1500.00");
    betaReservation = await stay(b, "SCOPE-B-1", "2400.00");
  }, 120_000);

  afterAll(removeScopeFixtures);

  it("shows a property's own stays and none from the other", async () => {
    const fromAlpha = await getGuestDetails(sharedGuest, [alpha], ALL);
    const ids = [
      ...fromAlpha.currentStays.map((r) => r.id),
      ...fromAlpha.upcoming.map((r) => r.id),
      ...fromAlpha.history.rows.map((r) => r.id),
    ];

    expect(ids).toContain(alphaReservation);
    expect(ids).not.toContain(betaReservation);
    expect(fromAlpha.reservationCount).toBe(1);
  });

  it("does not leak the other property's room number or name", async () => {
    const fromAlpha = await getGuestDetails(sharedGuest, [alpha], ALL);
    const serialized = JSON.stringify(fromAlpha);

    expect(serialized).not.toContain("B-909");
    expect(serialized).not.toContain("منشأة باء");
    expect(serialized).not.toContain("SCOPE-B-1");
  });

  it("does not leak the other property's money", async () => {
    const fromAlpha = await getGuestDetails(sharedGuest, [alpha], ALL);

    expect(Number(fromAlpha.financial!.totalInvoiced)).toBe(1500);
    expect(Number(fromAlpha.financial!.netPaid)).toBe(1500);
    expect(fromAlpha.payments!.map((p) => p.paymentNumber)).toEqual(["PAY-SCOPE-A-1"]);
    expect(fromAlpha.invoices!.map((i) => i.invoiceNumber)).toEqual(["INV-SCOPE-A-1"]);
    expect(JSON.stringify(fromAlpha)).not.toContain("2400");
  });

  it("shows the other property its own figures, symmetrically", async () => {
    const fromBeta = await getGuestDetails(sharedGuest, [beta], ALL);

    expect(Number(fromBeta.financial!.totalInvoiced)).toBe(2400);
    expect(fromBeta.history.rows.map((r) => r.id)).toEqual([betaReservation]);
    expect(JSON.stringify(fromBeta)).not.toContain("A-101");
  });

  it("combines both only for a caller scoped to both", async () => {
    const both = await getGuestDetails(sharedGuest, [alpha, beta], ALL);

    expect(both.reservationCount).toBe(2);
    expect(Number(both.financial!.totalInvoiced)).toBe(3900);
  });

  it("keeps the guest findable from either property — identity is not scoped", async () => {
    // The person exists once across the group; only their operational history is
    // partitioned. A directory that hid the identity would have reception create a
    // second profile for someone the system already knows.
    for (const scope of [[alpha], [beta]]) {
      const { rows } = await listGuests(scope, { q: "0500000001", page: 1, pageSize: 25 });
      expect(rows.map((r) => r.id)).toContain(sharedGuest);
    }
  });

  it("scopes the directory's stay counts to the caller's property", async () => {
    const fromAlpha = await listGuests([alpha], { q: "0500000001", page: 1, pageSize: 25 });
    const fromBoth = await listGuests([alpha, beta], { q: "0500000001", page: 1, pageSize: 25 });

    expect(fromAlpha.rows[0].reservationCount).toBe(1);
    expect(fromBoth.rows[0].reservationCount).toBe(2);
  });

  it("scopes the activity timeline to the caller's property", async () => {
    await prisma.activityLog.create({
      data: {
        propertyId: beta,
        userName: "موظف المنشأة باء",
        userEmail: "beta@example.com",
        userRoles: "reception",
        module: "reservations",
        action: "checkout",
        entityType: "Reservation",
        entityId: betaReservation,
        description: "مغادرة من المنشأة باء — سرية",
      },
    });

    const fromAlpha = await getGuestDetails(sharedGuest, [alpha], ALL);
    expect(JSON.stringify(fromAlpha.activity)).not.toContain("سرية");

    const fromBeta = await getGuestDetails(sharedGuest, [beta], ALL);
    expect(JSON.stringify(fromBeta.activity)).toContain("سرية");
  });
});
