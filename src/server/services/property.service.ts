import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";

/**
 * The property the application is currently operating.
 *
 * A single-property deployment for now, so this is the first active one. It is
 * cached per request because the shell, the page header and the page body all want
 * the same name and none of them should cost a separate query.
 *
 * A failure here must not take the whole shell down — the sidebar falls back to the
 * product name, which is honest rather than wrong.
 */
export const getCurrentProperty = cache(
  async (): Promise<{ id: string; name: string; city: string } | null> => {
    try {
      return await prisma.property.findFirst({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, city: true },
        orderBy: { createdAt: "asc" },
      });
    } catch (error) {
      console.error("[property] could not load the current property", error);
      return null;
    }
  },
);

/** Display name for the shell and page titles. */
export async function getPropertyName(): Promise<string> {
  return (await getCurrentProperty())?.name ?? "نظام إدارة الفنادق";
}

/**
 * The properties the current user's data may be drawn from.
 *
 * One entry today, because the deployment runs one property. It exists as a list, and
 * every scoped query takes a list, so adding a second property is a change to this
 * function rather than an audit of every query written before it. A caller with no
 * accessible property gets an empty list, which scopes queries to nothing — the
 * fail-closed direction.
 */
export const getAccessiblePropertyIds = cache(async (): Promise<string[]> => {
  const property = await getCurrentProperty();
  return property ? [property.id] : [];
});
