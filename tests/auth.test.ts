import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { signSession, verifySessionToken } from "@/lib/auth/token";
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
} from "@/lib/permissions";
import {
  getAuthenticatedUser,
  hashPassword,
  setRolePermissions,
  setUserRoles,
  verifyCredentials,
} from "@/server/services/user.service";

import { TEST_ACTOR, resetDatabase } from "./helpers";

/**
 * Database-backed authentication and authorization.
 *
 * The Stage 1 permission matrix is re-run here against roles that now live in
 * tables rather than in a TypeScript constant. The move must not have changed what
 * any role can do — and the last test proves the thing the migration bought us:
 * revoking a permission takes effect immediately, without waiting for sessions to
 * expire.
 */

const PASSWORD = "Demo@1234";

async function seedAuth() {
  for (const key of PERMISSIONS) {
    await prisma.permission.create({
      data: { key, module: key.split(".")[0], description: key },
    });
  }

  for (const roleKey of ROLES) {
    const role = await prisma.role.create({
      data: { key: roleKey, name: roleKey, description: roleKey, isSystem: true },
    });
    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...ROLE_PERMISSIONS[roleKey]] } },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }

  const passwordHash = await hashPassword(PASSWORD);
  for (const roleKey of ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await prisma.user.create({
      data: { name: roleKey, email: `${roleKey}@nokhba-hotel.sa`, passwordHash },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
}

beforeEach(async () => {
  await resetDatabase();
  await seedAuth();
});

describe("credentials", () => {
  it("accepts a correct email and password", async () => {
    const result = await verifyCredentials("admin@nokhba-hotel.sa", PASSWORD);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("admin@nokhba-hotel.sa");
      expect(result.user.roleKeys).toEqual(["admin"]);
    }
  });

  it("rejects a wrong password", async () => {
    const result = await verifyCredentials("admin@nokhba-hotel.sa", "wrong-password");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("returns the same failure for an unknown email as for a wrong password", async () => {
    const unknown = await verifyCredentials("ghost@nokhba-hotel.sa", PASSWORD);
    const wrong = await verifyCredentials("admin@nokhba-hotel.sa", "nope");
    expect(unknown).toEqual(wrong);
  });

  it("spends comparable time on an unknown email, giving no enumeration oracle", async () => {
    const time = async (email: string) => {
      const started = performance.now();
      await verifyCredentials(email, PASSWORD);
      return performance.now() - started;
    };

    const known = await time("admin@nokhba-hotel.sa");
    const unknown = await time("ghost@nokhba-hotel.sa");

    // Both run a full bcrypt comparison; neither should be an order of magnitude faster.
    expect(unknown).toBeGreaterThan(known / 5);
  });

  it("rejects a disabled account", async () => {
    await prisma.user.update({
      where: { email: "reception@nokhba-hotel.sa" },
      data: { status: "DISABLED" },
    });

    const result = await verifyCredentials("reception@nokhba-hotel.sa", PASSWORD);
    expect(result).toEqual({ ok: false, reason: "inactive" });
  });

  it("never stores the password in plaintext", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@nokhba-hotel.sa" },
      select: { passwordHash: true },
    });

    expect(user.passwordHash).not.toBe(PASSWORD);
    expect(user.passwordHash.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare(PASSWORD, user.passwordHash)).toBe(true);
  });
});

describe("session tokens", () => {
  it("round-trips an identity", async () => {
    const token = await signSession({
      userId: "usr123",
      name: "مستخدم",
      email: "user@nokhba-hotel.sa",
    });
    const identity = await verifySessionToken(token);

    expect(identity?.userId).toBe("usr123");
    expect(identity?.email).toBe("user@nokhba-hotel.sa");
  });

  it("carries no permissions — authorization is not the token's job", async () => {
    const token = await signSession({
      userId: "usr123",
      name: "مستخدم",
      email: "user@nokhba-hotel.sa",
    });

    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );

    expect(payload).not.toHaveProperty("permissions");
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("roles");
  });

  it("rejects a tampered token", async () => {
    const token = await signSession({
      userId: "usr123",
      name: "مستخدم",
      email: "user@nokhba-hotel.sa",
    });
    const [header, payload] = token.split(".");
    expect(await verifySessionToken(`${header}.${payload}.forged`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    // Forged with jose directly rather than by swapping the env var: the module
    // caches its key on first use, so mutating the variable would prove nothing.
    const foreignKey = new TextEncoder().encode(
      "an-entirely-different-secret-value-32-chars",
    );
    const forged = await new SignJWT({ name: "مهاجم", email: "attacker@evil.test" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("usr123")
      .setIssuer("nokhba-pms")
      .setAudience("nokhba-pms-web")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(foreignKey);

    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { SignJWT: Signer } = await import("jose");
    const key = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const expired = await new Signer({ name: "منتهٍ", email: "old@nokhba-hotel.sa" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("usr123")
      .setIssuer("nokhba-pms")
      .setAudience("nokhba-pms-web")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(key);

    expect(await verifySessionToken(expired)).toBeNull();
  });
});

describe("permission resolution", () => {
  it("reproduces the Stage 1 matrix exactly, now from database rows", async () => {
    for (const roleKey of ROLES) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${roleKey}@nokhba-hotel.sa` },
        select: { id: true },
      });

      const resolved = await getAuthenticatedUser(user.id);
      const expected = [...ROLE_PERMISSIONS[roleKey]].sort();

      expect(resolved?.permissions).toEqual(expected);
    }
  });

  it("grants the administrator every permission in the catalogue", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@nokhba-hotel.sa" },
      select: { id: true },
    });
    const resolved = await getAuthenticatedUser(user.id);
    expect(resolved?.permissions).toHaveLength(PERMISSIONS.length);
  });

  it("withholds from reception exactly what Stage 1 withheld", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "reception@nokhba-hotel.sa" },
      select: { id: true },
    });
    const resolved = await getAuthenticatedUser(user.id);

    expect(resolved?.permissions).toContain("reservations.checkin");
    expect(resolved?.permissions).not.toContain("users.manage");
    expect(resolved?.permissions).not.toContain("settings.view");
    expect(resolved?.permissions).not.toContain("expenses.view");
  });

  it("returns the union when a user holds several roles", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "housekeeping@nokhba-hotel.sa" },
      select: { id: true },
    });

    await setUserRoles(user.id, ["housekeeping", "accountant"], TEST_ACTOR);

    const resolved = await getAuthenticatedUser(user.id);
    expect(resolved?.permissions).toContain("housekeeping.complete");
    expect(resolved?.permissions).toContain("payments.view");
  });

  it("returns nothing for a disabled user", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@nokhba-hotel.sa" },
      select: { id: true },
    });
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });

    expect(await getAuthenticatedUser(user.id)).toBeNull();
  });

  it("reflects a permission change immediately, with no stale token claim", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "reception@nokhba-hotel.sa" },
      select: { id: true },
    });

    // Their session token was already issued and is still perfectly valid.
    const token = await signSession({
      userId: user.id,
      name: "reception",
      email: "reception@nokhba-hotel.sa",
    });
    expect(await verifySessionToken(token)).not.toBeNull();

    const before = await getAuthenticatedUser(user.id);
    expect(before?.permissions).toContain("payments.create");

    await setRolePermissions("reception", ["dashboard.view", "reservations.view"], TEST_ACTOR);

    const after = await getAuthenticatedUser(user.id);
    expect(after?.permissions).toEqual(["dashboard.view", "reservations.view"]);
    expect(after?.permissions).not.toContain("payments.create");
  });

  it("refuses to grant a permission that does not exist", async () => {
    await expect(
      setRolePermissions("reception", ["dashboard.view", "not.a.real.permission"], TEST_ACTOR),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("logs a permission change without leaking any secret", async () => {
    await setRolePermissions("reception", ["dashboard.view"], TEST_ACTOR);

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { action: "set_role_permissions" },
      select: { description: true, metadata: true },
    });

    const serialized = JSON.stringify(log);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized.toLowerCase()).not.toContain("passwordhash");
  });
});
