import "dotenv/config";

/**
 * Test bootstrap.
 *
 * Points every test at the dedicated test database. Guarding on the database name
 * is not paranoia — a stray DATABASE_URL in the environment would otherwise let the
 * truncation helper run against a real schema.
 */

const TEST_DATABASE = "nokhba_test";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (!url.includes(TEST_DATABASE)) {
  throw new Error(
    `Tests must run against the \`${TEST_DATABASE}\` database. ` +
      `Set TEST_DATABASE_URL to a URL ending in /${TEST_DATABASE}.`,
  );
}

process.env.DATABASE_URL = url;
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET ?? "test-secret-value-at-least-32-characters-long";
