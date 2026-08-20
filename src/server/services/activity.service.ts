import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/lib/db";
import { prisma } from "@/lib/db";
import { withDbErrors } from "@/server/errors";

/**
 * Activity log.
 *
 * Two rules shape this module.
 *
 * First, an audit entry must stay readable forever. It therefore stores the acting
 * user's name, email and roles as they were at the time, rather than joining to the
 * users table at read time — an audit trail that changes when someone is renamed or
 * removed is not an audit trail.
 *
 * Second, logging must never take down the operation it describes. Writes go inside
 * the caller's transaction when one is supplied, so a rolled-back check-in leaves no
 * phantom entry; outside a transaction, a failure is logged and swallowed rather
 * than turned into a failed check-in.
 */

export type ActivityActor = {
  id: string | null;
  name: string;
  email: string;
  roles: string[];
};

export type ActivityInput = {
  actor: ActivityActor;
  propertyId?: string | null;
  module: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  /** Small JSON payload of what changed. Never credentials, tokens or hashes. */
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

/** Keys that must never reach the log, whatever a caller passes. */
const REDACTED_KEYS = [
  "password",
  "passwordhash",
  "newpassword",
  "currentpassword",
  "token",
  "secret",
  "authsecret",
  "sessiontoken",
  "apikey",
  "authorization",
  "cookie",
];

function sanitize(
  metadata: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;

  // Built as a mutable record, then handed over as Prisma's readonly JSON value.
  const safe: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (REDACTED_KEYS.includes(key.toLowerCase().replace(/[^a-z]/g, ""))) {
      continue;
    }
    safe[key] = value as Prisma.InputJsonValue;
  }
  return Object.keys(safe).length > 0 ? (safe as Prisma.InputJsonValue) : undefined;
}

/** Writes an entry. Pass `tx` to bind it to the transaction it describes. */
export async function recordActivity(
  input: ActivityInput,
  tx?: Db,
): Promise<void> {
  const data = {
    propertyId: input.propertyId ?? null,
    userId: input.actor.id,
    userName: input.actor.name,
    userEmail: input.actor.email,
    userRoles: input.actor.roles.join(","),
    module: input.module,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    description: input.description.slice(0, 500),
    metadata: sanitize(input.metadata) ?? undefined,
    ipAddress: input.ipAddress ?? null,
  };

  if (tx) {
    // Inside a transaction the caller owns the outcome: if the log write fails the
    // whole operation must fail, because a silent gap in the audit trail is worse
    // than a failed request the user can retry.
    await tx.activityLog.create({ data });
    return;
  }

  try {
    await prisma.activityLog.create({ data });
  } catch (error) {
    console.error("[activity] failed to record entry", {
      module: input.module,
      action: input.action,
      error,
    });
  }
}

export type ActivityQuery = {
  propertyId?: string;
  userId?: string;
  module?: string;
  entityType?: string;
  entityId?: string;
  skip?: number;
  take?: number;
};

/** Newest first, with only the columns a log screen renders. */
export async function listActivity(query: ActivityQuery = {}) {
  return withDbErrors("activity.list", async () => {
    const where = {
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.module ? { module: query.module } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip ?? 0,
        take: query.take ?? 25,
        select: {
          id: true,
          createdAt: true,
          userName: true,
          userRoles: true,
          module: true,
          action: true,
          entityType: true,
          entityId: true,
          description: true,
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return { items, total };
  });
}
