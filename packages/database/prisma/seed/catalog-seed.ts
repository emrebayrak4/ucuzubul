/**
 * Catalog expansion seed (shopping): 3-level category tree with facet definitions + ~700 demo products.
 *
 * Safe to run repeatedly against a live dev DB:
 *  - never truncates; categories/brands/products are upserted by slug
 *  - only this module's demo offers (retailerSku prefix "DEMO-CAT-") and their history are replaced
 *  - travel, users, favorites, alerts, lists and coupons are untouched (product ids are stable across runs)
 * Every offer/history row is source = "demo"; products are isDemo = true (UI shows "Demo data").
 */
import { createRng, slugify } from "@pricora/utils";
import type { Prisma, PrismaClient } from "../../src/index";
import { BRAND_SITES } from "../../src/brand-sites";
import { CATALOG_TREE, flattenTree, seoTextFor } from "./catalog-tree";
import { TECH, type Entry } from "./catalog-data-tech";
import { HOME } from "./catalog-data-home";
import { demoUpc, offerSeries, pick, productIndex, randInt, type Rng } from "./history";
import type { PricePattern } from "./products";
import { RETAILERS, type SeedRetailer } from "./reference";
import { seedPaymentOptions } from "./catalog-payment-options";

const DAY_MS = 86_400_000;
const SKU_PREFIX = "DEMO-CAT-";

/** Retailer pools per top-level category (first entries are most likely). */
const POOLS: Record<string, string[]> = {
  electronics: ["amazon", "best-buy", "walmart", "target", "costco", "bh-photo", "ebay"],
  computers: ["amazon", "best-buy", "newegg", "walmart", "bh-photo", "costco", "ebay"],
  smartphones: ["amazon", "best-buy", "walmart", "target", "ebay", "back-market", "costco"],
  gaming: ["amazon", "best-buy", "gamestop", "walmart", "target", "ebay"],
  "home-kitchen": ["amazon", "walmart", "target", "kohls", "macys", "wayfair", "costco", "best-buy"],
  appliances: ["home-depot", "lowes", "best-buy", "costco", "amazon", "walmart"],
  fashion: ["amazon", "nordstrom", "macys", "kohls", "dicks", "target"],
  "beauty-personal-care": ["ulta", "sephora", "amazon", "target", "walmart", "best-buy"],
  "sports-outdoors": ["dicks", "amazon", "walmart", "target", "costco", "best-buy"],
  automotive: ["amazon", "walmart", "best-buy", "home-depot", "lowes"],
  "baby-kids": ["amazon", "target", "walmart", "costco", "kohls"],
  toys: ["amazon", "target", "walmart", "kohls", "best-buy"],
  grocery: ["amazon", "walmart", "target", "costco"],
  "pet-supplies": ["chewy", "amazon", "walmart", "target", "costco"],
  "office-supplies": ["staples", "amazon", "best-buy", "walmart", "wayfair", "costco"],
  "tools-home-improvement": ["home-depot", "lowes", "amazon", "walmart", "best-buy", "target"],
};

/** Attribute → spec-table group. Unlisted names go to "Specifications". */
const GROUP: Record<string, string> = {
  "Screen size": "Display", "Panel type": "Display", Resolution: "Display", "Refresh rate": "Display", HDR: "Display", Curved: "Display",
  "Adaptive sync": "Display", "Case size": "Display",
  "Processor brand": "Performance", Processor: "Performance", Graphics: "Performance", RAM: "Performance", Cores: "Performance",
  Socket: "Performance", "Boost clock": "Performance", "Integrated graphics": "Performance", "GPU chipset": "Performance",
  "Chipset brand": "Performance", "Video memory": "Performance", "Read speed": "Performance",
  Storage: "Storage", Capacity: "Capacity",
  Connection: "Connectivity", Connectivity: "Connectivity", Network: "Connectivity", Carrier: "Connectivity", "Wi-Fi standard": "Connectivity",
  "HDMI 2.1 ports": "Connectivity", Interface: "Connectivity",
  "Battery life": "Battery", Runtime: "Battery",
  Color: "Design", Finish: "Design", Material: "Design", Weight: "Design", "Form factor": "Design",
  "Operating system": "Software", "Smart platform": "Software", Platform: "Software", Ecosystem: "Software",
};

const PATTERNS: PricePattern[] = ["stable", "stable", "sale", "sale", "recent_drop", "recent_drop", "decline", "hike_then_sale"];

/** Base-seed products (prisma/seed/products.ts) → leaf category + normalized facet attributes. Matched by title substring. */
const BASE_ENRICH: [title: string, leaf: string, specs: string][] = [
  ["Sony WH-1000XM5", "over-ear-headphones", "Form factor=Over-ear|Noise cancellation=Active (ANC)|Connection=Bluetooth 5.2|Battery life=30 hours|Water resistance=None|Color=Black"],
  ["AirPods Pro 2", "wireless-earbuds", "Form factor=In-ear|Noise cancellation=Active (ANC)|Connection=Bluetooth 5.3|Battery life=6 hours|Water resistance=IP54|Color=White"],
  ["Bose QuietComfort Ultra Headphones", "over-ear-headphones", "Form factor=Over-ear|Noise cancellation=Active (ANC)|Connection=Bluetooth 5.3|Battery life=24 hours|Water resistance=None|Color=Black"],
  ["JBL Flip 6", "bluetooth-speakers", "Size class=Portable|Water resistance=IP67|Battery life=12 hours|Color=Black"],
  ["Sonos Arc Ultra", "soundbars", "Channels=9.1.4|Dolby Atmos=Yes|Subwoofer=Sold separately|Connection=HDMI eARC, Wi-Fi, Bluetooth"],
  ["Samsung 65\" Class OLED S90D", "oled-tvs", "Screen size=65 in|Panel type=QD-OLED|Resolution=4K|Refresh rate=144 Hz|Smart platform=Tizen|Model year=2024"],
  ["LG 55\" Class OLED evo C4", "oled-tvs", "Screen size=55 in|Panel type=OLED|Resolution=4K|Refresh rate=144 Hz|Smart platform=webOS|Model year=2024"],
  ["TCL 65\" Class QM7", "qled-mini-led-tvs", "Screen size=65 in|Panel type=Mini-LED|Resolution=4K|Refresh rate=144 Hz|Smart platform=Google TV|Model year=2024"],
  ["Apple Watch Series 10", "smartwatches", "Case size=42 mm|Compatibility=iPhone|GPS=Yes|Cellular=No|Battery life=18 hours"],
  ["Garmin Forerunner 265", "smartwatches", "Case size=46 mm|Compatibility=iPhone & Android|GPS=Yes|Cellular=No|Battery life=312 hours"],
  ["Fitbit Charge 6", "fitness-trackers", "Compatibility=iPhone & Android|GPS=Built-in|Cellular=No|Battery life=168 hours"],
  ["Canon EOS R50", "mirrorless-cameras", "Sensor format=APS-C|Megapixels=24 MP|Lens mount=Canon RF|Max video=4K 30p"],
  ["GoPro HERO13", "action-cameras", "Max video=5.3K 60p|Megapixels=27 MP|Waterproof depth=33 ft"],
  ["MacBook Air 13\" (M3, 2024) 8GB", "macbooks", "Processor brand=Apple|Processor=Apple M3|Graphics=Apple M3 8-core GPU|RAM=8 GB|Storage=256 GB|Screen size=13.6 in|Refresh rate=60 Hz|Operating system=macOS"],
  ["MacBook Air 13\" (M3, 2024) 16GB", "macbooks", "Processor brand=Apple|Processor=Apple M3|Graphics=Apple M3 10-core GPU|RAM=16 GB|Storage=512 GB|Screen size=13.6 in|Refresh rate=60 Hz|Operating system=macOS"],
  ["Dell XPS 13 9340", "ultrabooks", "Processor brand=Intel|Processor=Intel Core Ultra 7 155H|Graphics=Intel Arc|RAM=16 GB|Storage=512 GB|Screen size=13.4 in|Refresh rate=120 Hz|Operating system=Windows 11 Home"],
  ["Dell 27 4K UHD USB-C Monitor", "4k-monitors", "Screen size=27 in|Resolution=4K|Refresh rate=60 Hz|Panel type=IPS|Curved=Flat|Adaptive sync=FreeSync"],
  ["MX Master 3S", "mice", "Connection=Wireless (Bluetooth / Logi Bolt)|Designed for=Productivity|Weight=141 g"],
  ["MX Keys S", "keyboards", "Connection=Wireless (Bluetooth / Logi Bolt)|Switch type=Scissor|Layout=Full-size|Backlight=White"],
  ["Samsung T7 Portable SSD", "external-ssds", "Capacity=1 TB|Interface=USB 3.2 Gen 2|Drive type=SSD"],
  ["iPhone 16 Pro 128GB", "iphones", "Storage=128 GB|Color=Black|Carrier=Unlocked|Screen size=6.3 in|Operating system=iOS|RAM=8 GB|Network=5G"],
  ["iPhone 16 Pro 256GB", "iphones", "Storage=256 GB|Color=Black|Carrier=Unlocked|Screen size=6.3 in|Operating system=iOS|RAM=8 GB|Network=5G"],
  ["iPhone 15 128GB, Black", "iphones", "Storage=128 GB|Color=Black|Carrier=Unlocked|Screen size=6.1 in|Operating system=iOS|RAM=6 GB|Network=5G"],
  ["Galaxy S24 Ultra", "samsung-galaxy-phones", "Storage=256 GB|Color=Black|Carrier=Unlocked|Screen size=6.8 in|Operating system=Android|RAM=12 GB|Network=5G"],
  ["Pixel 9 128GB, Obsidian", "google-pixel-phones", "Storage=128 GB|Color=Black|Carrier=Unlocked|Screen size=6.3 in|Operating system=Android|RAM=12 GB|Network=5G"],
  ["Galaxy S23 128GB", "samsung-galaxy-phones", "Storage=128 GB|Color=Black|Carrier=Unlocked|Screen size=6.1 in|Operating system=Android|RAM=8 GB|Network=5G"],
  ["Apple 20W USB-C Power Adapter", "chargers-power-banks", "Accessory type=Wall charger|Output power=20 W|MagSafe=No|Compatibility=Universal USB-C"],
  ["Anker Nano Power Bank", "chargers-power-banks", "Accessory type=Power bank|Output power=30 W|MagSafe=No|Compatibility=Universal USB-C"],
  ["PlayStation 5 Slim Console", "game-consoles", "Platform=PlayStation 5|Storage=1 TB|Edition=Disc"],
  ["Nintendo Switch — OLED", "game-consoles", "Platform=Nintendo Switch|Storage=64 GB|Edition=OLED"],
  ["Xbox Series X 1TB", "game-consoles", "Platform=Xbox Series X/S|Storage=1 TB|Edition=Disc"],
  ["Meta Quest 3S", "vr-headsets", "Platform=Meta Horizon OS|Storage=128 GB|Edition=Standard"],
  ["DualSense Wireless Controller, White", "controllers", "Platform=PlayStation 5|Connection=Wireless (Bluetooth)|Color=White"],
  ["Xbox Wireless Controller, Carbon Black", "controllers", "Platform=Xbox / PC|Connection=Wireless (Xbox Wireless / Bluetooth)|Color=Carbon Black"],
  ["Tears of the Kingdom", "switch-games", "Platform=Nintendo Switch|ESRB rating=E10+|Genre=Action-adventure|Edition=Standard"],
  ["Ninja AF101", "air-fryers", "Capacity=4 qt|Air fryer type=Basket|Baskets=1"],
  ["Lodge 10.25\" Cast Iron Skillet", "skillets", "Material=Cast iron|Pieces=1|Induction compatible=Yes|Oven safe to=650 °F"],
  ["ROG Zephyrus G14 (2024)", "gaming-laptops", "Processor brand=AMD|Processor=AMD Ryzen 9 8945HS|Graphics=NVIDIA GeForce RTX 4060|RAM=16 GB|Storage=1 TB|Screen size=14 in|Refresh rate=120 Hz|Operating system=Windows 11 Home"],
  ["HP Envy x360 14\" 2-in-1 Laptop, Intel Core Ultra 5", "2-in-1-laptops", "Processor brand=Intel|Processor=Intel Core Ultra 5 125U|Graphics=Intel Graphics|RAM=16 GB|Storage=512 GB|Screen size=14 in|Refresh rate=60 Hz|Operating system=Windows 11 Home"],
  ["MacBook Air 13\" (M2) 8GB", "macbooks", "Processor brand=Apple|Processor=Apple M2|Graphics=Apple M2 8-core GPU|RAM=8 GB|Storage=256 GB|Screen size=13.6 in|Refresh rate=60 Hz|Operating system=macOS"],
  ["IdeaPad Slim 3 15.6\"", "ultrabooks", "Processor brand=AMD|Processor=AMD Ryzen 5 7520U|Graphics=AMD Radeon 610M|RAM=8 GB|Storage=512 GB|Screen size=15.6 in|Refresh rate=60 Hz|Operating system=Windows 11 Home"],
  ["LG 27\" UltraGear QHD 180Hz", "gaming-monitors", "Screen size=27 in|Resolution=1440p|Refresh rate=180 Hz|Panel type=IPS|Curved=Flat|Adaptive sync=G-SYNC Compatible"],
  ["Milwaukee M18 FUEL 1/2\" Hammer Drill", "drills-drivers", "Voltage=18 V|Battery included=Yes (2)|Motor=Brushless|Battery platform=Milwaukee M18"],
  ["Galaxy Tab S9 FE", "android-tablets", "Storage=128 GB|Screen size=10.9 in|Connectivity=Wi-Fi|Operating system=Android|Color=Gray"],
  ["iPad (10th Generation)", "ipads", "Storage=64 GB|Screen size=10.9 in|Connectivity=Wi-Fi|Operating system=iPadOS|Color=Blue"],
  ["iPad Air 11\" (M2)", "ipads", "Storage=128 GB|Screen size=11 in|Connectivity=Wi-Fi|Operating system=iPadOS|Color=Space Gray"],
  ["Instant Pot Duo", "small-kitchen-appliances", "Capacity=6 qt"],
  ["KitchenAid Artisan Series 5 Qt", "stand-mixers", "Bowl size=5 qt|Power=325 W|Color=Empire Red"],
  ["Vitamix 5200", "blenders", "Blender type=Full-size|Power=1380 W|Capacity=64 oz"],
  ["Keurig K-Elite", "single-serve-coffee", "Machine type=Pod (K-Cup)|Milk frothing=None|Built-in grinder=No"],
  ["Breville Barista Express Espresso Machine", "espresso-machines", "Machine type=Semi-automatic espresso|Milk frothing=Steam wand|Built-in grinder=Yes"],
  ["Dyson V15 Detect", "cordless-stick-vacuums", "Vacuum type=Cordless stick|Self-emptying=No|Mopping=No|Runtime=60 min|Power source=Battery"],
  ["Shark Navigator Lift-Away NV352", "upright-vacuums", "Vacuum type=Upright|Self-emptying=No|Mopping=No|Power source=Corded"],
  ["Roomba Combo Essential", "robot-vacuums", "Vacuum type=Robot|Self-emptying=No|Mopping=Yes|Runtime=120 min|Power source=Battery"],
  ["LG 4.5 cu. ft. Ultra Large Capacity Front Load Washer", "washers", "Loading=Front load|Capacity=4.5 cu ft|Fuel=Electric|ENERGY STAR=Yes|Finish=White"],
  ["Nike Air Force 1", "sneakers", "Gender=Men|Shoe type=Lifestyle|Width=Regular|Color=White"],
  ["adidas Samba OG", "sneakers", "Gender=Unisex|Shoe type=Lifestyle|Width=Regular|Color=White/Black"],
  ["Levi's 501 Original Fit", "jeans", "Gender=Men|Material=100% cotton denim|Color=Medium Stonewash"],
  ["1996 Retro Nuptse", "jackets", "Gender=Men|Material=Down (700-fill)|Color=TNF Black"],
  ["Ray-Ban RB2140", "sunglasses", "Accessory type=Sunglasses|Material=Acetate|Color=Black"],
  ["Dyson Airwrap", "hair-stylers", "Tool type=Multi-styler|Power=1300 W|Technology=Coanda air"],
  ["CeraVe Moisturizing Cream", "moisturizers", "Skin type=Dry|Size=19 oz"],
  ["Olaplex No. 3", "skincare", "Size=3.3 oz"],
  ["Philips Sonicare 4100", "electric-toothbrushes", "Brush technology=Sonic|Pressure sensor=Yes|Cleaning modes=1"],
  ["Bowflex SelectTech 552", "dumbbells", "Equipment type=Adjustable dumbbells|Max weight=52.5 lb|Subscription=None"],
  ["YETI Rambler 30 oz", "tumblers", "Capacity=30 oz|Material=Stainless steel (insulated)|Lid type=Slider|Color=Black"],
  ["Hydro Flask 32 oz", "water-bottles", "Capacity=32 oz|Material=Stainless steel (insulated)|Lid type=Flex cap|Color=Black"],
  ["Coleman Sundome", "tents", "Capacity=4 person|Season=3-season|Weight=9.6 lb"],
  ["Garmin Dash Cam 57", "dash-cams", "Resolution=1440p|Camera channels=Front only|CarPlay=No"],
  ["NOCO Boost Plus GB40", "jump-starters", "Peak amps=1000 A|Power source=Battery"],
  ["Meguiar's Ultimate Liquid Wax", "car-cleaning", "Power source=None"],
  ["UPPAbaby VISTA V2", "strollers", "Stroller type=Full-size convertible|Max child weight=50 lb|Weight=27 lb"],
  ["Graco 4Ever DLX", "car-seats", "Stroller type=All-in-one car seat|Max child weight=120 lb|Weight=24 lb"],
  ["Pampers Swaddlers Diapers, Size 1", "diapers", "Diaper size=Size 1|Count=198"],
  ["LEGO Star Wars Millennium Falcon 75375", "lego-sets", "Theme=Star Wars|Pieces=921|Age=18+"],
  ["LEGO Icons Orchid", "lego-sets", "Theme=Icons (Botanicals)|Pieces=608|Age=18+"],
  ["Barbie Dreamhouse", "dolls", "Theme=Barbie|Age=3+"],
  ["Starbucks Pike Place Roast Ground", "coffee-beans", "Roast=Medium|Form=Ground|Size=28 oz|Caffeine=Caffeinated"],
  ["Lavazza Super Crema", "coffee-beans", "Roast=Medium|Form=Whole bean|Size=35 oz|Caffeine=Caffeinated"],
  ["Purina Pro Plan Adult Chicken & Rice", "dog-food", "Life stage=Adult|Flavor=Chicken|Bag size=35 lb|Grain=With grain"],
  ["Furbo 360", "dog-beds", "Life stage=All life stages"],
  ["Litter-Robot 4", "cat-litter", "Litter type=Self-cleaning box"],
  ["Brother HL-L2350DW", "laser-printers", "Print technology=Laser|Color printing=Monochrome|Functions=Print only|Wireless=Yes|Ink system=Toner"],
  ["HP OfficeJet Pro 9125e", "inkjet-printers", "Print technology=Inkjet|Color printing=Color|Functions=Print, copy, scan, fax|Wireless=Yes|Ink system=Cartridge"],
  ["FlexiSpot E7 Electric Standing Desk Frame", "standing-desks", "Furniture type=Standing desk|Adjustability=Dual motor"],
  ["DEWALT 20V MAX Cordless Drill/Driver Kit", "drills-drivers", "Voltage=20 V|Battery included=Yes (2)|Motor=Brushed|Battery platform=DeWalt 20V MAX"],
  ["Ring Battery Doorbell Plus", "video-doorbells", "Ecosystem=Alexa|Power source=Battery or wired|Video resolution=1536p|Subscription=Optional (Ring Home)"],
  ["Google Nest Learning Thermostat", "smart-thermostats", "Ecosystem=Google Home, Apple Home|Power source=C-wire|Subscription=None"],
  ["Amazon Echo Dot (5th Gen)", "smart-speakers", "Ecosystem=Alexa|Power source=Plug-in|Subscription=None"],
];

interface Item {
  title: string;
  brand: string;
  leaf: string;
  top: string;
  model: string;
  priceCents: number;
  specs: [string, string][];
  family: { key: string; label: string; attrs: Record<string, string>; sortOrder: number } | null;
}

function parseSpecs(s: string): [string, string][] {
  return s
    .split("|")
    .map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()] as [string, string];
    })
    .filter(([k, v]) => k && v && v !== "—" && !/^0(\.0+)? ?[A-Za-z°]+$/.test(v) && v !== "0");
}

/** Variant-distinguishing specs first (they are what tiles and key-spec rows should show), then the shared ones. */
function mergeSpecs(base: [string, string][], over: [string, string][]): [string, string][] {
  const m = new Map(over);
  for (const [k, v] of base) if (!m.has(k)) m.set(k, v);
  return [...m.entries()];
}

function expand(leaf: string, top: string, entries: Entry[]): Item[] {
  const out: Item[] = [];
  for (const [brand, model, price, specStr, variants] of entries) {
    const base = parseSpecs(specStr);
    const modelCore = model.replace(/,?\s*\{v\}/, "").replace(/\s+/g, " ").trim();
    if (!variants?.length) {
      out.push({ title: `${brand} ${model}`, brand, leaf, top, model: modelCore, priceCents: Math.round(price * 100), specs: base, family: null });
      continue;
    }
    const familyKey = slugify(`${brand} ${modelCore}`);
    variants.forEach(([label, delta, over], i) => {
      const overSpecs = parseSpecs(over);
      const title = model.includes("{v}") ? `${brand} ${model.replace("{v}", label)}` : `${brand} ${model}, ${label}`;
      const attrs: Record<string, string> =
        overSpecs.length === 1 ? { [overSpecs[0]![0].toLowerCase()]: overSpecs[0]![1] } : { configuration: label };
      out.push({
        title,
        brand,
        leaf,
        top,
        model: modelCore,
        priceCents: Math.round((price + delta) * 100),
        specs: mergeSpecs(base, overSpecs),
        family: { key: familyKey, label, attrs, sortOrder: i },
      });
    });
  }
  return out;
}

function shippingFor(rng: Rng, r: SeedRetailer, priceCents: number): number | null {
  if (rng() < 0.05) return null;
  if (r.freeShippingThresholdCents !== null) return priceCents >= r.freeShippingThresholdCents ? 0 : pick(rng, [599, 699, 799]);
  if (r.slug === "costco") return 0;
  if (r.slug === "ebay") return pick(rng, [0, 0, 499, 899]);
  return priceCents >= 4900 ? 0 : pick(rng, [499, 599, 795]);
}

const PICKUP = new Set(["best-buy", "target", "walmart", "home-depot", "lowes", "kohls", "dicks", "staples"]);

function pickRetailers(rng: Rng, item: Item): string[] {
  const pool = [...(POOLS[item.top] ?? ["amazon", "walmart", "target"])];
  const n = Math.min(pool.length, randInt(rng, 2, 6));
  const chosen = new Set<string>();
  if (item.brand === "Apple" && ["electronics", "computers", "smartphones"].includes(item.top)) chosen.add("apple");
  if (/Renewed|Refurbished/i.test(item.title)) chosen.add("back-market");
  // Weighted toward the front of the pool (big retailers carry more).
  while (chosen.size < n) {
    const idx = Math.floor(Math.pow(rng(), 1.6) * pool.length);
    const s = pool[idx];
    if (s) chosen.add(s);
  }
  return [...chosen].slice(0, 6);
}

export async function seedCatalogExpansion(prisma: PrismaClient, opts: { now?: Date; log?: (m: string) => void } = {}) {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => undefined);
  const rng = createRng("whichless-catalog-v1");

  // 1) Category tree (upsert by slug, parents first).
  const flat = flattenTree();
  const catIds = new Map<string, string>();
  const guides = new Map<string, string | undefined>();
  for (const row of flat) {
    const parentId = row.parentSlug ? catIds.get(row.parentSlug) ?? null : null;
    const ancestorGuide = row.parentSlug ? guides.get(row.parentSlug) : undefined;
    guides.set(row.node.slug, row.node.guide ?? ancestorGuide);
    const data = {
      name: row.node.name,
      parentId,
      path: row.path,
      depth: row.depth,
      sortOrder: row.sortOrder,
      isActive: true,
      facets: (row.node.facets ?? null) as Prisma.InputJsonValue | null,
      seoText: seoTextFor(row.node.name, row.node.guide, ancestorGuide),
      ...(row.node.icon ? { icon: row.node.icon } : {}),
    };
    const c = await prisma.category.upsert({
      where: { slug: row.node.slug },
      update: { ...data, facets: data.facets ?? undefined },
      create: { slug: row.node.slug, ...data, facets: data.facets ?? undefined },
    });
    catIds.set(row.node.slug, c.id);
  }
  log(`categories upserted: ${catIds.size}`);

  // 2) Retailers (must exist from the base seed).
  const retailers = await prisma.retailer.findMany({ where: { slug: { in: RETAILERS.map((r) => r.slug) } }, select: { id: true, slug: true } });
  const retailerBySlug = new Map(retailers.map((r) => [r.slug, r.id]));
  const defBySlug = new Map(RETAILERS.map((r) => [r.slug, r]));
  if (retailers.length < 10) throw new Error("Retailers missing — run the base seed (pnpm db:seed) first.");

  // 3) Enrich base-seed products: move into leaf categories + normalized facet attributes.
  let enriched = 0;
  for (const [needle, leaf, specStr] of BASE_ENRICH) {
    const p = await prisma.product.findFirst({ where: { title: { contains: needle }, isDemo: true }, select: { id: true } });
    const categoryId = catIds.get(leaf);
    if (!p || !categoryId) continue;
    const specs = parseSpecs(specStr);
    await prisma.product.update({ where: { id: p.id }, data: { categoryId } });
    // Replace the base seed's free-form spec rows with normalized ones (keeps its General rows except Condition).
    const cond = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, select: { condition: true, brand: { select: { name: true } } } });
    await prisma.productAttribute.deleteMany({ where: { productId: p.id, OR: [{ group: null }, { group: { not: "General" } }, { name: { in: ["Condition", "Brand"] } }] } });
    await prisma.productAttribute.createMany({
      data: [
        ...specs.map(([name, value], i) => ({ productId: p.id, group: GROUP[name] ?? "Specifications", name, value, sortOrder: i })),
        ...(cond.brand ? [{ productId: p.id, group: "General", name: "Brand", value: cond.brand.name, sortOrder: 90 }] : []),
        { productId: p.id, group: "General", name: "Condition", value: cond.condition === "new" ? "New" : cond.condition === "open_box" ? "Open box" : cond.condition[0]!.toUpperCase() + cond.condition.slice(1), sortOrder: 99 },
      ],
    });
    enriched++;
  }
  log(`base products enriched: ${enriched}`);

  // 4) Expand catalog entries.
  const leafTop = new Map(flat.map((r) => [r.node.slug, r.path.split("/")[0] ?? r.node.slug]));
  const items: Item[] = [];
  for (const [leaf, entries] of Object.entries({ ...TECH, ...HOME })) {
    const top = leafTop.get(leaf);
    if (!top) throw new Error(`Unknown leaf category ${leaf}`);
    items.push(...expand(leaf, top, entries));
  }

  // 5) Brands.
  const brandIds = new Map<string, string>();
  for (const name of [...new Set(items.map((i) => i.brand))].sort()) {
    const slug = slugify(name);
    const existing = await prisma.brand.findFirst({ where: { OR: [{ slug }, { name }] }, select: { id: true } });
    const b = existing ?? (await prisma.brand.create({ data: { name, slug, website: BRAND_SITES[name] ?? null } }));
    brandIds.set(name, b.id);
  }

  // 6) Products + offers + history.
  const used = new Set<string>();
  const history: Prisma.PriceHistoryCreateManyInput[] = [];
  let historyCount = 0;
  let offerCount = 0;
  const flush = async (force: boolean) => {
    if (history.length >= 5000 || (force && history.length)) {
      const chunk = history.splice(0, history.length);
      await prisma.priceHistory.createMany({ data: chunk, skipDuplicates: true });
      historyCount += chunk.length;
    }
  };

  for (const [idx, item] of items.entries()) {
    let slug = slugify(item.title).slice(0, 180);
    while (used.has(slug)) slug = `${slug}-${idx}`;
    used.add(slug);
    const categoryId = catIds.get(item.leaf)!;
    const condition = /Renewed|Refurbished/i.test(item.title) ? ("refurbished" as const) : ("new" as const);
    // ~7% are recent arrivals (short history) so "Newly added" is meaningful; the rest have 90–200 days.
    const newArrival = rng() < 0.07;
    const days = newArrival ? randInt(rng, 6, 40) : randInt(rng, 90, 200);
    const firstSeen = new Date(now.getTime() - days * DAY_MS);
    const keySpecs = item.specs.slice(0, 3).map(([k, v]) => `${k}: ${v}`).join("; ");
    const description = `${item.title}. ${keySpecs}.`;

    const product = await prisma.product.upsert({
      where: { slug },
      update: { title: item.title, description, brandId: brandIds.get(item.brand) ?? null, categoryId, model: item.model, condition, status: "active", isDemo: true, createdAt: firstSeen },
      create: { slug, title: item.title, description, brandId: brandIds.get(item.brand) ?? null, categoryId, model: item.model, condition, status: "active", isDemo: true, createdAt: firstSeen },
      select: { id: true },
    });
    const pid = product.id;

    await prisma.productAttribute.deleteMany({ where: { productId: pid } });
    await prisma.productAttribute.createMany({
      data: [
        ...item.specs.map(([name, value], i) => ({ productId: pid, group: GROUP[name] ?? "Specifications", name, value, sortOrder: i })),
        { productId: pid, group: "General", name: "Brand", value: item.brand, sortOrder: 90 },
        { productId: pid, group: "General", name: "Condition", value: condition === "new" ? "New" : "Refurbished", sortOrder: 99 },
      ],
    });
    await prisma.productIdentifier.deleteMany({ where: { productId: pid, type: "UPC" } });
    await prisma.productIdentifier.create({ data: { productId: pid, type: "UPC", value: demoUpc(500000 + idx) } });
    if (item.family) {
      await prisma.productVariant.upsert({
        where: { productId: pid },
        update: { familyKey: item.family.key, label: item.family.label, attributes: item.family.attrs, sortOrder: item.family.sortOrder },
        create: { productId: pid, familyKey: item.family.key, label: item.family.label, attributes: item.family.attrs, sortOrder: item.family.sortOrder },
      });
    } else {
      await prisma.productVariant.deleteMany({ where: { productId: pid } });
    }

    // Replace this module's demo offers (cascade deletes their history).
    await prisma.offer.deleteMany({ where: { productId: pid, source: "demo" } });
    const pattern = pick(rng, PATTERNS);
    const index = productIndex(rng, days, pattern);
    for (const rSlug of pickRetailers(rng, item)) {
      const retailerId = retailerBySlug.get(rSlug);
      const def = defBySlug.get(rSlug);
      if (!retailerId || !def) continue;
      const factor = rSlug === "apple" ? 1 : rSlug === "costco" ? 0.93 + rng() * 0.04 : rSlug === "back-market" ? 0.78 + rng() * 0.08 : 0.94 + rng() * 0.08;
      const series = offerSeries({ rng, days, now, baseCents: Math.round(item.priceCents * factor), index, roundDollars: def.roundDollars === true, observeProbability: 0.85 });
      const last = series[series.length - 1];
      if (!last) continue;
      const shippingCents = shippingFor(rng, def, last.priceCents);
      const listPriceCents =
        pattern === "hike_then_sale" ? Math.round((item.priceCents * 1.35) / 100) * 100 - 1 : last.priceCents < item.priceCents ? item.priceCents : null;
      const daysMin = randInt(rng, 1, 4);
      const lastChange = [...series].reverse().find((pt, i, arr) => arr[i + 1] !== undefined && arr[i + 1]!.priceCents !== pt.priceCents);
      const offer = await prisma.offer.create({
        data: {
          productId: pid,
          retailerId,
          retailerSku: `${SKU_PREFIX}${rSlug.toUpperCase()}-${String(idx + 1).padStart(5, "0")}`,
          title: item.title,
          url: def.searchUrl.replace("{q}", encodeURIComponent(item.title)),
          condition: rSlug === "back-market" && condition === "new" ? "refurbished" : condition,
          priceCents: last.priceCents,
          listPriceCents,
          shippingCents,
          shippingDaysMin: daysMin,
          shippingDaysMax: daysMin + randInt(rng, 1, 4),
          pickupAvailable: PICKUP.has(rSlug) && rng() < 0.6,
          currency: "USD",
          stock: last.inStock ? (rng() < 0.1 ? "low_stock" : "in_stock") : "out_of_stock",
          source: "demo",
          firstSeenAt: series[0]?.observedAt ?? firstSeen,
          lastCheckedAt: last.observedAt,
          lastChangedAt: lastChange?.observedAt ?? series[0]?.observedAt ?? last.observedAt,
        },
        select: { id: true },
      });
      offerCount++;
      for (const pt of series) {
        history.push({ offerId: offer.id, observedAt: pt.observedAt, productId: pid, retailerId, priceCents: pt.priceCents, shippingCents, currency: "USD", stock: pt.inStock ? "in_stock" : "out_of_stock", source: "demo" });
      }
      await flush(false);
    }
    if ((idx + 1) % 100 === 0) log(`  products: ${idx + 1}/${items.length}`);
  }
  await flush(true);
  const payments = await seedPaymentOptions(prisma);
  log(`payment options: ${payments.upserted} (${payments.retailersWithOptions} retailers)`);
  return { payments: payments.upserted, categories: catIds.size, enriched, products: items.length, offers: offerCount, history: historyCount, topLevel: CATALOG_TREE.length };
}
