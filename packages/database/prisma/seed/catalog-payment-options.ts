/**
 * Pay-over-time options per retailer (BNPL / promotional financing), from PAYMENT_OPTIONS_DATA — facts researched
 * on retailers' and providers' public help pages (each row carries its sourceUrl). Unknown values stay null.
 * Upserts by (retailer, provider, planType); researched rows no longer in the data are deactivated.
 * Rows from feeds/APIs (origin != "public_help_page") are never touched here.
 */
import type { PrismaClient } from "../../src/index";
import { PAYMENT_OPTIONS_DATA, PAYMENT_OPTIONS_VERIFIED_AT } from "./catalog-payment-data";

const cents = (usd: number | null | undefined) => (typeof usd === "number" ? Math.round(usd * 100) : null);
const bp = (pct: number | null | undefined) => (typeof pct === "number" ? Math.round(pct * 100) : null);

export async function seedPaymentOptions(prisma: PrismaClient): Promise<{ upserted: number; deactivated: number; retailersWithOptions: number }> {
  const retailers = await prisma.retailer.findMany({ select: { id: true, slug: true } });
  const idBySlug = new Map(retailers.map((r) => [r.slug, r.id]));
  const verifiedAt = new Date(PAYMENT_OPTIONS_VERIFIED_AT);
  const keep = new Set<string>();
  let upserted = 0;
  for (const [slug, rows] of Object.entries(PAYMENT_OPTIONS_DATA)) {
    const retailerId = idBySlug.get(slug);
    if (!retailerId) continue;
    for (const r of rows) {
      const data = {
        installments: r.planType === "pay_in_4" ? 4 : null,
        interestFree: r.interestFree,
        minOrderCents: cents(r.minOrderUsd),
        maxOrderCents: cents(r.maxOrderUsd),
        limitsScope: r.limitsScope ?? null,
        aprMinBp: bp(r.aprMinPct),
        aprMaxBp: bp(r.aprMaxPct),
        promoDescription: r.promoDescription ?? null,
        sourceUrl: r.sourceUrl,
        lastVerifiedAt: verifiedAt,
        origin: "public_help_page",
        isActive: true,
      };
      const row = await prisma.retailerPaymentOption.upsert({
        where: { retailerId_provider_planType: { retailerId, provider: r.provider, planType: r.planType } },
        update: data,
        create: { retailerId, provider: r.provider, planType: r.planType, ...data },
        select: { id: true },
      });
      keep.add(row.id);
      upserted++;
    }
  }
  const stale = await prisma.retailerPaymentOption.updateMany({ where: { origin: "public_help_page", isActive: true, id: { notIn: [...keep] } }, data: { isActive: false } });
  const withOptions = Object.values(PAYMENT_OPTIONS_DATA).filter((r) => r.length > 0).length;
  return { upserted, deactivated: stale.count, retailersWithOptions: withOptions };
}
