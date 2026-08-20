import "dotenv/config";

import { createSeedClient, describeTarget } from "./demo/client";
import { validateDemo } from "./demo/validate";

/**
 * Runs the integrity validator and exits non-zero on any contradiction, so it can
 * gate a deployment rather than merely inform one.
 */

const prisma = createSeedClient();

async function main() {
  console.log(`Validating demo dataset in ${describeTarget()}\n`);

  const report = await validateDemo(prisma);

  for (const check of report.checks) {
    const status = check.failed === 0 ? "PASS" : "FAIL";
    console.log(
      `  ${status.padEnd(5)} ${check.name.padEnd(34)} ${check.passed} passed, ${check.failed} failed`,
    );
  }

  if (report.violations.length > 0) {
    console.log(`\n${report.violations.length} violation(s):\n`);
    for (const violation of report.violations.slice(0, 40)) {
      console.log(`  [${violation.check}] ${violation.detail}`);
    }
    if (report.violations.length > 40) {
      console.log(`  … and ${report.violations.length - 40} more`);
    }
  }

  console.log(`\n${report.ok ? "PASS — dataset reconciles" : "FAIL — dataset has contradictions"}`);
  if (!report.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Validation failed to run:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
