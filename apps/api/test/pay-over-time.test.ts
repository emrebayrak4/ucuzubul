/**
 * Pay over time (BNPL / financing): pay-in-4 math and guards, offer/card fields, search filter + facet, store page.
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints, type PaymentOption } from "@pricora/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { applicableOptions, payIn4For, withinLimits } from "../src/core/payment-options";
import { SearchService } from "../src/services/search.service";

let app: INestApplication;
type Server = Parameters<typeof request>[0];
let server: Server;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
  await app.get(SearchService).ensureIndex(true);
});

afterAll(async () => {
  await app.close();
});

const opt = (o: Partial<PaymentOption>): PaymentOption => ({
  provider: "Klarna",
  planType: "pay_in_4",
  installments: 4,
  interestFree: true,
  minOrderCents: 3500,
  maxOrderCents: 100000,
  limitsScope: "provider_general",
  aprMinBp: null,
  aprMaxBp: null,
  promoDescription: null,
  sourceUrl: "https://example.com/help",
  lastVerifiedAt: "2026-11-27T00:00:00.000Z",
  ...o,
});

describe("pay-in-4 helpers", () => {
  it("computes ceil(total/4) only inside known limits", () => {
    expect(payIn4For([opt({})], 32_501)).toEqual({ provider: "Klarna", installments: 4, installmentCents: 8126, basisTotalCents: 32_501 });
    expect(payIn4For([opt({})], 3_499)).toBeNull();
    expect(payIn4For([opt({})], 100_001)).toBeNull();
  });

  it("never computes from unknown limits or non-pay-in-4 plans", () => {
    expect(payIn4For([opt({ maxOrderCents: null })], 50_000)).toBeNull();
    expect(payIn4For([opt({ minOrderCents: null })], 50_000)).toBeNull();
    expect(payIn4For([opt({ planType: "monthly_financing", installments: null, aprMinBp: 0, aprMaxBp: 3600 })], 50_000)).toBeNull();
    expect(payIn4For([opt({ planType: "store_card_promo" })], 50_000)).toBeNull();
    expect(payIn4For(undefined, 50_000)).toBeNull();
    // Fee-based pay-in-4 (e.g. Zip) is never shown as an interest-free estimate.
    expect(payIn4For([opt({ provider: "Zip", interestFree: false })], 50_000)).toBeNull();
  });

  it("applicable options keep unknown limits and drop out-of-range ones", () => {
    expect(withinLimits({ minOrderCents: null, maxOrderCents: null }, 1)).toBe(true);
    const list = [opt({}), opt({ provider: "Affirm", planType: "monthly_financing", minOrderCents: 5000, maxOrderCents: null })];
    expect(applicableOptions(list, 4000).map((o) => o.provider)).toEqual(["Klarna"]);
    expect(applicableOptions(list, 200_000).map((o) => o.provider)).toEqual(["Affirm"]);
  });
});

describe("pay over time in the API", () => {
  it("offers carry paymentOptions; payIn4 matches the basis and the plan's published limits", async () => {
    const s = await request(server).get("/v1/search").query({ payOverTime: "true", pageSize: 5 }).expect(200);
    for (const card of s.body.items as { slug: string }[]) {
      const res = await request(server).get(`/v1/products/${card.slug}`).expect(200);
      expect(endpoints["catalog.product"].response.safeParse(res.body).success).toBe(true);
      for (const o of res.body.offers as { priceCents: number; shipping: { costCents: number | null }; paymentOptions: PaymentOption[]; payIn4: { installmentCents: number; basisTotalCents: number; provider: string } | null }[]) {
        expect(Array.isArray(o.paymentOptions)).toBe(true);
        if (!o.payIn4) continue;
        const basis = o.priceCents + (o.shipping.costCents ?? 0);
        expect(o.payIn4.basisTotalCents).toBe(basis);
        expect(o.payIn4.installmentCents).toBe(Math.ceil(basis / 4));
        const plan = o.paymentOptions.find((p) => p.planType === "pay_in_4" && p.provider === o.payIn4!.provider);
        expect(plan).toBeTruthy();
        expect(basis).toBeGreaterThanOrEqual(plan!.minOrderCents!);
        expect(basis).toBeLessThanOrEqual(plan!.maxOrderCents!);
      }
    }
  });

  it("search filter payOverTime matches the facet count", async () => {
    const all = await request(server).get("/v1/search").query({ category: "laptops" }).expect(200);
    const only = await request(server).get("/v1/search").query({ category: "laptops", payOverTime: "true" }).expect(200);
    expect(only.body.total).toBe(all.body.facets.payOverTimeCount);
    expect(only.body.total).toBeLessThanOrEqual(all.body.total);
    for (const c of only.body.items as { payOverTime?: boolean }[]) expect(c.payOverTime).toBe(true);
  });

  it("payOverTime=payin4 narrows to interest-free pay-in-4 and matches payIn4Count", async () => {
    const all = await request(server).get("/v1/search").query({ pageSize: 1 }).expect(200);
    const p4 = await request(server).get("/v1/search").query({ payOverTime: "payin4", pageSize: 60 }).expect(200);
    const any = await request(server).get("/v1/search").query({ payOverTime: "any", pageSize: 1 }).expect(200);
    expect(p4.body.total).toBe(all.body.facets.payIn4Count);
    expect(any.body.total).toBe(all.body.facets.payOverTimeCount);
    expect(p4.body.total).toBeLessThanOrEqual(any.body.total);
    expect(p4.body.total).toBeGreaterThan(0);
    // Group counts are disjunctive: selecting one option doesn't change the other's count.
    expect(p4.body.facets.payOverTimeCount).toBe(all.body.facets.payOverTimeCount);
    expect(p4.body.facets.payIn4Count).toBe(all.body.facets.payIn4Count);
    await request(server).get("/v1/search").query({ payOverTime: "bogus" }).expect(422);
  });

  it("store detail lists payment options with source URL and verification date", async () => {
    const res = await request(server).get("/v1/retailers/best-buy").expect(200);
    expect(endpoints["catalog.retailer"].response.safeParse(res.body).success).toBe(true);
    for (const o of res.body.paymentOptions as PaymentOption[]) {
      expect(o.sourceUrl).toMatch(/^https:\/\//);
      expect(Number.isNaN(Date.parse(o.lastVerifiedAt))).toBe(false);
      if (o.planType !== "pay_in_4") expect(o.installments).toBeNull();
    }
  });
});
