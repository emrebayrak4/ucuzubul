/**
 * Affiliate-network ingestion against the docker Postgres. Network payloads are TEST-ONLY synthetic
 * objects (no live API calls); every row created here uses an "aff-test-" prefix and is removed afterwards.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getPrisma } from "@pricora/database";
import { applySubId, type NetworkConversion, type NormalizedListing } from "@pricora/retailer-adapters";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  INTEGRATION_CATALOG,
  allowNetworkHost,
  importNetworkConversions,
  ingestNetworkCoupons,
  ingestNetworkProducts,
  networkSchedules,
  pullCouponFeeds,
  testIntegration,
  upsertConversion,
  upsertNetworkListings,
  type ConversionImportStats,
} from "../src/core";

for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (!process.env.DATABASE_URL && existsSync(candidate)) process.loadEnvFile(candidate);
}
const prisma = getPrisma();
const TAG = `aff-test-${Date.now()}`;
const GTIN = "036000291452"; // valid UPC-A check digit
let retailerId = "";
let productId = "";
let demoOfferId = "";
let clickSubId = "";

beforeAll(async () => {
  const r = await prisma.retailer.create({ data: { slug: TAG, name: `Test ${TAG}`, domain: `${TAG}.example.test`, websiteUrl: `https://${TAG}.example.test` } });
  retailerId = r.id;
  const p = await prisma.product.create({ data: { slug: `${TAG}-p`, title: "Testbrand Widget 3000 Black", isDemo: false, identifiers: { create: [{ type: "UPC", value: GTIN }] } } });
  productId = p.id;
  const demo = await prisma.offer.create({
    data: { productId, retailerId, retailerSku: `${TAG}-demo`, title: "demo", url: `https://${TAG}.example.test/demo`, priceCents: 999, source: "demo", isActive: true },
  });
  demoOfferId = demo.id;
  clickSubId = `${TAG}-sub`.replace(/[^A-Za-z0-9_-]/g, "");
  await prisma.affiliateClick.create({ data: { subId: clickSubId, retailerId, targetHost: "www.anrdoezrs.net" } });
});

afterAll(async () => {
  await prisma.affiliateConversion.deleteMany({ where: { externalId: { startsWith: TAG } } });
  await prisma.affiliateClick.deleteMany({ where: { subId: clickSubId } });
  await prisma.affiliateProgram.deleteMany({ where: { externalId: { startsWith: TAG } } });
  await prisma.productMatch.deleteMany({ where: { retailerId } });
  await prisma.offer.deleteMany({ where: { retailerId } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.retailer.deleteMany({ where: { id: retailerId } });
});

describe("network ingestion without credentials", () => {
  it("coupon pull is honest: networks pending, eBay/Amazon unsupported, nothing created", async () => {
    const before = await prisma.coupon.count();
    const results = await pullCouponFeeds(prisma, {});
    expect(results.find((r) => r.id === "cj")).toMatchObject({ status: "pending_configuration", created: 0 });
    expect(results.find((r) => r.id === "awin")?.status).toBe("pending_configuration");
    expect(results.find((r) => r.id === "amazon")?.status).toBe("unsupported");
    expect(results.some((r) => (r.status as string) === "not_implemented")).toBe(false);
    expect(await prisma.coupon.count()).toBe(before);
    expect((await ingestNetworkCoupons(prisma, "partnerize", { PARTNERIZE_USER_API_KEY: "a", PARTNERIZE_USER_APPLICATION_KEY: "b", PARTNERIZE_PUBLISHER_ID: "c" })).status).toBe("unsupported");
  });
  it("products and conversions report pending_configuration", async () => {
    expect((await ingestNetworkProducts(prisma, "impact", {}, async () => undefined)).status).toBe("pending_configuration");
    expect((await importNetworkConversions(prisma, "rakuten", {})).status).toBe("pending_configuration");
  });
  it("Admin Test connection for network entries reports pending without a request", async () => {
    for (const id of ["cj", "impact", "rakuten", "awin", "partnerize", "ebay_partner_network"]) {
      const def = INTEGRATION_CATALOG.find((d) => d.id === id);
      expect(def, id).toBeDefined();
      expect(def!.fields.every((f) => f.help && f.help.length > 10)).toBe(true);
      const r = await testIntegration(def!, {});
      expect(r.status).toBe("pending_configuration");
    }
  });
  it("Best Buy is gated by the legal flag in the catalog", () => {
    const bb = INTEGRATION_CATALOG.find((d) => d.id === "bestbuy")!;
    expect(bb.fields.find((f) => f.key === "BESTBUY_LEGAL_APPROVED")).toMatchObject({ required: true, secret: false });
  });
  it("schedules cover products/conversions per network with sane intervals", () => {
    const s = networkSchedules();
    expect(s.find((x) => x.id === "network-cj-conversions")?.everyMs).toBeGreaterThanOrEqual(60 * 60_000);
    expect(s.some((x) => x.id === "network-partnerize-products")).toBe(false);
  });
});

describe("product listings → matching → offers", () => {
  const listing = (sku: string, priceCents: number, gtin: string | null, title = "Testbrand Widget 3000 Black"): NormalizedListing => ({
    product: { retailerId: `cj:${TAG}`, retailerSku: sku, title, brand: "Testbrand", mpn: null, model: null, gtin, imageUrl: null, productUrl: `https://${TAG}.example.test/p/${sku}`, categoryPath: [], description: null, attributes: {} },
    offer: {
      retailerId: `cj:${TAG}`,
      retailerSku: sku,
      priceCents,
      listPriceCents: null,
      currency: "USD",
      availability: "in_stock",
      condition: "new",
      productUrl: `https://${TAG}.example.test/p/${sku}`,
      affiliateUrl: `https://www.anrdoezrs.net/click-100000-200000?url=https%3A%2F%2F${TAG}.example.test%2Fp%2F${sku}`,
      shippingCents: 0,
      sellerName: null,
      source: "affiliate",
      observedAt: new Date().toISOString(),
    },
  });

  it("GTIN match creates an affiliate offer + price history, allow-lists the network host, hides demo offers", async () => {
    const retailer = await prisma.retailer.findUniqueOrThrow({ where: { id: retailerId } });
    const events: unknown[] = [];
    const stats = await upsertNetworkListings(prisma, retailer, [listing("S1", 4999, GTIN), listing("S2", 1000, null, "Completely different gadget"), { ...listing("S3", 1, GTIN), offer: null }], async (e) => {
      events.push(e);
    });
    expect(stats).toMatchObject({ offersUpserted: 1, rejected: 1, skippedNoPrice: 1 });
    const offer = await prisma.offer.findUniqueOrThrow({ where: { retailerId_retailerSku: { retailerId, retailerSku: "S1" } } });
    expect(offer).toMatchObject({ productId, priceCents: 4999, source: "affiliate", isActive: true });
    expect(offer.affiliateUrl).toContain("anrdoezrs.net");
    expect(await prisma.priceHistory.count({ where: { offerId: offer.id } })).toBe(1);
    expect((await prisma.retailer.findUniqueOrThrow({ where: { id: retailerId } })).allowedRedirectHosts).toContain("www.anrdoezrs.net");
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: demoOfferId } })).isActive).toBe(false);
    expect(stats.demoOffersHidden).toBe(1);

    // price change → history row + price event for alerts
    const again = await upsertNetworkListings(prisma, await prisma.retailer.findUniqueOrThrow({ where: { id: retailerId } }), [listing("S1", 4599, GTIN)], async (e) => {
      events.push(e);
    });
    expect(again.priceChanges).toBe(1);
    expect(events).toHaveLength(1);
    expect(await prisma.priceHistory.count({ where: { offerId: offer.id } })).toBe(2);
  });

  it("never allow-lists unknown hosts", async () => {
    expect(await allowNetworkHost(prisma, retailerId, "https://evil.example.test/redirect?to=x")).toBe(false);
    expect((await prisma.retailer.findUniqueOrThrow({ where: { id: retailerId } })).allowedRedirectHosts).not.toContain("evil.example.test");
  });

  it("the redirect adds our click id to the network link", () => {
    expect(applySubId("https://www.anrdoezrs.net/click-100000-200000?url=x", "abc")).toContain("sid=abc");
  });
});

describe("conversion import", () => {
  const conv = (state: NetworkConversion["state"], commissionCents: number): NetworkConversion => ({
    network: "cj",
    externalId: `${TAG}-c1`,
    subId: clickSubId,
    advertiserId: `${TAG}-adv`,
    advertiserName: "Test advertiser",
    orderId: "O-1",
    saleAmountCents: 10_000,
    commissionCents,
    currency: "USD",
    state,
    occurredAt: "2026-11-20T10:00:00.000Z",
    raw: { test: true },
  });

  it("upserts idempotently, attributes to the click, mirrors status to Commission, reverses pending cashback", async () => {
    const stats: ConversionImportStats = { fetched: 0, created: 0, updated: 0, attributed: 0, unattributed: 0, reversedCashback: 0 };
    await upsertConversion(prisma, conv("pending", 500), stats);
    await upsertConversion(prisma, conv("pending", 500), stats);
    expect(stats).toMatchObject({ created: 1, updated: 1, attributed: 2 });
    const row = await prisma.affiliateConversion.findUniqueOrThrow({ where: { network_externalId: { network: "cj", externalId: `${TAG}-c1` } }, include: { commission: true, click: true, program: true } });
    expect(row.click?.subId).toBe(clickSubId);
    expect(row.commission).toMatchObject({ amountCents: 500, status: "pending" });
    expect(row.program).toMatchObject({ retailerId: null, status: "pending_configuration" });

    const user = await prisma.user.create({ data: { email: `${TAG}@test.pricora.local`, passwordHash: "x" } });
    await prisma.cashbackTransaction.create({ data: { userId: user.id, conversionId: row.id, amountCents: 100, status: "pending" } });
    await upsertConversion(prisma, conv("reversed", 500), stats);
    expect(stats.reversedCashback).toBe(1);
    const after = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: row.id }, include: { commission: true, cashback: true } });
    expect(after.status).toBe("reversed");
    expect(after.commission?.status).toBe("reversed");
    expect(after.cashback[0]?.status).toBe("reversed");
    await prisma.cashbackTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
