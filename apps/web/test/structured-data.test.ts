import { describe, expect, it } from "vitest";
import type { Offer, ProductCard, ProductDetailResponse } from "@pricora/contracts";
import {
  breadcrumbJsonLd,
  clampText,
  collectionPageJsonLd,
  faqJsonLd,
  itemListJsonLd,
  listFacts,
  listSummary,
  listingSeo,
  organizationJsonLd,
  productJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo";
import { extractJsonLd, validateJsonLd } from "@/lib/seo-validate";

const NOW = "2026-11-27T10:00:00.000Z";

function offer(over: Partial<Offer> = {}): Offer {
  return {
    id: "o1",
    retailer: { id: "r1", slug: "store-a", name: "Store A", logoUrl: null, brandColor: null },
    title: "Widget",
    condition: "new",
    priceCents: 129_999,
    listPriceCents: null,
    currency: "USD",
    shipping: { costCents: 0, kind: "free", estimatedDaysMin: 2, estimatedDaysMax: 4, pickupAvailable: false },
    tax: { amountCents: null, rateBasisPoints: null, status: "unknown_set_zip" },
    estimatedTotalCents: 129_999,
    stock: "in_stock",
    couponCode: null,
    couponDescription: null,
    goUrl: "/v1/go/o1",
    isAffiliate: true,
    source: "api",
    sponsored: false,
    lastCheckedAt: NOW,
    ...over,
  };
}

function detail(offers: Offer[]): ProductDetailResponse {
  return {
    product: {
      id: "p1",
      slug: "acme-widget-256gb",
      title: "Acme Widget 256GB",
      description: "A widget.",
      brand: { slug: "acme", name: "Acme", logoUrl: null },
      category: { slug: "widgets", name: "Widgets" },
      breadcrumbs: [
        { name: "Electronics", slug: "electronics" },
        { name: "Widgets", slug: "widgets" },
      ],
      model: "W-1",
      mpn: "W1-256",
      condition: "new",
      images: [{ url: "https://img.example/w.jpg", alt: "Acme Widget front", width: 800, height: 800 }],
      identifiers: [{ type: "UPC", value: "012345678905", retailerSlug: null }],
      attributes: [],
      variants: [
        { slug: "acme-widget-256gb", label: "256 GB", attributes: { storage: "256 GB" }, condition: "new", lowestPriceCents: 129_999, current: true },
        { slug: "acme-widget-512gb", label: "512 GB", attributes: { storage: "512 GB" }, condition: "new", lowestPriceCents: 149_999, current: false },
      ],
      releasedAt: null,
      updatedAt: NOW,
    },
    offers,
    lowestOfferId: offers[0]?.id ?? null,
    storeCount: offers.length,
    priceStats: {
      currentLowestCents: 129_999,
      allTimeLowCents: 119_999,
      allTimeLowAt: NOW,
      allTimeHighCents: null,
      avg30Cents: null,
      median30Cents: null,
      avg90Cents: null,
      median90Cents: null,
      min90Cents: null,
      max90Cents: null,
      volatility90: null,
      change30Ratio: null,
      sampleSize: 3,
      firstObservedAt: NOW,
    },
    dealScore: null,
    fakeDiscount: { flag: false, message: null, advertisedDiscountRatio: null, actualVsMedian90Ratio: null },
    hasDemoData: offers.some((o) => o.source === "demo"),
    coupons: [],
    related: [],
    alternatives: [],
    lastUpdatedAt: NOW,
  };
}

function card(i: number, over: Partial<ProductCard> = {}): ProductCard {
  return {
    id: `c${i}`,
    slug: `product-${i}`,
    title: `Product ${i}`,
    brand: { slug: i % 2 ? "acme" : "globex", name: i % 2 ? "Acme" : "Globex", logoUrl: null },
    category: { slug: "widgets", name: "Widgets" },
    condition: "new",
    image: null,
    lowestPriceCents: 10_000 + i * 1000,
    lowestTotalCents: null,
    currency: "USD",
    storeCount: 3,
    inStock: true,
    dropRatio: null,
    dealScore: 70,
    hasDemoData: false,
    sponsored: false,
    updatedAt: NOW,
    ...over,
  };
}

const errorsOf = (node: unknown) => validateJsonLd(node).filter((i) => i.level === "error");

describe("JSON-LD builders validate for every template", () => {
  it("product with real offers → Product + AggregateOffer + Offer[] (valid, no ratings, no priceValidUntil)", () => {
    const ld = productJsonLd(
      detail([offer(), offer({ id: "o2", priceCents: 139_999, retailer: { id: "r2", slug: "b", name: "Store B", logoUrl: null, brandColor: null }, stock: "out_of_stock", shipping: { costCents: 999, kind: "paid", estimatedDaysMin: null, estimatedDaysMax: null, pickupAvailable: false } })]),
    );
    expect(errorsOf(ld)).toEqual([]);
    const offers = ld.offers as Record<string, unknown>;
    expect(offers.lowPrice).toBe("1299.99");
    expect(offers.highPrice).toBe("1399.99");
    expect(offers.offerCount).toBe(2);
    expect(offers.availability).toBe("https://schema.org/InStock");
    const json = JSON.stringify(ld);
    expect(json).not.toMatch(/aggregateRating|"review|priceValidUntil/);
    expect(ld.isVariantOf).toMatchObject({ "@type": "ProductGroup", productGroupID: "acme-widget-256gb" });
  });

  it("demo offers never reach structured data", () => {
    const ld = productJsonLd(detail([offer({ source: "demo" }), offer({ id: "o2", source: "demo", priceCents: 1 })]));
    expect(ld.offers).toBeUndefined();
    expect(errorsOf(ld)).toEqual([]);
    const mixed = productJsonLd(detail([offer({ source: "demo", priceCents: 1 }), offer({ id: "o2" })]));
    expect((mixed.offers as Record<string, unknown>).lowPrice).toBe("1299.99");
    expect((mixed.offers as Record<string, unknown>).offerCount).toBe(1);
  });

  it("all real offers out of stock → OutOfStock", () => {
    const ld = productJsonLd(detail([offer({ stock: "out_of_stock" })]));
    expect((ld.offers as Record<string, unknown>).availability).toBe("https://schema.org/OutOfStock");
  });

  it("site entities, lists, pages and FAQ", () => {
    const nodes = [
      organizationJsonLd(),
      websiteJsonLd(),
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Widgets", path: "/categories/widgets" },
      ]),
      itemListJsonLd("Popular widgets", [card(1), card(2)], 25),
      collectionPageJsonLd({ name: "Widgets", path: "/categories/widgets", description: "x", dateModified: NOW }),
      webPageJsonLd({ type: "AboutPage", name: "About", path: "/about", description: "x", dateModified: "2026-11-27" }),
      faqJsonLd([{ q: "Q?", a: "A." }]),
    ];
    for (const n of nodes) expect(errorsOf(n), JSON.stringify(n)).toEqual([]);
    expect((itemListJsonLd("x", [card(1)], 25).itemListElement as Array<{ position: number }>)[0]!.position).toBe(25);
  });

  it("validator catches the things we promise never to emit", () => {
    expect(errorsOf({ "@context": "https://schema.org", "@type": "Product", name: "x", aggregateRating: { ratingValue: 5 } }).length).toBeGreaterThan(0);
    expect(errorsOf({ "@context": "https://schema.org", "@type": "Offer", price: "12.5.0", priceCurrency: "usd" }).length).toBe(2);
    expect(errorsOf({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 2, name: "a", item: "/rel" }] }).length).toBe(2);
  });

  it("extracts JSON-LD script blocks from HTML", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"a","url":"https://a.test"}</script>`;
    expect(extractJsonLd(html)).toHaveLength(1);
  });
});

describe("listing canonical / robots policy", () => {
  const curated = (indexable: boolean) => ({ brandPath: (b: string) => `/brands/${b}/laptops`, indexable });
  it("clean + pagination stay indexable with self canonical", () => {
    expect(listingSeo("/categories/laptops", {})).toMatchObject({ canonical: "/categories/laptops", noindex: false });
    expect(listingSeo("/categories/laptops", { page: "3" })).toMatchObject({ canonical: "/categories/laptops?page=3", noindex: false });
  });
  it("sort/view only → canonical to the clean URL, indexable", () => {
    expect(listingSeo("/categories/laptops", { sort: "price_asc", view: "list" })).toMatchObject({ canonical: "/categories/laptops", noindex: false });
  });
  it("thin facet combos → noindex,follow", () => {
    expect(listingSeo("/categories/laptops", { minPrice: "10000", spec: "ram.16-gb" })).toMatchObject({ canonical: "/categories/laptops", noindex: true });
    expect(listingSeo("/categories/laptops", { brand: "acme,globex" }, curated(true))).toMatchObject({ noindex: true });
  });
  it("single brand on a category → curated brand×category canonical", () => {
    expect(listingSeo("/categories/laptops", { brand: "acme" }, curated(true))).toMatchObject({ canonical: "/brands/acme/laptops", noindex: false });
    expect(listingSeo("/categories/laptops", { brand: "acme" }, curated(false))).toMatchObject({ canonical: "/brands/acme/laptops", noindex: true });
  });
});

describe("text helpers and generated copy", () => {
  it("clamps at a word boundary", () => {
    const s = clampText("The quick brown fox jumps over the lazy dog again and again", 30);
    expect(s.length).toBeLessThanOrEqual(30);
    expect(s.endsWith("…")).toBe(true);
    expect(clampText("short", 30)).toBe("short");
  });
  it("summaries are built from real numbers only", () => {
    const items = [card(1), card(2, { previousPriceCents: 20_000 }), card(3, { hasDemoData: true })];
    const f = listFacts(items, 42);
    expect(f).toMatchObject({ total: 42, realCount: 2, minCents: 11_000, maxCents: 13_000, recentDrops: 1 });
    expect(listSummary("widgets", f)).toBe("We compare 42 widgets across US stores, with lowest prices from $110 to $130 in this list. Most-listed brands here: Acme, Globex. 1 has a price cut in the last 7 days.");
    expect(listSummary("widgets", listFacts([], 0))).toMatch(/don't track/);
  });
});
