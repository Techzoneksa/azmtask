import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The database tests share one schema; running files in parallel would let one
    // file's truncate wipe another's fixtures mid-assertion.
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /*
       * `server-only` throws on import outside a React Server Component. That guard
       * is exactly what we want in the application; here it would block the tests
       * from importing the very modules they exist to verify, so it is stubbed. The
       * production guarantee is unaffected — Next still enforces it at build time.
       */
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
