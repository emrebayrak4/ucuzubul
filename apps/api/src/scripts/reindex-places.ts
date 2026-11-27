/**
 * Rebuilds the Meilisearch places index (airports, cities, countries) — run after `pnpm -C packages/database geo:import`.
 *   pnpm -C apps/api exec tsx src/scripts/reindex-places.ts
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { Meilisearch } from "meilisearch";
import { createPrismaClient } from "@pricora/database";
import { reindexPlaces } from "../core/places";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const prisma = createPrismaClient();
const meili = new Meilisearch({ host: process.env["MEILI_HOST"] ?? "http://localhost:7700", apiKey: process.env["MEILI_MASTER_KEY"] || undefined });
reindexPlaces(prisma, meili)
  .then((n) => console.log(`Indexed ${n} places`))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
