import "server-only";

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { prisma } from "@/lib/db";

/**
 * Whether the database has run every migration the code expects.
 *
 * This exists because of a failure that has now happened twice on a live deployment:
 * the application ships, the migrations do not, and every screen touching a new table
 * fails with a generic error. Nothing on screen says why. The operator checks the
 * connection, the credentials and the host — all fine — while the actual cause is a
 * single command that was never run.
 *
 * A thrown error cannot explain it: Next strips server error messages before they
 * reach the browser, so the error boundary can only ever show something generic. So
 * the check happens up front instead, and the shell states the cause plainly.
 *
 * **Cost.** Once a process has *successfully seen* every migration applied, it never
 * asks again — migrations are not un-applied under a running server. A healthy
 * deployment pays one query per process, ever. A deployment that is behind re-checks
 * at most once a minute, so the banner clears shortly after someone fixes it without a
 * restart. A read that fails caches nothing, so the next request tries again.
 */

type SchemaState = { pending: string[]; checkedAt: number };

let cached: SchemaState | null = null;

/** How long a "behind" answer is trusted before asking again. */
const RECHECK_MS = 60_000;

export async function getPendingMigrations(): Promise<string[]> {
  if (cached && (cached.pending.length === 0 || Date.now() - cached.checkedAt < RECHECK_MS)) {
    return cached.pending;
  }

  try {
    const [applied, onDisk] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        "SELECT `migration_name` FROM `_prisma_migrations` WHERE `finished_at` IS NOT NULL",
      ),
      readdir(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true }),
    ]);

    const done = new Set(applied.map((row) => row.migration_name));
    const pending = onDisk
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !done.has(name))
      .sort();

    cached = { pending, checkedAt: Date.now() };
    return pending;
  } catch (error) {
    /*
     * The migration table is unreadable, which means either the database is down or
     * it was never initialised. Both have their own visible symptoms already, and
     * guessing between them here would put a wrong explanation on every screen.
     *
     * Nothing is cached on this path, and that is the whole point. Recording the
     * failure as "no pending migrations" poisoned the cache permanently — the healthy
     * answer is never re-checked, by design — so one unreadable read at boot silenced
     * the banner for the life of the process. That is exactly when it happens: the
     * first request after a restart can easily land before the database is reachable,
     * and the deployment that most needs the warning is the one that never sees it.
     */
    console.error("[schema] could not read the migration state", error);
    return [];
  }
}
