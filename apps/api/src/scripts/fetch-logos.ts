/**
 * One-off: fetch each retailer's / brand's OWN published icon from its official domain and store it.
 *   pnpm -C apps/api logos:fetch            # only rows without a logo
 *   pnpm -C apps/api logos:fetch --force    # refetch official_site / logo_provider logos too
 * Never overwrites admin uploads. Optional fallback: logo.dev when LOGO_DEV_TOKEN is configured (admin integrations).
 * Logos are trademarks of their owners, used nominatively to identify the store/brand.
 */
import { BRAND_SITES, disconnectPrisma, getPrisma } from "@pricora/database";
import { loadEnv } from "../common/env";
import { parseKey } from "../core/crypto";
import { IntegrationConfig } from "../core/integration-config";
import { baseDomain, fetchOfficialIcon, fetchProviderLogo, saveLogo, type LogoOwner } from "../core/logos";
import { defaultStorageDir, LocalDiskStorage } from "../core/storage";

const force = process.argv.includes("--force");

async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = getPrisma();
  const storage = new LocalDiskStorage(env.STORAGE_DIR ?? defaultStorageDir(), `${env.API_URL.replace(/\/+$/, "")}/static`);
  const integrations = new IntegrationConfig(prisma, parseKey(env.CREDENTIALS_ENCRYPTION_KEY));
  const logoDevToken = await integrations.get("LOGO_DEV_TOKEN");

  // Backfill brand websites we are confident about.
  for (const [name, site] of Object.entries(BRAND_SITES)) {
    await prisma.brand.updateMany({ where: { name, website: null }, data: { website: site } });
  }

  const retailers = await prisma.retailer.findMany({ orderBy: { slug: "asc" } });
  const brands = await prisma.brand.findMany({ orderBy: { slug: "asc" } });
  const jobs: { owner: LogoOwner; id: string; slug: string; site: string | null; logoSource: string | null; logoUrl: string | null }[] = [
    ...retailers.map((r) => ({ owner: "retailer" as const, id: r.id, slug: r.slug, site: r.websiteUrl, logoSource: r.logoSource, logoUrl: r.logoUrl })),
    ...brands.map((b) => ({ owner: "brand" as const, id: b.id, slug: b.slug, site: b.website, logoSource: b.logoSource, logoUrl: b.logoUrl })),
  ];

  const results = { official: 0, provider: 0, skipped: 0, failed: 0 };
  const failures: string[] = [];
  for (const j of jobs) {
    const label = `${j.owner}:${j.slug}`;
    if (!j.site || /\.example(\/|$)/.test(j.site)) {
      results.skipped++;
      console.log(`- ${label}: skipped (no official site)`);
      continue;
    }
    if (j.logoSource === "admin_upload" || (j.logoUrl && !force)) {
      results.skipped++;
      console.log(`- ${label}: skipped (${j.logoSource === "admin_upload" ? "admin upload" : "already has a logo"})`);
      continue;
    }
    const r = await fetchOfficialIcon(j.site);
    if (r.logo) {
      const saved = await saveLogo(prisma, storage, j.owner, j.id, r.logo, "official_site");
      results.official++;
      console.log(`✓ ${label}: ${r.logo.type} ${r.logo.body.length} B from ${r.from} → ${saved.logoUrl}`);
      continue;
    }
    if (logoDevToken) {
      const p = await fetchProviderLogo(baseDomain(new URL(j.site).hostname), logoDevToken);
      if (p) {
        await saveLogo(prisma, storage, j.owner, j.id, p, "logo_provider");
        results.provider++;
        console.log(`✓ ${label}: logo provider fallback (official: ${r.reason})`);
        continue;
      }
    }
    results.failed++;
    failures.push(`${label}: ${r.reason}`);
    console.log(`✗ ${label}: ${r.reason}`);
  }
  console.log(
    `\nDone: ${results.official} from official sites, ${results.provider} from logo provider, ${results.failed} failed, ${results.skipped} skipped (of ${jobs.length}).` +
      (logoDevToken ? "" : " Logo provider fallback not configured (LOGO_DEV_TOKEN)."),
  );
  await integrations.close();
  await disconnectPrisma();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
