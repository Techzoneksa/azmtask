import { afterEach, describe, expect, it } from "vitest";

import { diagnoseConnection } from "@/server/db-diagnose";

/**
 * Connection diagnosis.
 *
 * The pool reports every connection failure as a timeout, so this is the only path
 * that recovers what actually went wrong. Each branch is exercised against a real
 * server rather than a mock — a classifier that has never seen the error strings it
 * classifies is a classifier that will be wrong when it matters.
 */

const REAL = process.env.DATABASE_URL!;

afterEach(() => {
  process.env.DATABASE_URL = REAL;
});

async function diagnose(url: string | undefined) {
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
  return diagnoseConnection();
}

describe("diagnoseConnection", () => {
  it("confirms a working connection", async () => {
    const { diagnosis } = await diagnose(REAL);
    expect(diagnosis).toBe("connected");
  });

  it("identifies a rejected password", async () => {
    const { diagnosis } = await diagnose(
      REAL.replace(/:\/\/([^:]+):[^@]+@/, "://$1:definitely-not-the-password@"),
    );
    expect(diagnosis).toBe("wrong_password");
  });

  it("distinguishes a database the user was never granted", async () => {
    const { diagnosis } = await diagnose(REAL.replace(/\/[^/]+$/, "/database_that_is_not_granted"));
    // Not "wrong_password": the credentials were fine, the grant was not. Conflating
    // the two sends an operator to reset a password that was never wrong.
    expect(diagnosis).toBe("no_access_to_database");
  });

  it("identifies an unreachable host", async () => {
    const { diagnosis } = await diagnose(
      REAL.replace(/@[^:]+:/, "@host-that-does-not-resolve.invalid:"),
    );
    expect(diagnosis).toBe("host_unreachable");
  });

  it("reports a missing URL without attempting a connection", async () => {
    const { diagnosis } = await diagnose(undefined);
    expect(diagnosis).toBe("url_missing");
  });

  it("reports an unparseable URL", async () => {
    const { diagnosis } = await diagnose("this is not a url at all");
    expect(diagnosis).toBe("url_invalid");
  });

  it("never leaks the password in what it returns", async () => {
    const password = REAL.match(/:\/\/[^:]+:([^@]+)@/)?.[1];
    expect(password).toBeTruthy();

    for (const url of [REAL, REAL.replace(/:\/\/([^:]+):[^@]+@/, "://$1:wrong@")]) {
      const result = await diagnose(url);
      expect(JSON.stringify(result)).not.toContain(password);
    }
  });

  it("answers fast enough to sit on a request path", async () => {
    const started = Date.now();
    await diagnose(REAL.replace(/:\/\/([^:]+):[^@]+@/, "://$1:wrong@"));
    // The pool takes ten seconds to say nothing useful; this says something useful
    // in well under one.
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("outage classification", () => {
  it("reports a pool exhaustion as a service outage, not an internal fault", async () => {
    const { PrismaMariaDb } = await import("@prisma/adapter-mariadb");
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { toAppError } = await import("@/server/errors");

    const url = new URL(REAL);
    const broken = new PrismaClient({
      adapter: new PrismaMariaDb({
        host: url.hostname,
        port: url.port ? Number(url.port) : 3306,
        user: decodeURIComponent(url.username),
        password: "not-the-password",
        database: decodeURIComponent(url.pathname.slice(1)),
        connectionLimit: 2,
        connectTimeout: 2000,
        initializationTimeout: 2000,
        acquireTimeout: 3000,
        timezone: "Z",
      }),
    });

    try {
      await broken.user.count();
      throw new Error("the query should not have succeeded");
    } catch (error) {
      const appError = toAppError(error);

      /*
       * The distinction matters at the login screen: an outage must not be answered
       * with "try again", which reads as though the password were wrong.
       */
      expect(appError.code).toBe("UNAVAILABLE");
      expect(appError.status).toBe(503);
      expect(appError.message).toContain("قاعدة البيانات");
    } finally {
      await broken.$disconnect().catch(() => {});
    }
  }, 30_000);
});
