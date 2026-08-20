import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../src/generated/prisma/client";

/**
 * A Prisma client for the seed and demo scripts.
 *
 * Separate from the application's singleton in src/lib/db.ts, which is marked
 * `server-only` and therefore cannot be imported by a plain Node script.
 */
export function createSeedClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL غير مضبوط — تعذّر الاتصال بقاعدة البيانات.");

  const parsed = new URL(url);
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      timezone: "Z",
    }),
  });
}

/** Reports which database a script is about to touch, without printing credentials. */
export function describeTarget(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}/${parsed.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unknown)";
  }
}
