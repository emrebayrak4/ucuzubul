/**
 * Grocery / household demo catalog + demo store locations + per-store inventory + demo local sellers.
 * Idempotent (upserts by slug / sku / externalId). Everything is source = "demo" / isDemo = true and labeled in the UI.
 * Store and shop names are prefixed "Demo"; coordinates are ZIP centroids (approximate).
 */
import { slugify } from "@pricora/utils";
import { parseNetQuantity } from "../../../algorithms/src/normalize/netQuantity";
import type { PrismaClient, Prisma } from "../../src/index";
import { RETAILERS } from "./reference";
import {
  CHAIN_LOCATIONS,
  CLUB,
  DEMO_LOCAL_SHOPS,
  DEMO_PENDING_APPLICATIONS,
  GROCERY_CATEGORIES,
  GROCERY_FACETS,
  GROCERY_ITEMS,
  GROCERY_RETAILERS,
  PHARMACY_RETAILERS,
  UNIT_PRICING_ROOTS,
  type GroceryItem,
} from "./grocery-data";

const NEW_RETAILERS = [
  { slug: "kroger", name: "Kroger", domain: "kroger.com", brandColor: "#134BA0", searchUrl: "https://www.kroger.com/search?query={q}", membershipName: "Boost", membershipKey: "kroger-boost" },
  { slug: "sams-club", name: "Sam's Club", domain: "samsclub.com", brandColor: "#0067A0", searchUrl: "https://www.samsclub.com/s/{q}", membershipName: "Sam's Club Membership", membershipKey: "sams-club" },
  { slug: "walgreens", name: "Walgreens", domain: "walgreens.com", brandColor: "#E31837", searchUrl: "https://www.walgreens.com/search/results.jsp?Ntt={q}", membershipName: "myWalgreens", membershipKey: null },
  { slug: "cvs", name: "CVS Pharmacy", domain: "cvs.com", brandColor: "#CC0000", searchUrl: "https://www.cvs.com/search?searchTerm={q}", membershipName: "ExtraCare", membershipKey: null },
  { slug: "etsy", name: "Etsy", domain: "etsy.com", brandColor: "#F1641E", searchUrl: "https://www.etsy.com/search?q={q}", membershipName: null, membershipKey: null },
] as const;

const MARKETPLACES = ["ebay", "back-market", "etsy"];
const PICKUP = new Set(["walmart", "target", "kroger", "walgreens", "cvs", "costco", "sams-club"]);

/** Deterministic 0..1 from a string (FNV-1a). */
function unit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Shelf-style price: x.x9 cents. */
function shelf(cents: number): number {
  const c = Math.max(99, Math.round(cents));
  return Math.floor(c / 10) * 10 + 9;
}

function retailersFor(item: GroceryItem): string[] {
  if (item.retailers) return item.retailers;
  if (item.category === "personal-care" || item.category === "diapers" || item.category === "wipes") return PHARMACY_RETAILERS;
  return GROCERY_RETAILERS;
}

const HOURS: Record<string, { day: number; open: string; close: string }[]> = {
  standard: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "07:00", close: "22:00" })),
  late: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "07:00", close: "23:59" })),
  pharmacy: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: day === 0 ? "09:00" : "08:00", close: day === 0 ? "18:00" : "21:00" })),
};

export interface GrocerySeedResult {
  products: number;
  offers: number;
  locations: number;
  inventory: number;
  localShops: number;
}

export async function seedGroceryLocal(prisma: PrismaClient, opts: { log?: (m: string) => void; webOrigin?: string } = {}): Promise<GrocerySeedResult> {
  const log = opts.log ?? (() => undefined);
  const web = (opts.webOrigin ?? process.env["WEB_ORIGIN"] ?? "http://localhost:3100").replace(/\/$/, "");

  // 1) Retailers
  for (const r of NEW_RETAILERS) {
    await prisma.retailer.upsert({
      where: { slug: r.slug },
      update: { kind: MARKETPLACES.includes(r.slug) ? "marketplace" : "national" },
      create: {
        slug: r.slug,
        name: r.name,
        domain: r.domain,
        websiteUrl: `https://www.${r.domain}`,
        brandColor: r.brandColor,
        membershipName: r.membershipName,
        membershipKey: r.membershipKey,
        allowedRedirectHosts: [`www.${r.domain}`],
        kind: MARKETPLACES.includes(r.slug) ? "marketplace" : "national",
      },
    });
  }
  await prisma.retailer.updateMany({ where: { slug: { in: MARKETPLACES } }, data: { kind: "marketplace" } });
  const searchUrl = new Map<string, string>([...RETAILERS.map((r) => [r.slug, r.searchUrl] as const), ...NEW_RETAILERS.map((r) => [r.slug, r.searchUrl] as const)]);
  const retailerRows = await prisma.retailer.findMany({ select: { id: true, slug: true, name: true } });
  const retailerBySlug = new Map(retailerRows.map((r) => [r.slug, r]));
  log(`retailers ok (${NEW_RETAILERS.length} grocery/pharmacy/marketplace upserted)`);

  // 2) Categories
  for (const c of GROCERY_CATEGORIES) {
    const parent = c.parent ? await prisma.category.findUnique({ where: { slug: c.parent } }) : null;
    if (c.parent && !parent) throw new Error(`Parent category ${c.parent} missing — run the base + catalog seed first`);
    const path = parent ? `${parent.path}/${c.slug}` : c.slug;
    const isLeaf = !GROCERY_CATEGORIES.some((x) => x.parent === c.slug);
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, ...(isLeaf ? { facets: GROCERY_FACETS as unknown as Prisma.InputJsonValue } : {}) },
      create: {
        slug: c.slug,
        name: c.name,
        parentId: parent?.id ?? null,
        path,
        depth: parent ? parent.depth + 1 : 0,
        icon: c.icon ?? null,
        sortOrder: 50,
        ...(isLeaf ? { facets: GROCERY_FACETS as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }
  for (const root of UNIT_PRICING_ROOTS) {
    const cat = await prisma.category.findUnique({ where: { slug: root } });
    if (!cat) continue;
    await prisma.category.updateMany({ where: { OR: [{ id: cat.id }, { path: { startsWith: `${cat.path}/` } }] }, data: { unitPricing: true } });
  }
  const categories = new Map((await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  log("categories ok");

  // 3) Products + offers
  const now = new Date();
  let offers = 0;
  const productIds = new Map<string, { id: string; title: string; retailers: string[]; prices: Map<string, number> }>();
  const families = new Map<string, { productId: string; label: string; total: number }[]>();
  for (const item of GROCERY_ITEMS) {
    const categoryId = categories.get(item.category);
    if (!categoryId) throw new Error(`Category ${item.category} missing`);
    const brandSlug = slugify(item.brand);
    const brand = await prisma.brand.upsert({ where: { slug: brandSlug }, update: {}, create: { slug: brandSlug, name: item.brand } }).catch(async () => prisma.brand.findFirstOrThrow({ where: { name: item.brand } }));
    const q = parseNetQuantity(item.title, item.basis);
    const slug = slugify(item.title).slice(0, 160);
    const data = {
      title: item.title,
      brandId: brand.id,
      categoryId,
      isDemo: true,
      status: "active" as const,
      netQuantity: q?.total ?? null,
      netUnit: q?.basis ?? null,
      packCount: q?.packCount ?? null,
      sizeLabel: q?.label ?? null,
      description: `${item.title}. Demo listing for comparison — prices are demo data, not live.`,
    };
    const product = await prisma.product.upsert({ where: { slug }, update: data, create: { slug, ...data } });
    await prisma.productAttribute.deleteMany({ where: { productId: product.id } });
    const attrs: { name: string; value: string; group: string | null; sortOrder: number }[] = [];
    if (q) attrs.push({ name: "Size", value: q.label, group: null, sortOrder: 0 });
    if (q && q.packCount > 1) attrs.push({ name: "Pack count", value: `${q.packCount}-pack`, group: null, sortOrder: 1 });
    (item.dietary ?? []).forEach((d, i) => attrs.push({ name: "Dietary", value: d, group: null, sortOrder: 2 + i }));
    for (const [k, v] of Object.entries(item.attrs ?? {})) attrs.push({ name: k, value: v, group: "Details", sortOrder: 20 });
    attrs.push({ name: "Brand", value: item.brand, group: "General", sortOrder: 30 });
    await prisma.productAttribute.createMany({ data: attrs.map((a) => ({ ...a, productId: product.id })) });
    if (item.family && q) {
      const list = families.get(item.family) ?? [];
      list.push({ productId: product.id, label: q.label, total: q.total });
      families.set(item.family, list);
    }

    const prices = new Map<string, number>();
    const rs = retailersFor(item);
    for (const rslug of rs) {
      const r = retailerBySlug.get(rslug);
      const tpl = searchUrl.get(rslug);
      if (!r || !tpl) continue;
      // Club stores run ~8–15% cheaper per unit on club packs; others vary ±10% around the shelf price.
      const factor = CLUB.includes(rslug) ? 0.88 + unit(`${slug}:${rslug}`) * 0.07 : 0.93 + unit(`${slug}:${rslug}`) * 0.17;
      const priceCents = shelf(item.price * 100 * factor);
      prices.set(rslug, priceCents);
      const sku = `demo-grocery-${slug}`.slice(0, 180);
      const offerData = {
        productId: product.id,
        title: item.title,
        url: tpl.replace("{q}", encodeURIComponent(item.title)),
        priceCents,
        listPriceCents: null,
        shippingCents: rslug === "amazon" ? 0 : null,
        pickupAvailable: PICKUP.has(rslug),
        stock: unit(`${slug}:${rslug}:stock`) < 0.06 ? ("out_of_stock" as const) : ("in_stock" as const),
        source: "demo" as const,
        isActive: true,
        lastCheckedAt: now,
        sellerType: "retailer" as const,
      };
      await prisma.offer.upsert({
        where: { retailerId_retailerSku: { retailerId: r.id, retailerSku: sku } },
        update: offerData,
        create: { ...offerData, retailerId: r.id, retailerSku: sku, condition: "new", firstSeenAt: new Date(now.getTime() - 40 * 86_400_000) },
      });
      offers++;
    }
    productIds.set(slug, { id: product.id, title: item.title, retailers: rs, prices });
  }
  for (const [familyKey, list] of families) {
    list.sort((a, b) => a.total - b.total);
    for (const [i, m] of list.entries()) {
      await prisma.productVariant.upsert({
        where: { productId: m.productId },
        update: { familyKey: `grocery-${familyKey}`, label: m.label, attributes: { size: m.label }, sortOrder: i },
        create: { productId: m.productId, familyKey: `grocery-${familyKey}`, label: m.label, attributes: { size: m.label }, sortOrder: i },
      });
    }
  }
  log(`products ${productIds.size}, offers ${offers}, size families ${families.size}`);

  // 4) Chain store locations + per-store inventory (Kroger-style store prices vary by store)
  let locations = 0;
  let inventory = 0;
  const zipRow = async (zip: string) => prisma.zipCode.findUnique({ where: { zip }, select: { lat: true, lng: true, city: true, state: true } });
  for (const loc of CHAIN_LOCATIONS) {
    const r = retailerBySlug.get(loc.retailer);
    const z = await zipRow(loc.zip);
    if (!r || !z) continue;
    const externalId = `demo:${loc.retailer}:${loc.zip}:${slugify(loc.area)}`;
    const data = {
      name: `${r.name} · Demo store (${loc.area})`,
      address1: null,
      city: z.city,
      state: z.state,
      zip: loc.zip,
      lat: z.lat,
      lng: z.lng,
      geoPrecision: "zip_centroid",
      hours: HOURS[loc.hours ?? "standard"] as unknown as Prisma.InputJsonValue,
      pickup: true,
      deliveryRadiusMiles: loc.retailer === "costco" || loc.retailer === "sams-club" ? null : 10,
      source: "demo" as const,
      verificationStatus: "verified" as const,
      isActive: true,
    };
    const row = await prisma.storeLocation.upsert({ where: { retailerId_externalId: { retailerId: r.id, externalId } }, update: data, create: { ...data, retailerId: r.id, externalId } });
    locations++;
    for (const [slug, p] of productIds) {
      const online = p.prices.get(loc.retailer);
      if (online === undefined) continue;
      const u = unit(`${externalId}:${slug}`);
      if (u < 0.12) continue; // not carried at this store
      const storePrice = loc.retailer === "kroger" ? shelf(online * (0.95 + unit(`${externalId}:${slug}:p`) * 0.1)) : online;
      const stock = u < 0.18 ? "out_of_stock" : u < 0.3 ? "low_stock" : "in_stock";
      const inv = {
        retailerSku: `demo-grocery-${slug}`.slice(0, 180),
        priceCents: storePrice,
        stock: stock as "in_stock" | "low_stock" | "out_of_stock",
        quantity: stock === "low_stock" ? 2 : null,
        pickupToday: stock !== "out_of_stock",
        source: "demo" as const,
        lastCheckedAt: now,
      };
      await prisma.storeInventory.upsert({ where: { storeLocationId_productId: { storeLocationId: row.id, productId: p.id } }, update: inv, create: { ...inv, storeLocationId: row.id, productId: p.id } });
      inventory++;
    }
  }
  log(`chain locations ${locations}, inventory ${inventory}`);

  // 5) Demo local sellers (verified, active) — inventory only (no national offers), one with a labeled promoted listing.
  const owner = await prisma.user.upsert({
    where: { email: "demo-local-seller@example.test" },
    update: {},
    create: { email: "demo-local-seller@example.test", name: "Demo local seller", role: "MERCHANT" },
  });
  let localShops = 0;
  for (const shop of DEMO_LOCAL_SHOPS) {
    const z = await zipRow(shop.zip);
    if (!z) continue;
    const domain = `${shop.slug}.local.invalid`;
    const retailer = await prisma.retailer.upsert({
      where: { slug: shop.slug },
      update: { name: shop.name, kind: "local", isActive: true },
      create: { slug: shop.slug, name: shop.name, domain, websiteUrl: `${web}/stores/${shop.slug}`, kind: "local", isActive: true, integrationStatus: "live", brandColor: "#2F855A" },
    });
    let merchantAccountId: string | null = null;
    if (shop.sponsored) {
      const acc = await prisma.merchantAccount.upsert({
        where: { userId: owner.id },
        update: { retailerId: retailer.id, verificationStatus: "verified", isLocalSeller: true },
        create: {
          userId: owner.id,
          retailerId: retailer.id,
          companyName: shop.name,
          legalName: `${shop.name} LLC`,
          contactEmail: owner.email,
          businessPhone: "(212) 555-0100",
          businessCategory: shop.category,
          isLocalSeller: true,
          verificationStatus: "verified",
          submittedAt: new Date(now.getTime() - 20 * 86_400_000),
          reviewedAt: new Date(now.getTime() - 18 * 86_400_000),
        },
      });
      merchantAccountId = acc.id;
      const existing = await prisma.sponsoredCampaign.findFirst({ where: { merchantAccountId: acc.id, placement: "nearby" } });
      if (!existing) {
        await prisma.sponsoredCampaign.create({ data: { merchantAccountId: acc.id, retailerId: retailer.id, name: "Demo nearby promotion", status: "active", placement: "nearby", label: "Sponsored", budgetCents: 5000 } });
      }
    }
    const externalId = `demo-local:${shop.slug}`;
    const data = {
      name: shop.name,
      address1: shop.address,
      city: z.city,
      state: z.state,
      zip: shop.zip,
      lat: z.lat,
      lng: z.lng,
      geoPrecision: "zip_centroid",
      hours: HOURS["standard"] as unknown as Prisma.InputJsonValue,
      pickup: true,
      deliveryRadiusMiles: shop.deliveryRadiusMiles,
      pickupMinimumCents: shop.pickupMinimumCents,
      deliveryMinimumCents: shop.deliveryMinimumCents,
      source: "demo" as const,
      verificationStatus: "verified" as const,
      isActive: true,
      merchantAccountId,
    };
    const row = await prisma.storeLocation.upsert({ where: { retailerId_externalId: { retailerId: retailer.id, externalId } }, update: data, create: { ...data, retailerId: retailer.id, externalId } });
    localShops++;
    const pool = GROCERY_ITEMS.filter((g) => (shop.category === "pharmacy" ? ["personal-care", "diapers", "wipes", "cleaning-supplies", "paper-goods"].includes(g.category) : !(g.retailers && g.retailers.every((x) => CLUB.includes(x)))));
    for (const item of pool) {
      const slug = slugify(item.title).slice(0, 160);
      const p = productIds.get(slug);
      if (!p || unit(`${shop.slug}:${slug}`) > shop.share) continue;
      const u = unit(`${shop.slug}:${slug}:s`);
      const stock = u < 0.08 ? "out_of_stock" : u < 0.25 ? "low_stock" : "in_stock";
      const inv = {
        priceCents: shelf(item.price * 100 * shop.priceFactor),
        stock: stock as "in_stock" | "low_stock" | "out_of_stock",
        quantity: stock === "low_stock" ? 3 : stock === "in_stock" ? 6 + Math.round(u * 20) : 0,
        pickupToday: stock !== "out_of_stock",
        source: "demo" as const,
        lastCheckedAt: now,
      };
      await prisma.storeInventory.upsert({ where: { storeLocationId_productId: { storeLocationId: row.id, productId: p.id } }, update: inv, create: { ...inv, storeLocationId: row.id, productId: p.id } });
      inventory++;
    }
  }
  log(`local shops ${localShops}`);

  // 6) Pending applications for the admin moderation queue (fictional; second one has a ZIP/state mismatch on purpose).
  for (const app of DEMO_PENDING_APPLICATIONS) {
    const user = await prisma.user.upsert({ where: { email: app.email }, update: {}, create: { email: app.email, name: app.companyName, role: "MERCHANT" } });
    if (await prisma.merchantAccount.findUnique({ where: { userId: user.id } })) continue;
    const z = await zipRow(app.zip);
    if (!z) continue;
    const slug = slugify(app.companyName);
    const retailer = await prisma.retailer.upsert({
      where: { slug },
      update: {},
      create: { slug, name: app.companyName, domain: `${slug}.local.invalid`, websiteUrl: app.website ?? `${web}/stores/${slug}`, kind: "local", isActive: false },
    });
    const acc = await prisma.merchantAccount.create({
      data: {
        userId: user.id,
        retailerId: retailer.id,
        companyName: app.companyName,
        legalName: app.legalName,
        contactEmail: app.email,
        businessPhone: app.phone,
        website: app.website,
        businessCategory: app.category,
        isLocalSeller: true,
        verificationStatus: "pending",
        submittedAt: new Date(now.getTime() - 2 * 86_400_000),
      },
    });
    await prisma.storeLocation.create({
      data: {
        retailerId: retailer.id,
        merchantAccountId: acc.id,
        name: app.companyName,
        address1: app.address,
        city: app.city,
        state: app.state,
        zip: app.zip,
        lat: z.lat,
        lng: z.lng,
        geoPrecision: "zip_centroid",
        ...(app.hours ? { hours: HOURS["standard"] as unknown as Prisma.InputJsonValue } : {}),
        source: "demo",
        verificationStatus: "pending",
      },
    });
  }
  log("pending applications ok");
  return { products: productIds.size, offers, locations, inventory, localShops };
}
