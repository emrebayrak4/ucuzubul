/**
 * Rebuilds the Meilisearch products index from the database (after a catalog seed).
 *   pnpm -C apps/api exec tsx src/scripts/reindex-search.ts
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { Meilisearch } from "meilisearch";
import { createPrismaClient } from "@pricora/database";
import { reindexProducts } from "../core/search-index";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const prisma = createPrismaClient();
const meili = new Meilisearch({ host: process.env["MEILI_HOST"] ?? "http://localhost:7700", apiKey: process.env["MEILI_MASTER_KEY"] || undefined });
reindexProducts(prisma, meili)
  .then((n) => console.log(`Indexed ${n} products`))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
