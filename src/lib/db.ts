import "server-only";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client singleton.
 *
 * Prisma 7 talks to MySQL through a driver adapter instead of a bundled native
 * engine binary — which suits shared Node hosting, where shipping and executing a
 * platform-specific binary is the usual source of deployment pain.
 *
 * Next's dev server re-evaluates modules on every hot reload; without the global
 * cache each reload would open a fresh connection pool until MySQL refuses new
 * connections. In production the module is evaluated once and the global is unused.
 *
 * `server-only` at the top makes importing this from a client component a build
 * error rather than a bundle that ships database code to the browser.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function poolConfigFromUrl(rawUrl: string) {
  const url = new URL(rawUrl);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    /*
     * Shared hosting plans cap concurrent MySQL connections, and a pool larger than
     * that cap fails under load — exactly when it matters. Five is comfortable for a
     * single property; raise it via DATABASE_POOL_SIZE on a bigger plan.
     */
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 5),

    /*
     * Fail fast, and fail with the reason.
     *
     * A pool's default behaviour when it cannot connect is to keep retrying until an
     * acquire timeout expires, then report "timed out waiting for a connection" —
     * which describes the pool's predicament, not the cause. Wrong password, unknown
     * database and unreachable host all arrive looking identical, ten seconds late,
     * on every request.
     *
     * A short connect timeout with a matching acquire timeout surfaces the driver's
     * own error instead, in about as long as the handshake takes. `npm run db:check`
     * exists for the same reason and bypasses the pool entirely.
     */
    connectTimeout: 5000,
    initializationTimeout: 5000,
    acquireTimeout: 6000,
    /* Keep MySQL's own wait_timeout from closing sockets the pool still believes in. */
    idleTimeout: 60,

    /*
     * Every instant in this system is stored and compared in UTC. Pinning the driver
     * to UTC keeps the connection's session timezone out of the equation, so a
     * server whose clock is set to Riyadh reads back the same values as one on UTC.
     */
    timezone: "Z",
  };
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL غير مضبوط — تعذّر الاتصال بقاعدة البيانات.");
  }

  return new PrismaClient({
    adapter: new PrismaMariaDb(poolConfigFromUrl(url)),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Either the shared client or an open transaction, so services compose either way. */
export type Db =
  | PrismaClient
  | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
