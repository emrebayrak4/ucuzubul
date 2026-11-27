/**
 * Runs the shopping catalog expansion against the current DATABASE_URL without wiping anything.
 *   pnpm -C packages/database seed:catalog
 * Requires the base seed (retailers) to exist. Refuses NODE_ENV=production.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createPrismaClient } from "../../src/index";
import { seedCatalogExpansion } from "./catalog-seed";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}
if (process.env["NODE_ENV"] === "production") {
  console.error("Refusing to run the demo catalog seed with NODE_ENV=production.");
  process.exit(1);
}

const prisma = createPrismaClient();
const t0 = Date.now();
seedCatalogExpansion(prisma, { log: (m) => console.log(m) })
  .then((r) => {
    console.log(`Catalog expansion done in ${((Date.now() - t0) / 1000).toFixed(1)}s`, r);
    console.log("Reindex search: pnpm -C apps/api exec tsx src/scripts/reindex-search.ts (or restart the API).");
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
