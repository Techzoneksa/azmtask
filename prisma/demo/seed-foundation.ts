import bcrypt from "bcryptjs";

import type { PrismaClient } from "../../src/generated/prisma/client";

import {
  DEMO_MARKER_KEY,
  DEMO_MARKER_VALUE,
  DEMO_PROPERTY,
  FLOOR_PLAN,
  OUTLETS,
  UNIT_TYPES,
  type UnitTypeKey,
} from "./constants";
import {
  DEMO_USERS,
  EMPLOYEES,
  GCC_NAMES,
  GCC_NATIONALITIES,
  GUEST_NOTES,
  GUEST_PREFERENCES,
  INTERNATIONAL_NAMES,
  SAUDI_FEMALE_NAMES,
  SAUDI_MALE_NAMES,
  type EmployeeKey,
} from "./people-data";
import type { Random } from "./random";

/**
 * Foundation: the things every later stage refers to — the property, its rooms,
 * the team, the logins and the guest list.
 *
 * Everything here is upserted on a natural key, so re-running the demo seed updates
 * the same hotel rather than creating a second one.
 */

export type Foundation = {
  propertyId: string;
  unitTypeIds: Record<UnitTypeKey, string>;
  units: Array<{ id: string; unitNumber: string; floor: number; typeKey: UnitTypeKey; baseRate: string }>;
  employeeIds: Record<EmployeeKey, string>;
  userIds: Record<string, string>;
  guestIds: string[];
  outletIds: Record<string, string>;
};

export async function seedProperty(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.property.findFirst({
    where: { name: DEMO_PROPERTY.name },
    select: { id: true },
  });

  const property = existing
    ? await prisma.property.update({
        where: { id: existing.id },
        data: { ...DEMO_PROPERTY, status: "ACTIVE" },
        select: { id: true },
      })
    : await prisma.property.create({
        data: { ...DEMO_PROPERTY, status: "ACTIVE" },
        select: { id: true },
      });

  // The marker is what lets the reset command tell demo data from real data.
  await prisma.systemSetting.upsert({
    where: { propertyId_key: { propertyId: property.id, key: DEMO_MARKER_KEY } },
    create: { propertyId: property.id, key: DEMO_MARKER_KEY, value: DEMO_MARKER_VALUE },
    update: { value: DEMO_MARKER_VALUE },
  });

  return property.id;
}

export async function seedUnitTypes(
  prisma: PrismaClient,
  propertyId: string,
): Promise<Record<UnitTypeKey, string>> {
  const ids = {} as Record<UnitTypeKey, string>;

  for (const type of UNIT_TYPES) {
    const record = await prisma.unitType.upsert({
      where: { propertyId_name: { propertyId, name: type.name } },
      create: {
        propertyId,
        name: type.name,
        description: type.description,
        capacity: type.capacity,
        baseRate: type.baseRate,
      },
      update: { description: type.description, capacity: type.capacity, baseRate: type.baseRate },
      select: { id: true },
    });
    ids[type.key] = record.id;
  }

  return ids;
}

export async function seedUnits(
  prisma: PrismaClient,
  propertyId: string,
  unitTypeIds: Record<UnitTypeKey, string>,
): Promise<Foundation["units"]> {
  const rateByKey = Object.fromEntries(
    UNIT_TYPES.map((type) => [type.key, type.baseRate]),
  ) as Record<UnitTypeKey, string>;

  const units: Foundation["units"] = [];

  for (const floor of FLOOR_PLAN) {
    for (const room of floor.rooms) {
      const record = await prisma.unit.upsert({
        where: { propertyId_unitNumber: { propertyId, unitNumber: room.number } },
        create: {
          propertyId,
          unitTypeId: unitTypeIds[room.type],
          unitNumber: room.number,
          floor: floor.floor,
        },
        // Operational state is set later by the scenario, from real records.
        update: { unitTypeId: unitTypeIds[room.type], floor: floor.floor },
        select: { id: true },
      });

      units.push({
        id: record.id,
        unitNumber: room.number,
        floor: floor.floor,
        typeKey: room.type,
        baseRate: rateByKey[room.type],
      });
    }
  }

  return units;
}

export async function seedOutlets(
  prisma: PrismaClient,
  propertyId: string,
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};

  for (const outlet of OUTLETS) {
    const record = await prisma.outlet.upsert({
      where: { propertyId_name: { propertyId, name: outlet.name } },
      create: { propertyId, name: outlet.name, type: outlet.type, location: outlet.location },
      update: { type: outlet.type, location: outlet.location },
      select: { id: true },
    });
    ids[outlet.name] = record.id;
  }

  return ids;
}

export async function seedTeam(
  prisma: PrismaClient,
  propertyId: string,
): Promise<{ employeeIds: Record<EmployeeKey, string>; userIds: Record<string, string> }> {
  const employeeIds = {} as Record<EmployeeKey, string>;

  for (const employee of EMPLOYEES) {
    const existing = await prisma.employee.findFirst({
      where: { propertyId, name: employee.name },
      select: { id: true },
    });

    const record = existing
      ? await prisma.employee.update({
          where: { id: existing.id },
          data: {
            department: employee.department,
            position: employee.position,
            mobile: employee.mobile,
            employmentStatus: "ACTIVE",
          },
          select: { id: true },
        })
      : await prisma.employee.create({
          data: {
            propertyId,
            name: employee.name,
            department: employee.department,
            position: employee.position,
            mobile: employee.mobile,
          },
          select: { id: true },
        });

    employeeIds[employee.key] = record.id;
  }

  /*
   * Demo passwords come from the environment, and are only written when the account
   * is first created — re-seeding must never reset a password someone changed.
   */
  const password = process.env.DEMO_SEED_PASSWORD ?? process.env.SEED_PASSWORD ?? "Demo@1234";
  const passwordHash = await bcrypt.hash(password, 10);
  const userIds: Record<string, string> = {};

  for (const user of DEMO_USERS) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: user.roleKey },
      select: { id: true },
    });

    const record = await prisma.user.upsert({
      where: { email: user.email },
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        employeeId: user.employeeKey ? employeeIds[user.employeeKey] : null,
      },
      update: {
        name: user.name,
        employeeId: user.employeeKey ? employeeIds[user.employeeKey] : null,
      },
      select: { id: true },
    });

    await prisma.userRole.deleteMany({ where: { userId: record.id } });
    await prisma.userRole.create({ data: { userId: record.id, roleId: role.id } });

    userIds[user.roleKey] = record.id;
  }

  return { employeeIds, userIds };
}

/** Fictional, varied, and shaped like the real thing without being anyone's. */
function identityFor(random: Random, kind: "saudi" | "gcc" | "international") {
  if (kind === "saudi") {
    return {
      identificationType: "NATIONAL_ID" as const,
      identificationNumber: `1${random.int(100000000, 199999999)}`,
    };
  }
  if (kind === "gcc") {
    return {
      identificationType: "GCC_ID" as const,
      identificationNumber: `${random.int(200000000, 899999999)}`,
    };
  }
  return random.chance(0.6)
    ? {
        identificationType: "PASSPORT" as const,
        identificationNumber: `${random.pick(["A", "B", "C", "N", "P"])}${random.int(1000000, 9999999)}`,
      }
    : {
        identificationType: "IQAMA" as const,
        identificationNumber: `2${random.int(100000000, 199999999)}`,
      };
}

function mobileFor(random: Random): string {
  const prefix = random.pick(["050", "053", "054", "055", "056", "058", "059"]);
  return `${prefix}${String(random.int(1000000, 9999999)).padStart(7, "0")}`;
}

export async function seedGuests(
  prisma: PrismaClient,
  random: Random,
  count: number,
): Promise<string[]> {
  type Candidate = {
    fullName: string;
    nationality: string;
    gender: "MALE" | "FEMALE";
    kind: "saudi" | "gcc" | "international";
  };

  const candidates: Candidate[] = [
    ...SAUDI_MALE_NAMES.map((name) => ({
      fullName: name, nationality: "سعودي", gender: "MALE" as const, kind: "saudi" as const,
    })),
    ...SAUDI_FEMALE_NAMES.map((name) => ({
      fullName: name, nationality: "سعودي", gender: "FEMALE" as const, kind: "saudi" as const,
    })),
    ...GCC_NAMES.map((name) => ({
      fullName: name,
      nationality: GCC_NATIONALITIES[name.length % GCC_NATIONALITIES.length],
      gender: "MALE" as const,
      kind: "gcc" as const,
    })),
    ...INTERNATIONAL_NAMES.map((entry) => ({
      fullName: entry.name, nationality: entry.nationality,
      gender: "MALE" as const, kind: "international" as const,
    })),
  ];

  const chosen = random.shuffle(candidates).slice(0, count);
  const ids: string[] = [];

  for (const candidate of chosen) {
    const identity = identityFor(random, candidate.kind);

    const existing = await prisma.guest.findUnique({
      where: {
        identificationType_identificationNumber: {
          identificationType: identity.identificationType,
          identificationNumber: identity.identificationNumber,
        },
      },
      select: { id: true },
    });

    if (existing) {
      ids.push(existing.id);
      continue;
    }

    const guest = await prisma.guest.create({
      data: {
        fullName: candidate.fullName,
        nationality: candidate.nationality,
        gender: candidate.gender,
        mobile: mobileFor(random),
        email: random.chance(0.7)
          ? `guest${random.int(1000, 9999)}@example-demo.sa`
          : null,
        ...identity,
        dateOfBirth: new Date(
          Date.UTC(random.int(1965, 2003), random.int(0, 11), random.int(1, 28)),
        ),
        // Only a minority carry notes; a note on every profile is filler, not detail.
        notes: random.chance(0.3) ? random.pick(GUEST_NOTES) : null,
        preferences: random.chance(0.35) ? random.pick(GUEST_PREFERENCES) : null,
      },
      select: { id: true },
    });

    ids.push(guest.id);
  }

  return ids;
}
