"use server";

import { revalidatePath } from "next/cache";

import { assertPermission } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { serializeError } from "@/server/errors";
import { getCurrentProperty } from "@/server/services/property.service";
import {
  blockUnit,
  createUnit,
  createUnitType,
  unblockUnit,
  updateUnit,
  updateUnitType,
} from "@/server/services/unit.service";

/**
 * Write endpoints for the units screen.
 *
 * Each one re-checks the permission and re-derives the property on the server. The
 * client sends what to change, never who it is or which property it may touch —
 * both of those are decided here, from the session.
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; code: string; fields?: Record<string, string> };

async function context(permission: Parameters<typeof assertPermission>[0]) {
  await assertPermission(permission);
  const session = await getSession();
  const property = await getCurrentProperty();

  if (!session || !property) {
    throw new Error("لا توجد جلسة أو منشأة نشطة.");
  }

  return {
    propertyId: property.id,
    actor: {
      id: session.id,
      name: session.name,
      email: session.email,
      roles: session.roleKeys,
    },
  };
}

/** Runs a write, converting any failure into a shape a form can render. */
async function attempt(work: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await work();
    // The list, the board and the dashboard all read this data.
    revalidatePath("/units");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return { ok: false, ...serializeError(error) };
  }
}

export async function createUnitAction(input: unknown): Promise<ActionResult> {
  return attempt(async () => {
    const { propertyId, actor } = await context("units.manage");
    return createUnit(propertyId, input as never, actor);
  });
}

export async function updateUnitAction(input: unknown): Promise<ActionResult> {
  return attempt(async () => {
    const { propertyId, actor } = await context("units.manage");
    return updateUnit(propertyId, input as never, actor);
  });
}

export async function blockUnitAction(input: unknown): Promise<ActionResult> {
  return attempt(async () => {
    // Withholding a room from sale is an operational decision, not a metadata edit.
    const { propertyId, actor } = await context("units.status.change");
    return blockUnit(propertyId, input as never, actor);
  });
}

export async function unblockUnitAction(unitId: string): Promise<ActionResult> {
  return attempt(async () => {
    const { propertyId, actor } = await context("units.status.change");
    return unblockUnit(propertyId, unitId, actor);
  });
}

export async function createUnitTypeAction(input: unknown): Promise<ActionResult> {
  return attempt(async () => {
    const { propertyId, actor } = await context("units.manage");
    return createUnitType(propertyId, input as never, actor);
  });
}

export async function updateUnitTypeAction(input: unknown): Promise<ActionResult> {
  return attempt(async () => {
    const { propertyId, actor } = await context("units.manage");
    return updateUnitType(propertyId, input as never, actor);
  });
}
