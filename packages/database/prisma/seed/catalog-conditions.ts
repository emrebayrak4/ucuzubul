/**
 * DEMO second-hand / refurbished / open-box offers so condition handling is visible (source = "demo").
 * ~15% of products get 1–3 such offers below their lowest new price:
 *  - eBay marketplace seller, used with a grade
 *  - Amazon Resale (Amazon's used program), used "like new" / "very good"
 *  - Best Buy Open-Box, open_box
 *  - Back Market marketplace seller, refurbished (electronics only)
 * Idempotent: offers with retailerSku prefix "DEMO-CND-" are replaced on each run.
 */
import { createRng } from "@pricora/utils";
import type { Prisma, PrismaClient } from "../../src/index";
import { offerSeries, pick, productIndex, randInt } from "./history";

const PREFIX = "DEMO-CND-";
const ELECTRONIC_TOPS = new Set(["electronics", "computers", "smartphones", "gaming"]);

type Kind = "ebay_used" | "amazon_resale" | "bestbuy_openbox" | "backmarket_refurb";
type Grade = "like_new" | "very_good" | "good" | "acceptable";

interface KindSpec {
  slug: string;
  host: string;
  condition: "used" | "open_box" | "refurbished";
  grade: Grade | null;
  factor: number;
  sellerType: "retailer" | "marketplace";
  sellerName: string;
  returnPolicy: string;
  refurbishedBy: string | null;
}

export async function seedConditionOffers(prisma: PrismaClient, now = new Date()): Promise<{ products: number; offers: number }> {
  const rng = createRng("whichless-conditions-v1");
  await prisma.offer.deleteMany({ where: { retailerSku: { startsWith: PREFIX } } });
  const retailers = await prisma.retailer.findMany({ where: { slug: { in: ["ebay", "amazon", "best-buy", "back-market"] } }, select: { id: true, slug: true } });
  const rid = new Map(retailers.map((r) => [r.slug, r.id]));
  const products = await prisma.product.findMany({
    where: { status: "active", isDemo: true, condition: "new" },
    select: { id: true, title: true, category: { select: { path: true } }, offers: { where: { isActive: true, condition: "new" }, select: { priceCents: true } } },
    orderBy: { slug: "asc" },
  });
  const spec = (kind: Kind): KindSpec => {
    switch (kind) {
      case "ebay_used":
        return { slug: "ebay", host: "www.ebay.com", condition: "used", grade: pick(rng, ["like_new", "very_good", "good", "acceptable"] as const), factor: 0.55 + rng() * 0.2, sellerType: "marketplace", sellerName: "eBay seller (demo)", returnPolicy: pick(rng, ["30-day returns", "No returns accepted"]), refurbishedBy: null };
      case "amazon_resale":
        return { slug: "amazon", host: "www.amazon.com", condition: "used", grade: pick(rng, ["like_new", "very_good"] as const), factor: 0.7 + rng() * 0.15, sellerType: "retailer", sellerName: "Amazon Resale", returnPolicy: "30-day returns", refurbishedBy: null };
      case "bestbuy_openbox":
        return { slug: "best-buy", host: "www.bestbuy.com", condition: "open_box", grade: pick(rng, ["like_new", "good"] as const), factor: 0.82 + rng() * 0.1, sellerType: "retailer", sellerName: "Best Buy Open-Box", returnPolicy: "15-day returns", refurbishedBy: null };
      case "backmarket_refurb":
        return { slug: "back-market", host: "www.backmarket.com", condition: "refurbished", grade: null, factor: 0.68 + rng() * 0.15, sellerType: "marketplace", sellerName: "Back Market seller (demo)", returnPolicy: "30-day returns, 1-year warranty", refurbishedBy: "seller" };
    }
  };
  const history: Prisma.PriceHistoryCreateManyInput[] = [];
  let count = 0;
  let touched = 0;
  for (const [i, p] of products.entries()) {
    if (rng() > 0.15 || !p.offers.length) continue;
    const lowestNew = Math.min(...p.offers.map((o) => o.priceCents));
    if (lowestNew < 2500) continue; // second-hand listings are rare for cheap items
    const top = p.category?.path.split("/")[0] ?? "";
    const kinds: Kind[] = ["ebay_used", "amazon_resale", "bestbuy_openbox", ...(ELECTRONIC_TOPS.has(top) ? (["backmarket_refurb"] as Kind[]) : [])];
    const chosen = new Set<Kind>();
    const n = Math.min(randInt(rng, 1, 3), kinds.length);
    while (chosen.size < n) chosen.add(pick(rng, kinds));
    touched++;
    for (const kind of chosen) {
      const s = spec(kind);
      const retailerId = rid.get(s.slug);
      if (!retailerId) continue;
      const days = randInt(rng, 25, 90);
      const series = offerSeries({
        rng,
        days,
        now,
        baseCents: Math.round(lowestNew * s.factor),
        index: productIndex(rng, days, pick(rng, ["stable", "sale", "recent_drop"] as const)),
        roundDollars: false,
        observeProbability: 0.7,
      });
      const last = series[series.length - 1];
      if (!last) continue;
      const label = s.condition === "open_box" ? "Open-Box" : s.condition === "refurbished" ? "Refurbished" : "Used";
      const offer = await prisma.offer.create({
        data: {
          productId: p.id,
          retailerId,
          retailerSku: `${PREFIX}${s.slug.toUpperCase()}-${String(i + 1).padStart(5, "0")}`,
          title: `${p.title} — ${label}`,
          url: `https://${s.host}/`,
          condition: s.condition,
          conditionGrade: s.grade,
          refurbishedBy: s.refurbishedBy,
          sellerType: s.sellerType,
          sellerName: s.sellerName,
          returnPolicy: s.returnPolicy,
          priceCents: last.priceCents,
          listPriceCents: null,
          shippingCents: pick(rng, [0, 0, 599, 999]),
          shippingDaysMin: 2,
          shippingDaysMax: randInt(rng, 4, 8),
          currency: "USD",
          stock: last.inStock ? "in_stock" : "out_of_stock",
          source: "demo",
          firstSeenAt: series[0]?.observedAt ?? now,
          lastCheckedAt: last.observedAt,
          lastChangedAt: last.observedAt,
        },
        select: { id: true },
      });
      count++;
      for (const pt of series) {
        history.push({ offerId: offer.id, observedAt: pt.observedAt, productId: p.id, retailerId, priceCents: pt.priceCents, shippingCents: null, currency: "USD", stock: pt.inStock ? "in_stock" : "out_of_stock", source: "demo" });
      }
    }
  }
  for (let k = 0; k < history.length; k += 5000) await prisma.priceHistory.createMany({ data: history.slice(k, k + 5000), skipDuplicates: true });
  return { products: touched, offers: count };
}
