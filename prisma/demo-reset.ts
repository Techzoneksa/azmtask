import "dotenv/config";

import { createSeedClient, describeTarget } from "./demo/client";
import { DemoResetBlocked, assertResetAllowed, resetDemoData } from "./demo/reset";

/**
 * Clears the demo hotel's operational data. Guarded: refuses to run in production
 * unless ALLOW_DEMO_RESET is set explicitly, and only ever touches rows belonging to
 * the marked demo property.
 */

async function main() {
  try {
    assertResetAllowed();
  } catch (error) {
    if (error instanceof DemoResetBlocked) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const prisma = createSeedClient();
  try {
    console.log(`Clearing demo data in ${describeTarget()}…`);
    await resetDemoData(prisma);
    console.log("Done. Run `npm run db:demo-seed` to rebuild the scenario.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Demo reset failed:", error);
  process.exitCode = 1;
});
