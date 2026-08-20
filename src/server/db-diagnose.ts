import "server-only";

import mariadb, { type Connection } from "mariadb";

/**
 * Why the database refused us.
 *
 * Prisma's pool reports every connection failure as "timed out waiting for a
 * connection" — a description of the pool's predicament, not the cause. Wrong
 * password, unknown database and unreachable host all arrive looking identical, so
 * the server log tells an operator nothing they can act on.
 *
 * This opens one direct connection to recover the server's own error code, and
 * returns a short category. It is written to the log only. The HTTP response stays
 * deliberately vague: a public endpoint that explains why a database refused it is
 * describing your infrastructure to strangers.
 */

export type ConnectionDiagnosis =
  | "wrong_password"
  | "no_access_to_database"
  | "unknown_database"
  | "host_unreachable"
  | "too_many_connections"
  | "url_missing"
  | "url_invalid"
  | "connected"
  | "unknown";

/** Operator-facing English, for the server log. Never sent to a browser. */
const EXPLANATION: Record<ConnectionDiagnosis, string> = {
  wrong_password: "the server rejected the credentials (check the password, and that it is URL-encoded)",
  no_access_to_database: "signed in, but this user has no rights on that database — assign the user to it in the hosting panel",
  unknown_database: "no database by that name",
  host_unreachable: "could not reach the database host",
  too_many_connections: "the server refused more connections — lower DATABASE_POOL_SIZE",
  url_missing: "DATABASE_URL is not set",
  url_invalid: "DATABASE_URL could not be parsed — an unencoded character in the password truncates it",
  connected: "a direct connection succeeded; the pool failure was transient",
  unknown: "unrecognised failure",
};

export async function diagnoseConnection(): Promise<{
  diagnosis: ConnectionDiagnosis;
  detail: string;
}> {
  const raw = process.env.DATABASE_URL;
  if (!raw) return { diagnosis: "url_missing", detail: EXPLANATION.url_missing };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { diagnosis: "url_invalid", detail: EXPLANATION.url_invalid };
  }

  let connection: Connection | undefined;

  try {
    connection = await mariadb.createConnection({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      connectTimeout: 5000,
    });

    return { diagnosis: "connected", detail: EXPLANATION.connected };
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    const message = error instanceof Error ? error.message : String(error);
    const combined = `${code} ${message}`;

    // 1044 and 1045 read alike and are fixed differently: 1045 is the password,
    // 1044 is a user who was never granted the database.
    const diagnosis: ConnectionDiagnosis = /ER_DBACCESS_DENIED|no: 1044/i.test(combined)
      ? "no_access_to_database"
      : /ER_ACCESS_DENIED|no: 1045/i.test(combined)
        ? "wrong_password"
        : /ER_BAD_DB|Unknown database/i.test(combined)
          ? "unknown_database"
          : /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|getaddrinfo/i.test(combined)
            ? "host_unreachable"
            : /ER_CON_COUNT_ERROR|too many connections/i.test(combined)
              ? "too_many_connections"
              : "unknown";

    return {
      diagnosis,
      detail: `${EXPLANATION[diagnosis]} [${code || "no code"}]`,
    };
  } finally {
    // Never leave a socket open on a diagnostic path.
    await connection?.end().catch(() => {});
  }
}

/**
 * Logs the real cause once, at the point a pool failure was observed. Returns
 * nothing: callers must not put any of this in a response body.
 */
export async function logConnectionDiagnosis(context: string): Promise<void> {
  try {
    const { diagnosis, detail } = await diagnoseConnection();
    console.error(`[${context}] database diagnosis: ${diagnosis} — ${detail}`);
    console.error(`[${context}] run \`npm run db:check\` on the server for the full report`);
  } catch (error) {
    console.error(`[${context}] diagnosis itself failed`, error);
  }
}
