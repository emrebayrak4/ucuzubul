/**
 * Multi-market seed (markets session). Never wipes other data:
 *  - upserts the 12 Market rows from @pricora/config,
 *  - upserts the non-US storefronts (MARKET_RETAILERS) + RetailerMarket rows (pending_configuration),
 *  - upserts CategoryTranslation rows (CATEGORY_I18N),
 *  - REPLACES only `source = demo` offers outside the US and `source = demo` coupons of non-US storefronts.
 *
 * Demo prices are in the market's own currency (minor units) from a fixed per-market "demo price level"
 * applied to the US demo median — they are NOT FX conversions and NOT real local prices. Every offer
 * and coupon is `source = demo` so the UI shows the "Demo data" label.
 *
 * Note: the US `seedCoupons` deletes ALL demo coupons; run this module after it (db:seed does).
 */
import { MARKETS, MARKET_LIST, type MarketId } from "@pricora/config";
import { createRng, hashString } from "@pricora/utils";
import type { PrismaClient } from "../../src/index";
import { offerSeries, productIndex, randInt, type Rng } from "./history";
import { CATEGORY_I18N } from "./markets-category-i18n";
import { MARKET_RETAILERS, type MarketRetailerKind, type SeedMarketRetailer } from "./markets-retailers";
import type { PricePattern } from "./products";

const DAY_MS = 86_400_000;
type NonUs = Exclude<MarketId, "us">;

/** Local major units per 1 USD of US demo price — demo price level only (VAT-inclusive where the market shows VAT). */
const DEMO_PRICE_LEVEL: Readonly<Record<NonUs, number>> = {
  uk: 0.92,
  ca: 1.4,
  au: 1.62,
  de: 1.04,
  fr: 1.07,
  es: 1.05,
  it: 1.07,
  nl: 1.05,
  jp: 158,
  tr: 52,
  br: 7.4,
};

/** Typical paid shipping in minor units (used for cheaper items; pricier items ship free). */
const DEMO_SHIPPING: Readonly<Record<NonUs, readonly number[]>> = {
  uk: [399, 499, 0],
  ca: [999, 0],
  au: [995, 1495, 0],
  de: [499, 595, 0],
  fr: [499, 599, 0],
  es: [399, 499, 0],
  it: [499, 990, 0],
  nl: [295, 0],
  jp: [550, 770, 0],
  tr: [4999, 0],
  br: [1990, 2490, 0],
};

const PRODUCTS_PER_MARKET = 220;
const PATTERNS: readonly PricePattern[] = ["stable", "stable", "sale", "recent_drop", "decline", "hike_then_sale"];

function kindForCategoryPath(path: string | null): MarketRetailerKind {
  const top = (path ?? "").split("/")[0] ?? "";
  if (["electronics", "computers", "smartphones", "gaming"].includes(top)) return "electronics";
  if (["appliances", "home-kitchen"].includes(top)) return "home";
  if (top === "fashion") return "fashion";
  if (top === "office-supplies") return "office";
  if (["tools-home-improvement", "automotive"].includes(top)) return "diy";
  return "general";
}

/** Local price endings: x.99 (GBP/EUR/CAD/AUD), ¥19,800 / ¥1,980, ₺12.999 / R$ 1.299,00 style. */
export function localRound(minor: number, market: NonUs): number {
  const v = Math.max(1, Math.round(minor));
  switch (market) {
    case "jp":
      return v >= 10_000 ? Math.max(100, Math.round(v / 1000) * 1000 - 200) : Math.max(100, Math.round(v / 100) * 100 - 20);
    case "tr":
    case "br":
      return v >= 100_000 ? Math.round(v / 1000) * 1000 - 100 : Math.max(99, Math.round(v / 100) * 100 - 10);
    default:
      return v < 2000 ? Math.max(99, Math.round(v / 10) * 10 - 1) : Math.floor(v / 100) * 100 + 99;
  }
}

const COUPON_TEXT: Readonly<
  Record<string, { pct: (p: number, cat: string) => string; amt: (a: string, min: string) => string; ship: string; desc: string }>
> = {
  "en-GB": { pct: (p, c) => `Demo: ${p}% off ${c}`, amt: (a, m) => `Demo: ${a} off when you spend ${m}`, ship: "Demo: Free delivery", desc: "Demo coupon for development — not a real retailer offer." },
  "en-CA": { pct: (p, c) => `Demo: ${p}% off ${c}`, amt: (a, m) => `Demo: ${a} off orders of ${m}+`, ship: "Demo: Free shipping", desc: "Demo coupon for development — not a real retailer offer." },
  "en-AU": { pct: (p, c) => `Demo: ${p}% off ${c}`, amt: (a, m) => `Demo: ${a} off when you spend ${m}`, ship: "Demo: Free delivery", desc: "Demo coupon for development — not a real retailer offer." },
  "de-DE": { pct: (p, c) => `Demo: ${p} % Rabatt auf ${c}`, amt: (a, m) => `Demo: ${a} Rabatt ab ${m} Bestellwert`, ship: "Demo: Versandkostenfrei", desc: "Demo-Gutschein für Testzwecke – kein echtes Händlerangebot." },
  "fr-FR": { pct: (p, c) => `Démo : -${p} % sur ${c}`, amt: (a, m) => `Démo : ${a} de remise dès ${m} d’achat`, ship: "Démo : livraison offerte", desc: "Code promo de démonstration — pas une vraie offre du marchand." },
  "es-ES": { pct: (p, c) => `Demo: ${p} % de descuento en ${c}`, amt: (a, m) => `Demo: ${a} de descuento a partir de ${m}`, ship: "Demo: envío gratis", desc: "Cupón de demostración para pruebas: no es una oferta real de la tienda." },
  "it-IT": { pct: (p, c) => `Demo: ${p}% di sconto su ${c}`, amt: (a, m) => `Demo: ${a} di sconto con una spesa minima di ${m}`, ship: "Demo: spedizione gratuita", desc: "Coupon dimostrativo per test: non è una vera offerta del negozio." },
  "nl-NL": { pct: (p, c) => `Demo: ${p}% korting op ${c}`, amt: (a, m) => `Demo: ${a} korting vanaf ${m}`, ship: "Demo: gratis verzending", desc: "Demo-kortingscode voor testdoeleinden — geen echte aanbieding van de winkel." },
  "ja-JP": { pct: (p, c) => `デモ：${c} ${p}%オフ`, amt: (a, m) => `デモ：${m}以上のご購入で${a}オフ`, ship: "デモ：送料無料", desc: "開発用のデモクーポンです。実際のストアの特典ではありません。" },
  "tr-TR": { pct: (p, c) => `Demo: ${c} ürünlerinde %${p} indirim`, amt: (a, m) => `Demo: ${m} ve üzeri alışverişte ${a} indirim`, ship: "Demo: Ücretsiz kargo", desc: "Test amaçlı demo kupon — mağazanın gerçek bir teklifi değildir." },
  "pt-BR": { pct: (p, c) => `Demo: ${p}% de desconto em ${c}`, amt: (a, m) => `Demo: ${a} de desconto em compras acima de ${m}`, ship: "Demo: frete grátis", desc: "Cupom de demonstração para testes — não é uma oferta real da loja." },
};

function money(minor: number, market: NonUs): string {
  const m = MARKETS[market];
  const major = m.currencyDigits === 0 ? minor : minor / 100;
  return new Intl.NumberFormat(m.defaultLocale, { style: "currency", currency: m.currency, maximumFractionDigits: 0 }).format(major);
}

export interface MarketSeedResult {
  markets: number;
  retailers: number;
  categoryTranslations: number;
  offers: number;
  history: number;
  coupons: number;
}

export async function seedMarkets(
  prisma: PrismaClient,
  opts: { now?: Date; log?: (m: string) => void; markets?: NonUs[] } = {},
): Promise<MarketSeedResult> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => undefined);
  const result: MarketSeedResult = { markets: 0, retailers: 0, categoryTranslations: 0, offers: 0, history: 0, coupons: 0 };

  // 1. Markets
  for (const m of MARKET_LIST) {
    const data = {
      country: m.country,
      name: m.name,
      defaultLocale: m.defaultLocale,
      locales: [...m.locales],
      currency: m.currency,
      currencyDigits: m.currencyDigits,
      timezone: m.timezone,
      sortOrder: m.sortOrder,
    };
    await prisma.market.upsert({ where: { id: m.id }, update: data, create: { id: m.id, ...data } });
    result.markets++;
  }

  // 2. Storefronts
  const retailerIds = new Map<string, string>();
  for (const r of MARKET_RETAILERS) {
    const websiteUrl = "https://www." + r.domain.replace(/^www\./, "");
    const hosts = [r.domain, "www." + r.domain, ...(r.extraHosts ?? [])];
    const data = {
      name: r.name,
      domain: r.domain,
      websiteUrl,
      brandColor: r.brandColor,
      homeMarketId: r.market,
      groupSlug: r.group ?? null,
      allowedRedirectHosts: hosts,
      affiliateDisclosure: r.affiliate.network ? "We may earn a commission when you buy through links to this store." : null,
    };
    const row = await prisma.retailer.upsert({
      where: { slug: r.slug },
      update: data,
      create: { slug: r.slug, integrationStatus: "pending_configuration", ...data },
      select: { id: true },
    });
    retailerIds.set(r.slug, row.id);
    const rm = {
      isPrimary: true,
      localDomain: r.domain,
      websiteUrl,
      affiliateNetwork: r.affiliate.network,
      affiliateProgramName: r.affiliate.program,
      affiliateSignupUrl: r.affiliate.signupUrl ?? null,
      notes: [r.affiliate.verified ? "Route confirmed 2026-11-27." : "Route UNVERIFIED (2026-11-27).", r.affiliate.notes ?? ""].join(" ").trim(),
    };
    await prisma.retailerMarket.upsert({
      where: { retailerId_marketId: { retailerId: row.id, marketId: r.market } },
      update: rm,
      create: { retailerId: row.id, marketId: r.market, ...rm },
    });
    result.retailers++;
  }
  log(`markets: ${result.markets}, storefronts: ${result.retailers}`);

  // 3. Category translations
  const categories = await prisma.category.findMany({ select: { id: true, slug: true, name: true, path: true } });
  for (const c of categories) {
    const tr = CATEGORY_I18N[c.slug];
    if (!tr) continue;
    for (const [locale, name] of Object.entries(tr)) {
      if (!name) continue;
      await prisma.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: c.id, locale } },
        update: { name },
        create: { categoryId: c.id, locale, name },
      });
      result.categoryTranslations++;
    }
  }
  log(`category translations: ${result.categoryTranslations}`);

  // 4. Demo offers + history (replace only non-US demo offers)
  const targetMarkets: NonUs[] = opts.markets ?? (MARKET_LIST.map((m) => m.id).filter((id) => id !== "us") as NonUs[]);
  await prisma.offer.deleteMany({ where: { source: "demo", marketId: { in: targetMarkets } } });

  const products = await prisma.product.findMany({
    where: { isDemo: true, status: "active" },
    select: {
      id: true,
      slug: true,
      title: true,
      category: { select: { path: true } },
      offers: { where: { marketId: "us", isActive: true }, select: { priceCents: true } },
    },
    orderBy: { slug: "asc" },
  });
  const priced = products
    .filter((p) => p.offers.length > 0)
    .map((p) => {
      const prices = p.offers.map((o) => o.priceCents).sort((a, b) => a - b);
      return { ...p, usMedian: prices[Math.floor(prices.length / 2)] as number, kind: kindForCategoryPath(p.category?.path ?? null) };
    });

  for (const market of targetMarkets) {
    const cfg = MARKETS[market];
    const stores = MARKET_RETAILERS.filter((r) => r.market === market);
    const chosen = priced
      .map((p) => ({ p, eligible: stores.filter((s) => s.kinds.includes(p.kind)), h: hashString(market + ":" + p.slug) }))
      .filter((x) => x.eligible.length >= 3)
      .sort((a, b) => a.h - b.h)
      .slice(0, PRODUCTS_PER_MARKET);

    let offers = 0;
    let points = 0;
    for (const { p, eligible } of chosen) {
      const rng: Rng = createRng(market + ":" + p.slug);
      const days = randInt(rng, 90, 200);
      const pattern = PATTERNS[Math.floor(rng() * PATTERNS.length)] as PricePattern;
      const index = productIndex(rng, days, pattern);
      const factor = (DEMO_PRICE_LEVEL[market] * 10 ** cfg.currencyDigits) / 100;
      const marketBase = p.usMedian * factor * (0.92 + rng() * 0.16);
      const count = Math.min(eligible.length, randInt(rng, 3, 5));
      const picks = shuffle(eligible, rng).slice(0, count);

      for (const store of picks) {
        const retailerId = retailerIds.get(store.slug);
        if (!retailerId) continue;
        const base = Math.round(marketBase * (0.95 + rng() * 0.1));
        const series = offerSeries({ rng, days, now, baseCents: base, index, roundDollars: false, observeProbability: 0.3 }).map((pt) => ({
          ...pt,
          priceCents: localRound(pt.priceCents, market),
        }));
        const last = series[series.length - 1];
        if (!last) continue;
        const shipOptions = DEMO_SHIPPING[market];
        const cheap = last.priceCents < 50 * DEMO_PRICE_LEVEL[market] * 10 ** cfg.currencyDigits;
        const shippingCents = cheap ? (shipOptions[Math.floor(rng() * shipOptions.length)] as number) : 0;
        const max = Math.max(...series.map((s) => s.priceCents));
        const offer = await prisma.offer.create({
          data: {
            productId: p.id,
            retailerId,
            retailerSku: `demo-${market}-${p.slug}`.slice(0, 180),
            title: p.title,
            url: store.searchUrl.replace("{q}", encodeURIComponent(p.title)),
            priceCents: last.priceCents,
            listPriceCents: max > last.priceCents ? max : null,
            shippingCents,
            shippingDaysMin: cfg.shipping.typicalDaysMin,
            shippingDaysMax: cfg.shipping.typicalDaysMax,
            currency: cfg.currency,
            marketId: market,
            stock: last.inStock ? "in_stock" : "out_of_stock",
            source: "demo",
            firstSeenAt: series[0]?.observedAt ?? now,
            lastCheckedAt: last.observedAt,
            lastChangedAt: last.observedAt,
          },
          select: { id: true },
        });
        await prisma.priceHistory.createMany({
          data: series.map((s) => ({
            offerId: offer.id,
            observedAt: s.observedAt,
            productId: p.id,
            retailerId,
            priceCents: s.priceCents,
            shippingCents,
            currency: cfg.currency,
            stock: s.inStock ? ("in_stock" as const) : ("out_of_stock" as const),
            source: "demo" as const,
          })),
          skipDuplicates: true,
        });
        offers++;
        points += series.length;
      }
    }
    result.offers += offers;
    result.history += points;
    log(`${market}: ${chosen.length} products, ${offers} offers, ${points} history points`);
  }

  // 5. Demo coupons for non-US storefronts (DEMO- codes, no usage stats)
  const nonUsRetailerIds = [...retailerIds.values()];
  await prisma.coupon.deleteMany({ where: { source: "demo", retailerId: { in: nonUsRetailerIds } } });
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));
  const couponCats = ["laptops", "headphones-audio", "tv-home-theater", "small-kitchen-appliances", "smartphones"];
  for (const market of targetMarkets) {
    const cfg = MARKETS[market];
    const text = COUPON_TEXT[cfg.defaultLocale];
    if (!text) continue;
    const stores = MARKET_RETAILERS.filter((r) => r.market === market).slice(0, 3);
    const rng = createRng("coupons:" + market);
    let n = 0;
    for (const store of stores) {
      const retailerId = retailerIds.get(store.slug);
      if (!retailerId) continue;
      const catSlug = couponCats[Math.floor(rng() * couponCats.length)] as string;
      const cat = catBySlug.get(catSlug);
      const catName = (cat && CATEGORY_I18N[cat.slug]?.[cfg.defaultLocale as keyof (typeof CATEGORY_I18N)[string]]) ?? cat?.name ?? "";
      const unit = 10 ** cfg.currencyDigits * DEMO_PRICE_LEVEL[market];
      const minSpend = Math.round((100 * unit) / 10) * 10;
      const amount = Math.round((10 * unit) / 10) * 10;
      const pct = [5, 10, 15][Math.floor(rng() * 3)] as number;
      const code4 = store.slug.replace(/[^a-z]/g, "").slice(0, 4).toUpperCase();
      const defs: {
        code: string;
        title: string;
        discountType: "percent" | "amount" | "free_shipping";
        discountValue: number;
        minSpendCents: number | null;
        categoryId: string | null;
        days: number;
      }[] = [
        { code: `DEMO-${code4}${pct}`, title: text.pct(pct, catName), discountType: "percent", discountValue: pct * 100, minSpendCents: null, categoryId: cat?.id ?? null, days: 14 },
        { code: `DEMO-${code4}${n + 1}OFF`, title: text.amt(money(amount, market), money(minSpend, market)), discountType: "amount", discountValue: amount, minSpendCents: minSpend, categoryId: null, days: 7 },
      ];
      if (n === 0) defs.push({ code: "", title: text.ship, discountType: "free_shipping", discountValue: 0, minSpendCents: null, categoryId: null, days: 30 });
      for (const d of defs) {
        const c = await prisma.coupon.create({
          data: {
            retailerId,
            code: d.code || null,
            title: d.title,
            description: text.desc,
            discountType: d.discountType,
            discountValue: d.discountType === "free_shipping" ? null : d.discountValue,
            minSpendCents: d.minSpendCents,
            categoryId: d.categoryId,
            startsAt: new Date(now.getTime() - 2 * DAY_MS),
            expiresAt: new Date(now.getTime() + d.days * DAY_MS),
            source: "demo",
            status: "active",
          },
          select: { id: true },
        });
        await prisma.couponEvent.create({ data: { couponId: c.id, retailerId, type: "created", channel: "system", note: "markets demo seed" } });
        result.coupons++;
      }
      n++;
    }
    // Checkout configs (extension) stay empty + disabled, like the US seed.
    for (const store of MARKET_RETAILERS.filter((r) => r.market === market)) {
      const retailerId = retailerIds.get(store.slug);
      if (!retailerId) continue;
      await prisma.retailerCheckoutConfig.upsert({
        where: { retailerId },
        update: {},
        create: { retailerId, hostPatterns: [store.domain, `*.${store.domain}`], checkoutUrlPatterns: [], enabled: false },
      });
    }
  }
  log(`coupons: ${result.coupons}`);
  return result;
}

function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export type { SeedMarketRetailer };
