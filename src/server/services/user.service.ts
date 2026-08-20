import "server-only";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { AppError, withDbErrors } from "@/server/errors";
import { EmailSchema, IdSchema, fieldErrors } from "@/server/validation";

import { recordActivity, type ActivityActor } from "./activity.service";

/**
 * Users and credential verification.
 *
 * `server-only` is load-bearing here: it turns an accidental import from a client
 * component into a build error instead of a bundle that ships bcrypt and a password
 * hash to the browser.
 *
 * Permissions are always resolved from the database, never read from a session
 * token. That is what lets an administrator change what a role grants and have it
 * take effect on the next request, rather than whenever old sessions happen to
 * expire.
 */

/** Cost 10: roughly 60ms per verification — slow enough to matter, fast enough to log in. */
const BCRYPT_ROUNDS = 10;

/**
 * A bcrypt hash of a value nothing will ever submit. Used to spend the same time on
 * an unknown email as on a real one, so response timing does not reveal which
 * accounts exist.
 */
const TIMING_DECOY_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  employeeId: string | null;
  propertyId: string | null;
  roleKeys: string[];
  roleNames: string[];
  permissions: string[];
};

/** Shape returned by every user lookup that feeds a session. */
const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  passwordHash: true,
  employeeId: true,
  employee: { select: { propertyId: true } },
  roles: {
    select: {
      role: {
        select: {
          key: true,
          name: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  },
} as const;

type RawAuthUser = {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  passwordHash: string;
  employeeId: string | null;
  employee: { propertyId: string } | null;
  roles: Array<{
    role: {
      key: string;
      name: string;
      permissions: Array<{ permission: { key: string } }>;
    };
  }>;
};

function toAuthenticatedUser(user: RawAuthUser): AuthenticatedUser {
  // A user may hold several roles; the effective permission set is their union.
  const permissions = new Set<string>();
  for (const link of user.roles) {
    for (const grant of link.role.permissions) {
      permissions.add(grant.permission.key);
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    employeeId: user.employeeId,
    propertyId: user.employee?.propertyId ?? null,
    roleKeys: user.roles.map((link) => link.role.key),
    roleNames: user.roles.map((link) => link.role.name),
    permissions: [...permissions].sort(),
  };
}

/**
 * Loads a user with roles and permissions resolved. One query with explicit
 * selects — no N+1, and no columns the caller does not need.
 */
export async function getAuthenticatedUser(
  userId: string,
): Promise<AuthenticatedUser | null> {
  const user = (await prisma.user.findUnique({
    where: { id: userId },
    select: AUTH_USER_SELECT,
  })) as RawAuthUser | null;

  if (!user || user.status !== UserStatus.ACTIVE) return null;
  return toAuthenticatedUser(user);
}

export type CredentialResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; reason: "invalid" | "inactive" };

/**
 * Verifies an email and password pair.
 *
 * An unknown email still runs a full bcrypt comparison against the decoy hash. Skip
 * that and the endpoint answers noticeably faster for addresses that do not exist,
 * which is a free account-enumeration oracle. The caller returns one message for
 * every failure regardless of the reason.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<CredentialResult> {
  const normalized = email.trim().toLowerCase();

  const user = (await prisma.user.findUnique({
    where: { email: normalized },
    select: AUTH_USER_SELECT,
  })) as RawAuthUser | null;

  if (!user) {
    await bcrypt.compare(password, TIMING_DECOY_HASH);
    return { ok: false, reason: "invalid" };
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) return { ok: false, reason: "invalid" };
  if (user.status !== UserStatus.ACTIVE) return { ok: false, reason: "inactive" };

  return { ok: true, user: toAuthenticatedUser(user) };
}

/** Records a successful sign-in. Failure here must not fail the login itself. */
export async function touchLastLogin(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  } catch (error) {
    console.error("[user] failed to update lastLoginAt", error);
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export const CreateUserSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب").max(160),
  email: EmailSchema,
  password: z
    .string()
    .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    .max(72, "كلمة المرور أطول من الحد الذي يدعمه التشفير"),
  employeeId: IdSchema.optional(),
  roleKeys: z.array(z.string().trim().min(1)).min(1, "يجب تحديد دور واحد على الأقل"),
});

export type CreateUserInput = z.input<typeof CreateUserSchema>;

export async function createUser(
  rawInput: CreateUserInput,
  actor: ActivityActor,
) {
  const parsed = CreateUserSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "بيانات المستخدم غير صالحة.", {
      fields: fieldErrors(parsed.error),
    });
  }
  const input = parsed.data;

  return withDbErrors("user.create", () =>
    prisma.$transaction(async (tx) => {
      const roles = await tx.role.findMany({
        where: { key: { in: input.roleKeys } },
        select: { id: true, key: true },
      });

      if (roles.length !== input.roleKeys.length) {
        throw new AppError("VALIDATION", "أحد الأدوار المحددة غير موجود.", {
          fields: { roleKeys: "دور غير معروف" },
        });
      }

      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          employeeId: input.employeeId ?? null,
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        select: { id: true, name: true, email: true, status: true },
      });

      await recordActivity(
        {
          actor,
          module: "users",
          action: "create",
          entityType: "User",
          entityId: user.id,
          description: `إنشاء مستخدم جديد (${user.email})`,
          // The password is deliberately absent — audit metadata never carries secrets.
          metadata: { roles: roles.map((role) => role.key) },
        },
        tx,
      );

      return user;
    }),
  );
}

/** Replaces a user's roles wholesale. Takes effect on their very next request. */
export async function setUserRoles(
  userId: string,
  roleKeys: string[],
  actor: ActivityActor,
) {
  return withDbErrors("user.setRoles", () =>
    prisma.$transaction(async (tx) => {
      const roles = await tx.role.findMany({
        where: { key: { in: roleKeys } },
        select: { id: true, key: true },
      });

      if (roles.length !== roleKeys.length) {
        throw new AppError("VALIDATION", "أحد الأدوار المحددة غير موجود.");
      }

      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId, roleId: role.id })),
      });

      await recordActivity(
        {
          actor,
          module: "users",
          action: "set_roles",
          entityType: "User",
          entityId: userId,
          description: `تعديل أدوار المستخدم إلى: ${roles.map((r) => r.key).join(", ")}`,
          metadata: { roles: roles.map((role) => role.key) },
        },
        tx,
      );

      return { userId, roleKeys: roles.map((role) => role.key) };
    }),
  );
}

/** Replaces the permissions a role grants. */
export async function setRolePermissions(
  roleKey: string,
  permissionKeys: string[],
  actor: ActivityActor,
) {
  return withDbErrors("role.setPermissions", () =>
    prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { key: roleKey },
        select: { id: true, key: true, name: true },
      });
      if (!role) throw new AppError("NOT_FOUND", "الدور غير موجود.");

      const permissions = await tx.permission.findMany({
        where: { key: { in: permissionKeys } },
        select: { id: true, key: true },
      });

      if (permissions.length !== permissionKeys.length) {
        const known = new Set(permissions.map((p) => p.key));
        const unknown = permissionKeys.filter((key) => !known.has(key));
        throw new AppError(
          "VALIDATION",
          `صلاحيات غير معروفة: ${unknown.join(", ")}`,
        );
      }

      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });

      await recordActivity(
        {
          actor,
          module: "users",
          action: "set_role_permissions",
          entityType: "Role",
          entityId: role.id,
          description: `تعديل صلاحيات الدور ${role.name} (${permissions.length} صلاحية)`,
        },
        tx,
      );

      return { roleKey: role.key, permissionCount: permissions.length };
    }),
  );
}

export async function listUsers() {
  return withDbErrors("user.list", () =>
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        lastLoginAt: true,
        employee: { select: { id: true, name: true, department: true } },
        roles: { select: { role: { select: { key: true, name: true } } } },
      },
    }),
  );
}

/**
 * Accounts advertised on the login screen during a demo.
 *
 * Identity only — no hash, no password, nothing that would be unsafe if the page
 * were public. The caller decides whether to show it at all; this function has no
 * opinion beyond returning one representative account per role.
 */
export async function listDemoAccounts(): Promise<
  Array<{ email: string; roleName: string; roleDescription: string }>
> {
  const users = await prisma.user.findMany({
    where: { status: UserStatus.ACTIVE },
    orderBy: { createdAt: "asc" },
    select: {
      email: true,
      roles: {
        select: { role: { select: { name: true, description: true } } },
      },
    },
  });

  const seen = new Set<string>();
  const accounts: Array<{ email: string; roleName: string; roleDescription: string }> = [];

  for (const user of users) {
    const role = user.roles[0]?.role;
    if (!role || seen.has(role.name)) continue;
    seen.add(role.name);
    accounts.push({
      email: user.email,
      roleName: role.name,
      roleDescription: role.description,
    });
  }

  return accounts;
}
