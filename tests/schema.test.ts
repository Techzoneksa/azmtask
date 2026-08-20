import { beforeAll, describe, expect, it } from "vitest";

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
