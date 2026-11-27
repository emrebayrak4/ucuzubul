/**
 * Replaces the demo used / refurbished / open-box offers only.
 *   pnpm -C packages/database seed:conditions
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createPrismaClient } from "../../src/index";
import { seedConditionOffers } from "./catalog-conditions";

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
seedConditionOffers(prisma)
  .then((r) => console.log("Condition demo offers seeded", r))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
