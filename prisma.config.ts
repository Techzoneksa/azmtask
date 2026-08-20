import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * `prisma generate` runs during the production build, where DATABASE_URL may not be
 * present — generation only needs the schema. Commands that do touch the database
 * (migrate, studio, seed) fail loudly on their own if the URL is missing, which is
 * the behaviour we want.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    /*
     * `migrate dev` diffs the schema against a throwaway database. Pointing it at a
     * pre-created one means the migration user never needs CREATE DATABASE — which
     * shared hosts do not grant. `migrate deploy`, the command that runs in
     * production, does not use a shadow database at all.
     */
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? undefined,
  },
});
