/**
 * WhichLess (formerly Pricora) dev seed. Deterministic (seeded RNG) except timestamps, which are relative to "now" so data looks fresh.
 *
 * WARNING: resets catalog, travel and community tables (TRUNCATE ... CASCADE). Users are upserted.
 * Dev/staging only — refuses to run when NODE_ENV=production.
 *
 *   pnpm db:seed
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import { createRng, slugify } from "@pricora/utils";
import { BRAND_SITES } from "../src/brand-sites";
import { createPrismaClient, type Prisma } from "../src/index";
import { AIRLINES, AIRPORTS, CATEGORIES, HOTELS, RETAILERS, type SeedRetailer } from "./seed/reference";
import { PRODUCTS } from "./seed/products";
import { seedCoupons } from "./seed/coupons";
import { seedCatalogExpansion } from "./seed/catalog-seed";
import { demoUpc, offerSeries, pick, productIndex, randInt } from "./seed/history";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

if (process.env["NODE_ENV"] === "production") {
  console.error("Refusing to run the demo seed with NODE_ENV=production.");
  process.exit(1);
}

/** Documented in .env.example. Local development only. */
const DEV_DEFAULT_PASSWORD = "PricoraDev!2026";

const prisma = createPrismaClient();
const rng = createRng("pricora-seed-v1");
const now = new Date();
const DAY_MS = 86_400_000;

async function reset(): Promise<void> {
  const tables = [
    "price_history", "price_anomalies", "affiliate_clicks", "affiliate_conversions", "commissions", "cashback_transactions",
    "product_matches", "match_reviews", "deals", "deal_votes", "deal_comments", "offers", "retailer_feeds",
    "data_ingestion_jobs", "integration_errors", "retailer_integrations", "affiliate_programs", "sponsored_campaigns",
    "product_images", "product_attributes", "product_identifiers", "product_variants", "favorites", "price_alerts",
    "notifications", "shopping_list_items", "recently_viewed", "products", "brands", "categories", "retailers",
    "coupon_events", "coupon_votes", "coupon_follows", "coupons", "retailer_checkout_configs", "hotel_rates", "hotels", "flight_offers", "flight_searches", "airports", "airlines",
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

async function seedCategories(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const parent = await prisma.category.create({
      data: { slug: c.slug, name: c.name, icon: c.icon, path: c.slug, depth: 0, sortOrder: i },
    });
    ids.set(c.slug, parent.id);
    for (const [j, child] of (c.children ?? []).entries()) {
      const created = await prisma.category.create({
        data: { slug: child.slug, name: child.name, parentId: parent.id, path: `${c.slug}/${child.slug}`, depth: 1, sortOrder: j },
      });
      ids.set(child.slug, created.id);
    }
  }
  return ids;
}

async function seedRetailers(): Promise<Map<string, { id: string; def: SeedRetailer }>> {
  const map = new Map<string, { id: string; def: SeedRetailer }>();
  for (const r of RETAILERS) {
    const created = await prisma.retailer.create({
      data: {
        slug: r.slug,
        name: r.name,
        domain: r.domain,
        websiteUrl: `https://www.${r.domain}`,
        brandColor: r.brandColor,
        integrationStatus: "pending_configuration",
        freeShippingThresholdCents: r.freeShippingThresholdCents,
        membershipName: r.membershipName,
        membershipKey: r.membershipKey,
        allowedRedirectHosts: [r.domain, `www.${r.domain}`],
        affiliateDisclosure: `${r.name} links may be affiliate links. WhichLess may earn a commission at no extra cost to you.`,
      },
    });
    if (r.officialApi) {
      await prisma.retailerIntegration.create({
        data: { retailerId: created.id, kind: r.officialApi.kind, provider: r.officialApi.provider, status: "pending_configuration" },
      });
    }
    map.set(r.slug, { id: created.id, def: r });
  }
  return map;
}

async function seedBrands(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const names = [...new Set(PRODUCTS.map((p) => p.brand))].sort();
  for (const name of names) {
    const b = await prisma.brand.create({ data: { name, slug: slugify(name), website: BRAND_SITES[name] ?? null } });
    ids.set(name, b.id);
  }
  return ids;
}

const PICKUP_RETAILERS = new Set(["best-buy", "target", "walmart", "home-depot", "lowes", "kohls", "dicks", "staples"]);

function shippingFor(r: SeedRetailer, priceCents: number): number | null {
  if (rng() < 0.06) return null; // unknown — rendered as "shipping unknown"
  if (r.freeShippingThresholdCents !== null) {
    return priceCents >= r.freeShippingThresholdCents ? 0 : pick(rng, [599, 699, 799]);
  }
  if (r.slug === "costco") return 0;
  if (r.slug === "ebay") return pick(rng, [0, 0, 499, 899]);
  return priceCents >= 4900 ? 0 : pick(rng, [499, 599, 795]);
}

async function seedCatalog(
  categoryIds: Map<string, string>,
  brandIds: Map<string, string>,
  retailers: Map<string, { id: string; def: SeedRetailer }>,
): Promise<{ products: number; offers: number; history: number }> {
  const usedSlugs = new Set<string>();
  let offerCount = 0;
  let historyCount = 0;
  const historyBuffer: Prisma.PriceHistoryCreateManyInput[] = [];

  const flush = async (force: boolean) => {
    if (historyBuffer.length >= 5000 || (force && historyBuffer.length > 0)) {
      const chunk = historyBuffer.splice(0, historyBuffer.length);
      await prisma.priceHistory.createMany({ data: chunk });
      historyCount += chunk.length;
    }
  };

  for (const [pi, p] of PRODUCTS.entries()) {
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) throw new Error(`Unknown category ${p.category} for ${p.title}`);
    let slug = slugify(p.title);
    while (usedSlugs.has(slug)) slug = `${slug}-${pi}`;
    usedSlugs.add(slug);

    const condition = p.condition ?? "new";
    const product = await prisma.product.create({
      data: {
        slug,
        title: p.title,
        description: p.description,
        brandId: brandIds.get(p.brand) ?? null,
        categoryId,
        model: p.model,
        mpn: p.model,
        condition,
        status: "active",
        isDemo: true,
        identifiers: {
          create: [
            { type: "UPC", value: demoUpc(100000 + pi) },
            ...(p.model ? [{ type: "MPN" as const, value: p.model }] : []),
          ],
        },
        attributes: {
          create: [
            ...p.attrs.map(([group, name, value], i) => ({ group, name, value, sortOrder: i })),
            { group: "General", name: "Condition", value: condition.replace("_", " "), sortOrder: 99 },
          ],
        },
        ...(p.family ? { variant: { create: { familyKey: p.family.key, label: p.family.label, attributes: p.family.attrs } } } : {}),
      },
    });

    const days = randInt(rng, 90, 200);
    const index = productIndex(rng, days, p.pattern);
    const msrpCents = Math.round(p.price * 100);

    const retailerSlugs = p.retailers.slice(0, 5);
    for (const rSlug of retailerSlugs) {
      const r = retailers.get(rSlug);
      if (!r) throw new Error(`Unknown retailer ${rSlug} for ${p.title}`);
      const def = r.def;
      const factor = def.slug === "apple" ? 1 : def.slug === "costco" ? 0.93 + rng() * 0.04 : 0.94 + rng() * 0.08;
      const series = offerSeries({
        rng,
        days,
        now,
        baseCents: Math.round(msrpCents * factor),
        index,
        roundDollars: def.roundDollars === true,
        observeProbability: 0.85,
      });
      const last = series[series.length - 1];
      if (!last) continue;
      const shippingCents = shippingFor(def, last.priceCents);
      const listPriceCents =
        p.pattern === "hike_then_sale"
          ? Math.round((msrpCents * 1.35) / 100) * 100 - 1
          : condition === "new" && last.priceCents < msrpCents
            ? msrpCents
            : null;
      const daysMin = randInt(rng, 1, 4);

      const offer = await prisma.offer.create({
        data: {
          productId: product.id,
          retailerId: r.id,
          retailerSku: `DEMO-${def.slug.toUpperCase()}-${String(pi + 1).padStart(4, "0")}`,
          title: p.title,
          url: def.searchUrl.replace("{q}", encodeURIComponent(p.title)),
          condition,
          priceCents: last.priceCents,
          listPriceCents,
          shippingCents,
          shippingDaysMin: daysMin,
          shippingDaysMax: daysMin + randInt(rng, 1, 4),
          pickupAvailable: PICKUP_RETAILERS.has(def.slug) && rng() < 0.6,
          currency: "USD",
          stock: last.inStock ? (rng() < 0.1 ? "low_stock" : "in_stock") : "out_of_stock",
          source: "demo",
          firstSeenAt: series[0]?.observedAt ?? now,
          lastCheckedAt: last.observedAt,
          lastChangedAt: [...series].reverse().find((pt, i, arr) => arr[i + 1]?.priceCents !== pt.priceCents)?.observedAt ?? last.observedAt,
        },
      });
      offerCount++;

      for (const pt of series) {
        historyBuffer.push({
          offerId: offer.id,
          observedAt: pt.observedAt,
          productId: product.id,
          retailerId: r.id,
          priceCents: pt.priceCents,
          shippingCents,
          currency: "USD",
          stock: pt.inStock ? "in_stock" : "out_of_stock",
          source: "demo",
        });
      }
      await flush(false);
    }
  }
  await flush(true);
  return { products: PRODUCTS.length, offers: offerCount, history: historyCount };
}

async function seedTravel(): Promise<{ airports: number; airlines: number; hotels: number; rates: number }> {
  await prisma.airport.createMany({
    data: AIRPORTS.map(([iata, icao, name, city, region, country, lat, lon, timezone, searchRank]) => ({
      iata, icao, name, city, region, country, lat, lon, timezone, searchRank,
    })),
  });
  await prisma.airline.createMany({
    data: AIRLINES.map(([iata, icao, name, country]) => ({ iata, icao, name, country })),
  });

  let rates = 0;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const windows: [number, number][] = [[14, 2], [30, 3], [45, 2]];
  const rooms = [
    { roomName: "Standard King", mult: 1, boardType: "room_only" as const, refundable: false },
    { roomName: "Standard Queen, 2 Beds", mult: 1.08, boardType: "room_only" as const, refundable: true },
    { roomName: "Deluxe King with Breakfast", mult: 1.32, boardType: "breakfast" as const, refundable: true },
  ];
  for (const h of HOTELS) {
    const hotel = await prisma.hotel.create({
      data: {
        slug: slugify(`${h.name} ${h.city}`),
        name: h.name,
        starRating: h.stars,
        address: h.address,
        city: h.city,
        region: h.region,
        country: "US",
        lat: h.lat,
        lon: h.lon,
        amenities: h.amenities,
        description: `Demo listing for ${h.city}. Not a real property — rates are illustrative only.`,
        checkinTime: "15:00",
        checkoutTime: "11:00",
        source: "demo",
      },
    });
    for (const [offset, nights] of windows) {
      const checkin = new Date(todayUtc + offset * DAY_MS);
      const checkout = new Date(todayUtc + (offset + nights) * DAY_MS);
      for (const room of rooms) {
        const nightly = Math.round((h.baseNightlyCents * room.mult * (0.92 + rng() * 0.16)) / 100) * 100 - 1;
        const subtotal = nightly * nights;
        const taxes = Math.round(subtotal * 0.15);
        await prisma.hotelRate.create({
          data: {
            hotelId: hotel.id,
            provider: "demo",
            roomName: room.roomName,
            boardType: room.boardType,
            refundable: room.refundable,
            checkin,
            checkout,
            guests: 2,
            rooms: 1,
            nightlyPriceCents: nightly,
            totalPriceCents: subtotal + taxes,
            taxesAndFeesCents: taxes,
            currency: "USD",
            source: "demo",
          },
        });
        rates++;
      }
    }
  }
  return { airports: AIRPORTS.length, airlines: AIRLINES.length, hotels: HOTELS.length, rates };
}

async function seedUsers(): Promise<string[]> {
  const password = process.env["SEED_ADMIN_PASSWORD"]?.trim() || DEV_DEFAULT_PASSWORD;
  const passwordHash = await hash(password); // argon2id (library default)
  const users = [
    { email: "admin@pricora.local", name: "WhichLess Admin", role: "ADMIN" as const },
    { email: "editor@pricora.local", name: "Demo Editor", role: "EDITOR" as const },
    { email: "analyst@pricora.local", name: "Demo Analyst", role: "ANALYST" as const },
    { email: "merchant@pricora.local", name: "Demo Merchant", role: "MERCHANT" as const },
    { email: "user@pricora.local", name: "Demo Shopper", role: "USER" as const },
  ];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash, status: "active" },
      create: { email: u.email, name: u.name, role: u.role, passwordHash, emailVerifiedAt: now },
    });
    await prisma.userPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, zip: u.role === "USER" ? "10001" : null },
    });
    if (u.role === "MERCHANT") {
      // Unlisted demo store so the merchant portal (feed upload, offers) can be exercised end-to-end.
      // isActive=false keeps it out of public retailer lists; offers stay inactive until the account is verified.
      const store = await prisma.retailer.upsert({
        where: { slug: "demo-merchant-store" },
        update: {},
        create: {
          slug: "demo-merchant-store",
          name: "Demo Merchant Store",
          domain: "demo-merchant.example",
          websiteUrl: "https://www.demo-merchant.example",
          brandColor: "#5B6770",
          integrationStatus: "pending_configuration",
          isActive: false,
          allowedRedirectHosts: ["demo-merchant.example", "www.demo-merchant.example"],
        },
      });
      await prisma.merchantAccount.upsert({
        where: { userId: user.id },
        update: { retailerId: store.id },
        create: {
          retailerId: store.id,
          userId: user.id,
          companyName: "Demo Merchant Co.",
          contactEmail: u.email,
          website: null,
          verificationStatus: "pending",
        },
      });
    }
  }
  return users.map((u) => `${u.email} (${u.role})`);
}

async function seedFlags(): Promise<void> {
  const flags = [
    { key: "community.deals", description: "Community deal posts, votes and comments", enabled: false },
    { key: "assistant.enabled", description: "AI shopping assistant (requires ANTHROPIC_API_KEY)", enabled: false },
    { key: "cashback.payouts", description: "Cashback payouts — disabled until legal review", enabled: false },
    { key: "travel.flights", description: "Flight search UI", enabled: true },
    { key: "travel.hotels", description: "Hotel search UI", enabled: true },
    { key: "basket.optimizer", description: "Smart basket optimizer", enabled: true },
    { key: "sponsored.placements", description: "Labeled sponsored placements", enabled: false },
  ];
  for (const f of flags) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      update: { description: f.description },
      create: { ...f, rolloutPercent: f.enabled ? 100 : 0 },
    });
  }
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log("Seeding WhichLess demo data…");
  await reset();
  const categoryIds = await seedCategories();
  const retailers = await seedRetailers();
  const brandIds = await seedBrands();
  const catalog = await seedCatalog(categoryIds, brandIds, retailers);
  const travel = await seedTravel();
  const users = await seedUsers();
  const couponSeed = await seedCoupons(prisma);
  const expansion = await seedCatalogExpansion(prisma, { now });
  console.log(`  catalog expansion: ${expansion.products} products, ${expansion.offers} offers, ${expansion.history} history rows (demo)`);
  await seedFlags();

  console.log(
    [
      `  categories: ${categoryIds.size}`,
      `  retailers:  ${retailers.size}`,
      `  brands:     ${brandIds.size}`,
      `  products:   ${catalog.products} (demo)`,
      `  offers:     ${catalog.offers} (source=demo)`,
      `  history:    ${catalog.history} price observations`,
      `  airports:   ${travel.airports}, airlines: ${travel.airlines}`,
      `  hotels:     ${travel.hotels} (demo), rates: ${travel.rates}`,
      `  coupons:    ${couponSeed.coupons} (demo, codes prefixed DEMO), checkout configs: ${couponSeed.checkoutConfigs} (disabled, empty)`,
      `  users:      ${users.join(", ")}`,
      `Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    ].join("\n"),
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
