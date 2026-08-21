import { beforeAll, describe, expect, it } from "vitest";
import {
  HOUSEKEEPING_SOURCE,
  HOUSEKEEPING_STATUS,
  HOUSEKEEPING_TASK_STATUS,
  HOUSEKEEPING_TASK_TYPE,
  INVOICE_STATUS,
  MAINTENANCE_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PRIORITY,
  RESERVATION_SOURCE,
  RESERVATION_STATUS,
  UNIT_STATUS,
  statusMeta,
} from "@/lib/status";

import {
  formatAmount,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatNumber,
} from "@/lib/format";
import { prisma } from "@/lib/db";

import { resetDatabase, seedGuest, seedProperty } from "./helpers";

/**
 * Schema-level guarantees.
 *
 * These assert what the database enforces on its own — constraints that must hold
 * even if every line of application code is bypassed.
 */

beforeAll(async () => {
  await resetDatabase();
});

describe("Property", () => {
  it("creates and reads back a property", async () => {
    const property = await prisma.property.create({
      data: { name: "فندق النخبة", type: "HOTEL", city: "جدة", taxNumber: "300000000000003" },
    });

    const found = await prisma.property.findUnique({ where: { id: property.id } });
    expect(found?.name).toBe("فندق النخبة");
    expect(found?.status).toBe("ACTIVE");
  });

  it("rejects a duplicate tax number", async () => {
    await expect(
      prisma.property.create({
        data: { name: "منشأة أخرى", type: "RESORT", city: "الرياض", taxNumber: "300000000000003" },
      }),
    ).rejects.toThrow();
  });

  it("allows many properties without a tax number", async () => {
    await prisma.property.create({ data: { name: "أ", type: "HOTEL", city: "مكة" } });
    await prisma.property.create({ data: { name: "ب", type: "HOTEL", city: "مكة" } });
    const count = await prisma.property.count({ where: { taxNumber: null } });
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("UnitType and Unit", () => {
  it("links a unit to its property and type", async () => {
    const { property, unitType, unit } = await seedProperty({ unitNumber: "201" });

    const found = await prisma.unit.findUnique({
      where: { id: unit.id },
      select: {
        unitNumber: true,
        property: { select: { id: true } },
        unitType: { select: { id: true, name: true } },
      },
    });

    expect(found?.property.id).toBe(property.id);
    expect(found?.unitType.id).toBe(unitType.id);
    expect(found?.unitType.name).toBe("غرفة مزدوجة");
  });

  it("rejects a duplicate unit number inside the same property", async () => {
    const { property, unitType } = await seedProperty({ unitNumber: "301" });

    await expect(
      prisma.unit.create({
        data: { propertyId: property.id, unitTypeId: unitType.id, unitNumber: "301" },
      }),
    ).rejects.toThrow();
  });

  it("allows the same unit number in a different property", async () => {
    const first = await seedProperty({ unitNumber: "401" });
    const second = await seedProperty({ unitNumber: "401" });

    expect(first.unit.unitNumber).toBe("401");
    expect(second.unit.unitNumber).toBe("401");
    expect(first.unit.propertyId).not.toBe(second.unit.propertyId);
  });

  it("refuses to delete a unit type that still has units", async () => {
    const { unitType } = await seedProperty({ unitNumber: "501" });
    await expect(prisma.unitType.delete({ where: { id: unitType.id } })).rejects.toThrow();
  });
});

describe("Guest", () => {
  it("creates, reads and updates a guest", async () => {
    const guest = await seedGuest({ fullName: "منى العتيبي" });

    const updated = await prisma.guest.update({
      where: { id: guest.id },
      data: { email: "mona@example.com" },
      select: { fullName: true, email: true },
    });

    expect(updated.fullName).toBe("منى العتيبي");
    expect(updated.email).toBe("mona@example.com");
  });

  it("rejects the same document number for the same document type", async () => {
    await prisma.guest.create({
      data: { fullName: "أول", identificationType: "NATIONAL_ID", identificationNumber: "1010101010" },
    });

    await expect(
      prisma.guest.create({
        data: { fullName: "ثانٍ", identificationType: "NATIONAL_ID", identificationNumber: "1010101010" },
      }),
    ).rejects.toThrow();
  });

  it("allows the same number under a different document type", async () => {
    const passport = await prisma.guest.create({
      data: { fullName: "ثالث", identificationType: "PASSPORT", identificationNumber: "1010101010" },
    });
    expect(passport.id).toBeTruthy();
  });

  it("allows many guests with no document recorded", async () => {
    await prisma.guest.create({ data: { fullName: "بلا هوية أ" } });
    await prisma.guest.create({ data: { fullName: "بلا هوية ب" } });
    const count = await prisma.guest.count({ where: { identificationNumber: null } });
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("Employee and User separation", () => {
  it("creates an employee with no login", async () => {
    const { property } = await seedProperty({ unitNumber: "601" });

    const employee = await prisma.employee.create({
      data: {
        propertyId: property.id,
        name: "فاطمة الزهراني",
        department: "HOUSEKEEPING",
        position: "عاملة نظافة",
      },
      select: { id: true, name: true, user: true },
    });

    expect(employee.user).toBeNull();
  });

  it("creates a user with no employee record", async () => {
    const user = await prisma.user.create({
      data: { name: "حساب تكامل", email: "integration@nokhba-hotel.sa", passwordHash: "x" },
      select: { id: true, employeeId: true },
    });

    expect(user.employeeId).toBeNull();
  });

  it("allows at most one login per employee", async () => {
    const { property } = await seedProperty({ unitNumber: "701" });
    const employee = await prisma.employee.create({
      data: { propertyId: property.id, name: "موظف بحساب", department: "FRONT_OFFICE" },
    });

    await prisma.user.create({
      data: {
        name: "حساب أول",
        email: "one@nokhba-hotel.sa",
        passwordHash: "x",
        employeeId: employee.id,
      },
    });

    await expect(
      prisma.user.create({
        data: {
          name: "حساب ثانٍ",
          email: "two@nokhba-hotel.sa",
          passwordHash: "x",
          employeeId: employee.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate user email", async () => {
    await prisma.user.create({
      data: { name: "أ", email: "dup@nokhba-hotel.sa", passwordHash: "x" },
    });
    await expect(
      prisma.user.create({
        data: { name: "ب", email: "dup@nokhba-hotel.sa", passwordHash: "x" },
      }),
    ).rejects.toThrow();
  });
});

describe("Money precision", () => {
  it("stores two decimal places exactly, with no float drift", async () => {
    const { property, unitType } = await seedProperty({ unitNumber: "801" });

    // 0.1 + 0.2 is the classic float failure; through Decimal it must be exact.
    const created = await prisma.unitType.create({
      data: {
        propertyId: property.id,
        name: "جناح دقة",
        capacity: 2,
        baseRate: "0.10",
      },
    });

    const readBack = await prisma.unitType.findUniqueOrThrow({
      where: { id: created.id },
      select: { baseRate: true },
    });

    expect(readBack.baseRate.plus("0.20").toFixed(2)).toBe("0.30");
    expect(unitType.baseRate.toFixed(2)).toBe("450.00");
  });

  it("keeps precision on a large amount", async () => {
    const { property } = await seedProperty({ unitNumber: "802" });
    const type = await prisma.unitType.create({
      data: { propertyId: property.id, name: "جناح ملكي", capacity: 4, baseRate: "9999999.99" },
    });
    expect(type.baseRate.toFixed(2)).toBe("9999999.99");
  });
});

describe("status labels", () => {
  /*
   * Every value these enums can hold must have an Arabic label. A missing key does not
   * throw — it renders the raw enum on screen, which is a silent failure that reaches
   * the guest-facing screen and nowhere else.
   */
  const CASES: Array<[string, Parameters<typeof statusMeta>[0], string[]]> = [
    ["ReservationStatus", RESERVATION_STATUS, ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"]],
    ["PaymentStatus", PAYMENT_STATUS, ["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED"]],
    ["ReservationSource", RESERVATION_SOURCE, ["DIRECT", "WEBSITE", "PHONE", "WALK_IN", "CHANNEL", "CORPORATE"]],
    ["PaymentMethod", PAYMENT_METHOD, ["CASH", "CARD", "TRANSFER", "OTHER"]],
    ["InvoiceStatus", INVOICE_STATUS, ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"]],
    ["UnitStatus", UNIT_STATUS, ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "MAINTENANCE", "BLOCKED"]],
    /*
     * Added in Stage 10, after the housekeeping board surfaced two maps that had been
     * wrong since they were written: `PRIORITY` was keyed `medium` for an enum member
     * actually called NORMAL, so the majority of tasks rendered the raw word on
     * screen, and `HOUSEKEEPING_STATUS` carried an invented `out_of_service` that no
     * column can produce. Both are exactly what this test exists to catch.
     */
    ["HousekeepingStatus", HOUSEKEEPING_STATUS, ["CLEAN", "DIRTY", "CLEANING", "INSPECTED"]],
    ["HousekeepingTaskStatus", HOUSEKEEPING_TASK_STATUS, ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]],
    ["HousekeepingTaskType", HOUSEKEEPING_TASK_TYPE, ["CHECKOUT_CLEANING", "STAY_OVER", "DEEP_CLEANING", "INSPECTION", "TURNDOWN", "OTHER"]],
    ["HousekeepingSource", HOUSEKEEPING_SOURCE, ["CHECKOUT", "MANUAL", "INSPECTION_FAILED"]],
    ["TaskPriority", PRIORITY, ["LOW", "NORMAL", "HIGH", "URGENT"]],
    ["MaintenanceStatus", MAINTENANCE_STATUS, ["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]],
  ];

  for (const [name, map, values] of CASES) {
    it(`labels every ${name} in Arabic`, () => {
      for (const value of values) {
        const meta = statusMeta(map, value);
        // The fallback returns the key itself — which is exactly the failure.
        expect(meta.label, `${name}.${value} has no Arabic label`).not.toBe(value);
        expect(meta.label).toMatch(/[؀-ۿ]/);
      }
    });
  }

  it("survives an unknown value without throwing", () => {
    expect(statusMeta(RESERVATION_STATUS, "SOMETHING_NEW").label).toBe("SOMETHING_NEW");
    expect(statusMeta(RESERVATION_STATUS, null).label).toBe("—");
  });
});

describe("display formatting", () => {
  /*
   * `ar-SA` selects the Umm al-Qura calendar by default, and Node and Chromium do not
   * agree about it: the same instant rendered as "19 أغسطس 2026" on the server and
   * "6 ربيع الأول 1448 هـ" in the browser. Inside a client component that is a
   * hydration mismatch, and on screen it is a date that changes as the page loads.
   *
   * These assert the calendar and the numerals are pinned, so the output is a function
   * of the input and of nothing about the machine rendering it.
   */
  it("renders Gregorian dates with Latin numerals", () => {
    const instant = new Date("2026-08-19T10:02:00.000Z");

    expect(formatDate(instant)).toBe("19 أغسطس 2026");
    expect(formatDateShort(instant)).toContain("19");
    expect(formatDateShort(instant)).toContain("08");
    expect(formatDateShort(instant)).toContain("2026");
    expect(formatDateTime(instant)).toContain("19 أغسطس 2026");

    // No Hijri era marker, and no Arabic-Indic digits anywhere.
    for (const rendered of [formatDate(instant), formatDateShort(instant), formatDateTime(instant)]) {
      expect(rendered).not.toContain("هـ");
      expect(rendered).not.toMatch(/[٠-٩]/);
    }
  });

  it("renders numbers and money with Latin numerals", () => {
    expect(formatNumber(1250)).toBe("1,250");
    expect(formatAmount("1234.50")).toContain("1,234.50");
    expect(formatNumber(1250)).not.toMatch(/[٠-٩]/);
  });

  it("returns the fallback rather than throwing on a missing date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateShort("")).toBe("—");
  });
});
