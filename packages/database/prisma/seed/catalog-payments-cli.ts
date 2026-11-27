/**
 * Upserts researched pay-over-time options only (no catalog changes).
 *   pnpm -C packages/database seed:payments
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createPrismaClient } from "../../src/index";
import { seedPaymentOptions } from "./catalog-payment-options";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}
if (process.env["NODE_ENV"] === "production") {
  console.error("Refusing to run with NODE_ENV=production.");
  process.exit(1);
}
const prisma = createPrismaClient();
seedPaymentOptions(prisma)
  .then((r) => console.log("Payment options seeded", r))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
