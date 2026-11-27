/**
 * Upserts city travel guides from packages/content/guides/*.md into travel_guides.
 * Admin-edited guides are skipped unless --force. Unchanged files (same hash) are skipped.
 *   pnpm -C packages/database guides:sync [--force] [--draft]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadGuides, type GuideFile } from "@pricora/content";
import { createPrismaClient, type PrismaClient } from "../src/index";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const force = process.argv.includes("--force");
const asDraft = process.argv.includes("--draft");

/** City link: exact city name in the guide's country (largest population) → metro/city code → the airport's served city. */
async function resolveCityId(prisma: PrismaClient, f: Pick<GuideFile["frontmatter"], "city" | "countryIso2" | "iataCityCode">): Promise<number | null> {
  // Name first: a guide's iataCityCode is its nearest airport code, which may belong to another city (Kyoto → OSA).
  const byName = await prisma.city.findFirst({
    where: { countryIso2: f.countryIso2, OR: [{ name: { equals: f.city, mode: "insensitive" } }, { asciiName: { equals: f.city, mode: "insensitive" } }] },
    orderBy: { population: "desc" },
    select: { geonameId: true },
  });
  if (byName) return byName.geonameId;
  if (f.iataCityCode) {
    const metro = await prisma.city.findFirst({ where: { iataCityCode: f.iataCityCode }, select: { geonameId: true } });
    if (metro) return metro.geonameId;
    const ap = await prisma.airport.findUnique({ where: { iata: f.iataCityCode }, select: { cityId: true, country: true } });
    if (ap?.cityId && ap.country === f.countryIso2) return ap.cityId;
  }
  return null;
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const { guides, errors } = loadGuides();
  for (const e of errors) console.warn(`✗ ${path.basename(e.file)}: ${e.message}`);
  const stats = { created: 0, updated: 0, unchanged: 0, skippedAdminEdited: 0, unlinked: 0, relinked: 0 };
  /** City links improve when the geo import changes (airport → served city); refresh only cityId, never content. */
  const relink = async (id: string, current: number | null, f: { city: string; countryIso2: string; iataCityCode: string | null }) => {
    const next = await resolveCityId(prisma, { city: f.city, countryIso2: f.countryIso2, iataCityCode: f.iataCityCode ?? undefined });
    if (next && next !== current) {
      await prisma.travelGuide.update({ where: { id }, data: { cityId: next } });
      stats.relinked++;
    }
  };
  for (const g of guides) {
    const f = g.frontmatter;
    const hash = createHash("sha256").update(readFileSync(g.file)).digest("hex");
    const existing = await prisma.travelGuide.findUnique({ where: { slug: f.slug } });
    if (existing?.adminEditedAt && !force) {
      stats.skippedAdminEdited++;
      await relink(existing.id, existing.cityId, existing);
      console.log(`- ${f.slug}: edited in admin — skipped (use --force to overwrite)`);
      continue;
    }
    if (existing && existing.sourceHash === hash && !force) {
      stats.unchanged++;
      await relink(existing.id, existing.cityId, existing);
      continue;
    }
    const cityId = await resolveCityId(prisma, f);
    if (!cityId) stats.unlinked++;
    const data = {
      cityId,
      city: f.city,
      country: f.country,
      countryIso2: f.countryIso2,
      iataCityCode: f.iataCityCode ?? null,
      title: f.title,
      description: f.description,
      bestTimeToVisit: f.bestTimeToVisit ?? null,
      neighborhoods: f.neighborhoods,
      tags: f.tags,
      lastReviewed: new Date(`${f.lastReviewed}T00:00:00Z`),
      bodyMarkdown: g.body,
      sourceHash: hash,
      ...(force ? { adminEditedAt: null } : {}),
    };
    if (existing) {
      await prisma.travelGuide.update({ where: { id: existing.id }, data });
      stats.updated++;
    } else {
      await prisma.travelGuide.create({ data: { ...data, slug: f.slug, status: asDraft ? "draft" : "published", publishedAt: asDraft ? null : new Date() } });
      stats.created++;
    }
    console.log(`✓ ${f.slug}${cityId ? ` → city ${cityId}` : " (no city match)"}`);
  }
  console.log(
    `\nguides: ${guides.length} files, ${errors.length} invalid — ${stats.created} created, ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats.skippedAdminEdited} skipped (admin-edited), ${stats.relinked} city links refreshed, ${stats.unlinked} without a city link`,
  );
  await prisma.$disconnect();
  if (errors.length) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
