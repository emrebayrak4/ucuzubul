/**
 * Demo coupons (source = "demo"). Codes are prefixed DEMO and are NOT real retailer codes.
 * No usage stats are seeded — success rates come only from real reports.
 * Checkout configs for the browser extension are seeded EMPTY and disabled: host patterns come from the
 * retailer's domain; selectors must be filled and verified by an admin.
 */
import type { PrismaClient } from "../../src/index";

const DAY_MS = 86_400_000;

type Def = {
  retailer: string;
  code: string | null;
  title: string;
  description?: string;
  discountType: "percent" | "amount" | "free_shipping" | "bogo" | "other";
  discountValue?: number;
  minSpendCents?: number;
  category?: string;
  expiresInDays: number | null;
  status?: "active" | "unverified" | "expired";
};

const COUPONS: Def[] = [
  { retailer: "amazon", code: "DEMO-AMZ10", title: "Demo: 10% off select headphones", discountType: "percent", discountValue: 1000, category: "headphones-audio", expiresInDays: 14 },
  { retailer: "amazon", code: null, title: "Demo: Free shipping on orders over $25", discountType: "free_shipping", minSpendCents: 2500, expiresInDays: null },
  { retailer: "amazon", code: "DEMO-AMZ5OFF", title: "Demo: $5 off $50+", discountType: "amount", discountValue: 500, minSpendCents: 5000, expiresInDays: 3, status: "unverified" },
  { retailer: "walmart", code: "DEMO-WMT15", title: "Demo: $15 off $100 home & kitchen", discountType: "amount", discountValue: 1500, minSpendCents: 10000, category: "home-kitchen", expiresInDays: 21 },
  { retailer: "walmart", code: "DEMO-WMTSHIP", title: "Demo: Free next-day shipping", discountType: "free_shipping", expiresInDays: 7 },
  { retailer: "best-buy", code: "DEMO-BBY50", title: "Demo: $50 off laptops $699+", discountType: "amount", discountValue: 5000, minSpendCents: 69900, category: "laptops", expiresInDays: 10 },
  { retailer: "best-buy", code: "DEMO-BBYTV", title: "Demo: 5% off TVs", discountType: "percent", discountValue: 500, category: "tv-home-theater", expiresInDays: 30, status: "unverified" },
  { retailer: "best-buy", code: null, title: "Demo: Open-box deals up to 20% off", discountType: "other", expiresInDays: null },
  { retailer: "target", code: "DEMO-TGT20", title: "Demo: 20% off toys", discountType: "percent", discountValue: 2000, category: "toys", expiresInDays: 5 },
  { retailer: "target", code: "DEMO-TGTBOGO", title: "Demo: Buy one, get one 50% off coffee", discountType: "bogo", category: "coffee-tea", expiresInDays: 12 },
  { retailer: "target", code: "DEMO-TGTOLD", title: "Demo: $10 off $50 (expired)", discountType: "amount", discountValue: 1000, minSpendCents: 5000, expiresInDays: -2, status: "expired" },
  { retailer: "home-depot", code: "DEMO-HD25", title: "Demo: $25 off power tools $200+", discountType: "amount", discountValue: 2500, minSpendCents: 20000, category: "power-tools", expiresInDays: 18 },
  { retailer: "home-depot", code: null, title: "Demo: Free delivery on appliances $396+", discountType: "free_shipping", minSpendCents: 39600, category: "appliances", expiresInDays: null },
  { retailer: "kohls", code: "DEMO-KOHLS15", title: "Demo: 15% off sitewide", discountType: "percent", discountValue: 1500, expiresInDays: 4 },
  { retailer: "kohls", code: "DEMO-KOHLS10", title: "Demo: $10 off $50 small appliances", discountType: "amount", discountValue: 1000, minSpendCents: 5000, category: "small-kitchen-appliances", expiresInDays: 9, status: "unverified" },
];

export async function seedCoupons(prisma: PrismaClient, now = new Date()): Promise<{ coupons: number; checkoutConfigs: number }> {
  await prisma.coupon.deleteMany({ where: { source: "demo" } });
  const retailers = await prisma.retailer.findMany();
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  let coupons = 0;
  for (const d of COUPONS) {
    const r = retailers.find((x) => x.slug === d.retailer);
    if (!r) continue;
    const c = await prisma.coupon.create({
      data: {
        retailerId: r.id,
        code: d.code,
        title: d.title,
        description: d.description ?? "Demo coupon for development — not a real retailer offer.",
        discountType: d.discountType,
        discountValue: d.discountValue ?? null,
        minSpendCents: d.minSpendCents ?? null,
        categoryId: d.category ? (categories.find((c) => c.slug === d.category)?.id ?? null) : null,
        startsAt: new Date(now.getTime() - 3 * DAY_MS),
        expiresAt: d.expiresInDays === null ? null : new Date(now.getTime() + d.expiresInDays * DAY_MS),
        source: "demo",
        status: d.status ?? "active",
      },
    });
    await prisma.couponEvent.create({ data: { couponId: c.id, retailerId: r.id, type: "created", channel: "system", note: "demo seed" } });
    coupons++;
  }
  let checkoutConfigs = 0;
  for (const r of retailers) {
    if (!r.isActive) continue;
    await prisma.retailerCheckoutConfig.upsert({
      where: { retailerId: r.id },
      update: {},
      create: { retailerId: r.id, hostPatterns: [r.domain, `*.${r.domain}`], checkoutUrlPatterns: [], enabled: false },
    });
    checkoutConfigs++;
  }
  return { coupons, checkoutConfigs };
}
