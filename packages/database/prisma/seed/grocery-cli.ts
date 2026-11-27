/**
 * Grocery / household demo catalog, demo store locations, per-store inventory and demo local sellers.
 *   pnpm -C packages/database seed:grocery
 * Requires the base + catalog seed. Refuses NODE_ENV=production. Restart the API (or reindex) afterwards.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createPrismaClient } from "../../src/index";
import { seedGroceryLocal } from "./grocery-seed";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}
if (process.env["NODE_ENV"] === "production") {
  console.error("Refusing to run the demo grocery seed with NODE_ENV=production.");
  process.exit(1);
}

const prisma = createPrismaClient();
const t0 = Date.now();
seedGroceryLocal(prisma, { log: (m) => console.log(m) })
  .then((r) => console.log(`Grocery/local seed done in ${((Date.now() - t0) / 1000).toFixed(1)}s`, r))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
