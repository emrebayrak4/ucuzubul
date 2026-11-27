#!/usr/bin/env node
/**
 * Live API smoke run for the mobile app's main flows, using the same @pricora/api-client the app uses with
 * response validation against the Zod contracts turned ON (any contract drift fails the step).
 *
 *   node apps/mobile/scripts/smoke-api.mjs [apiOrigin]       (default http://localhost:4400)
 *
 * Signs up a throwaway account on the target API (only run against a local/dev API), exercises the
 * account flows with native bearer auth (`x-pricora-client: native`), then deletes the account again.
 */
import { createApiClient, ApiError } from "@pricora/api-client";

const BASE = (process.argv[2] || process.env.EXPO_PUBLIC_API_URL || "http://localhost:4400").replace(/\/+$/, "");
let token = null;
const api = createApiClient({
  baseUrl: BASE,
  headers: () => ({ "x-pricora-client": "native", ...(token ? { authorization: `Bearer ${token}` } : {}) }),
  validateResponses: true,
});

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, ms: Date.now() - t, note: note ?? "" });
    console.log(`  ok   ${name}${note ? ` — ${note}` : ""}`);
  } catch (e) {
    const msg = e instanceof ApiError ? `${e.status} ${e.code}: ${e.message}${e.details ? " " + JSON.stringify(e.details).slice(0, 300) : ""}` : String(e?.stack ?? e);
    results.push({ name, ok: false, ms: Date.now() - t, note: msg });
    console.log(`  FAIL ${name} — ${msg}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

console.log(`Smoke run against ${BASE}`);
const ctx = {};

// ---------- Shopping (anonymous) ----------
await step("home", async () => {
  const h = await api.catalog.home();
  ctx.home = h;
  return `${h.bestDeals.length} deals, ${h.priceDrops.length} drops, under25 ${h.under25.length}, demo=${h.hasDemoData}`;
});
await step("category tree (3 levels)", async () => {
  const t = await api.catalog.categories();
  const depth = (n) => 1 + Math.max(0, ...n.children.map(depth));
  const d = Math.max(...t.items.map(depth));
  assert(d >= 3, `tree depth ${d} < 3`);
  ctx.leaf = t.items.flatMap((a) => a.children.flatMap((b) => b.children))[0] ?? t.items[0].children[0];
  return `${t.items.length} top-level, depth ${d}`;
});
await step("category detail + spec facets", async () => {
  const slug = "laptops";
  const c = await api.catalog.category(slug);
  const s = await api.search.search({ category: slug, pageSize: 6 });
  assert(s.facets.specs.length > 0, "no spec facets");
  assert(s.facets.price.histogram.length > 0, "no histogram");
  ctx.spec = s.facets.specs[0].buckets[0].value;
  ctx.brandBucket = s.facets.brands[0]?.value;
  return `${c.category.name}: ${s.total} products, ${s.facets.specs.length} spec facets, ${c.facets.length} defs`;
});
await step("search filters (spec + price + brand + inStock + sort)", async () => {
  const s = await api.search.search({
    category: "laptops",
    spec: ctx.spec,
    brand: ctx.brandBucket,
    minPrice: 10000,
    maxPrice: 500000,
    inStock: "true",
    sort: "lowest_total",
    pageSize: 6,
  });
  return `${s.total} results (${ctx.spec}, ${ctx.brandBucket})`;
});
await step("search page 2 + condition/freeShipping/minDiscount", async () => {
  const s = await api.search.search({ q: "laptop", condition: "new", freeShipping: "true", minDiscount: 0.1, page: 2, pageSize: 6 });
  return `${s.total} results, page ${s.page}/${s.totalPages}`;
});
await step("search: did-you-mean / zero results", async () => {
  const s = await api.search.search({ q: "lapptop", pageSize: 3 });
  const z = await api.search.search({ q: "zzzqqqxxnotathing", pageSize: 3 });
  return `didYouMean=${s.didYouMean ?? "null"}, zero-results total=${z.total} didYouMean=${z.didYouMean ?? "null"}`;
});
await step("suggest (categories/brands/products)", async () => {
  const s = await api.search.suggest("app");
  const types = [...new Set(s.items.map((i) => i.type))];
  return `${s.items.length} suggestions: ${types.join(",")}`;
});
await step("trending", async () => {
  const t = await api.search.trending();
  return `${t.queries.length} queries, ${t.products.length} products`;
});
await step("product detail + history (90d, per-store, 7d, all)", async () => {
  const slug = ctx.home.priceDrops[0]?.product.slug ?? ctx.home.trending[0].slug;
  const d = await api.catalog.product(slug);
  ctx.product = d;
  const h = await api.catalog.productHistory(slug, { range: "90d" });
  const r = d.offers[0]?.retailer.slug;
  if (r) await api.catalog.productHistory(slug, { range: "30d", retailer: r });
  await api.catalog.productHistory(slug, { range: "7d" });
  await api.catalog.productHistory(slug, { range: "all" });
  return `${d.offers.length} offers, ${d.coupons.length} coupons, ${d.product.variants.length} variants, ${d.related.length} similar, ${d.alternatives.length} alternatives, prevLowest=${d.previousLowestPriceCents ?? "null"}, ${h.series.length} series`;
});
await step("product with ZIP (tax estimate)", async () => {
  const d = await api.catalog.product(ctx.product.product.slug, { zip: "10001" });
  return `tax status ${d.offers[0]?.tax.status ?? "n/a"}`;
});
await step("compare 2 and 5 products", async () => {
  const ids = [ctx.product.product.id, ...ctx.product.alternatives.map((a) => a.id), ...ctx.product.related.map((a) => a.id)];
  const uniq = [...new Set(ids)];
  const c2 = await api.catalog.compare(uniq.slice(0, 2));
  const c5 = uniq.length >= 5 ? await api.catalog.compare(uniq.slice(0, 5)) : c2;
  return `${c2.products.length} / ${c5.products.length} products, ${c5.attributeKeys.length} attribute keys`;
});
await step("deals (score/drop/category)", async () => {
  const a = await api.catalog.deals({ sort: "score", pageSize: 6 });
  const b = await api.catalog.deals({ sort: "drop", category: "electronics", pageSize: 6 });
  return `${a.total} deals, ${b.total} electronics by drop`;
});
for (const w of ["24h", "7d", "30d"]) {
  await step(`price drops ${w}`, async () => {
    const p = await api.catalog.priceDrops({ window: w, pageSize: 6 });
    if (p.items[0]) assert(p.items[0].previousPriceCents > p.items[0].currentPriceCents, "previous price not above current");
    return `${p.total} drops`;
  });
}
await step("pay over time: filter + facet count + offer/store options", async () => {
  const s = await api.search.search({ payOverTime: "true", pageSize: 3 });
  const withPay = s.items.find((p) => p.payIn4) ?? s.items[0];
  let opts = 0;
  let in4 = "none";
  if (withPay) {
    const d = await api.catalog.product(withPay.slug);
    opts = d.offers.reduce((n, o) => n + (o.paymentOptions?.length ?? 0), 0);
    const o = d.offers.find((x) => x.payIn4);
    if (o?.payIn4) in4 = `${o.payIn4.installments}×${o.payIn4.installmentCents} ${o.payIn4.provider}`;
  }
  const r = await api.catalog.retailer(ctx.store ?? "amazon");
  return `${s.total} results, facet ${s.facets.payOverTimeCount}; offer options ${opts}, payIn4 ${in4}; store options ${r.paymentOptions.length}`;
});
await step("conditions: default new vs all, used deals, per-condition product + history", async () => {
  const dflt = await api.search.search({ q: "iphone", pageSize: 3 });
  const all = await api.search.search({ q: "iphone", condition: "all", pageSize: 3 });
  const groups = all.facets.conditions.map((b) => `${b.value}:${b.count}`).join(",");
  const used = await api.catalog.deals({ condition: "used", pageSize: 3 });
  const drops = await api.catalog.priceDrops({ condition: "refurbished", pageSize: 3 });
  const withOther = all.items.find((p) => p.otherConditions?.length) ?? all.items[0];
  let detail = "n/a";
  if (withOther) {
    const d = await api.catalog.product(withOther.slug);
    const g = d.conditionSummary?.find((x) => x.condition !== "new" && x.offerCount > 0)?.condition;
    if (g) await api.catalog.productHistory(withOther.slug, { range: "90d", condition: g });
    detail = `default ${d.defaultCondition}, summary ${(d.conditionSummary ?? []).map((x) => `${x.condition}:${x.offerCount}`).join(",")}${g ? `, ${g} history ok` : ""}`;
  }
  return `default ${dflt.total} vs all ${all.total} [${groups}]; used deals ${used.total}; refurb drops ${drops.total}; ${detail}`;
});
await step("grocery: unit price sort, near-me search, product nearby + size family, local stores", async () => {
  const u = await api.search.search({ category: "breakfast-cereal", sort: "unit_price", pageSize: 3 });
  const n = await api.search.search({ q: "diapers", near: "true", zip: "10001", sort: "distance", pageSize: 3 });
  const slug = "cheerios-heart-healthy-cereal-family-size-18-oz";
  const d = await api.catalog.product(slug, { zip: "10001" });
  const nb = await api.local.nearby(slug, { zip: "10001" });
  const noZip = await api.local.nearby(slug);
  const st = await api.local.stores({ zip: "10001" });
  return `unit sort ${u.total} (${u.items[0]?.unitPrice?.label ?? "no unit"}); near ${n.total}, nearbyCount ${n.facets.nearbyCount ?? "-"}, nearest ${n.items[0]?.nearest?.storeName ?? "-"}; sizes ${d.sizeFamily?.length ?? 0}, unitPricing ${d.unitPricing}; nearby ${nb.status} ${nb.items.length}+${nb.sponsored.length} sponsored; no-zip ${noZip.status}; stores ${JSON.stringify(st).length > 2 ? "ok" : "-"}`;
});
await step("popular / new (search sorts)", async () => {
  const p = await api.search.search({ sort: "popular", pageSize: 6 });
  const n = await api.search.search({ sort: "newest", pageSize: 6 });
  return `${p.total} / ${n.total}`;
});
await step("stores + store detail + brand detail", async () => {
  const r = await api.catalog.retailers();
  const store = r.items.find((x) => x.offerCount > 0) ?? r.items[0];
  ctx.store = store.slug;
  const sd = await api.catalog.retailer(store.slug);
  const brand = ctx.product.product.brand?.slug ?? "apple";
  const bd = await api.catalog.brand(brand);
  const bs = await api.search.search({ brand, pageSize: 3 });
  const ss = await api.search.search({ retailer: store.slug, pageSize: 3 });
  return `${r.items.length} stores; ${sd.retailer.name} ${ss.total} products; ${bd.brand.name} ${bs.total} products`;
});
await step("coupons list (store filter + each sort) + store coupons + stats", async () => {
  const all = await api.coupons.list({ pageSize: 10 });
  for (const sort of ["newest", "expiring", "popular", "success_rate"]) await api.coupons.list({ sort, pageSize: 3 });
  const withCoupons = all.items[0]?.retailer.slug ?? ctx.store;
  ctx.couponStore = withCoupons;
  ctx.coupon = all.items[0];
  const f = await api.coupons.list({ retailer: withCoupons, pageSize: 5 });
  const r = await api.coupons.forRetailer(withCoupons, { sort: "success_rate", pageSize: 3 });
  const st = await api.coupons.retailerStats(withCoupons);
  return `${all.total} coupons; ${withCoupons}: ${f.total} / ${r.total}, active ${st.activeCount}`;
});
await step("coupon anonymous worked? report (device id)", async () => {
  if (!ctx.coupon) return "no coupons";
  const r = await api.coupons.reportResult(ctx.coupon.id, { worked: true, source: "mobile", deviceId: "smoke-" + Math.random().toString(16).slice(2, 14) });
  return `recorded=${r.recorded}${r.reason ? ` (${r.reason})` : ""}`;
});
await step("scan lookup (product UPC + unknown code)", async () => {
  const upc = ctx.product.product.identifiers.find((i) => ["UPC", "EAN", "GTIN"].includes(i.type))?.value;
  const nf = await api.scan.lookup("036000291452");
  if (!upc) return `no UPC on product; unknown → ${nf.status}`;
  const s = await api.scan.lookup(upc);
  return `${upc} → ${s.status}${s.status === "found" ? ` (${s.offers.length} offers)` : ""}; unknown → ${nf.status}`;
});
await step("outbound /v1/go/:offerId and /v1/coupons/:id/go redirect (302, not followed)", async () => {
  const offer = ctx.product.offers[0];
  const r = await fetch(api.catalog.goUrl(offer.id, "app_smoke"), { redirect: "manual", headers: { "x-pricora-client": "native" } });
  assert([301, 302, 303, 307, 308].includes(r.status), `go status ${r.status}`);
  let cs = "n/a";
  if (ctx.coupon) {
    const c = await fetch(api.coupons.goUrl(ctx.coupon.id), { redirect: "manual" });
    cs = String(c.status);
  }
  return `offer go ${r.status}, coupon go ${cs}`;
});
await step("geo zip nearest (typed, contract-validated; 404 → manual fallback)", async () => {
  try {
    const r = await api.geo.zipNear(40.713, -74.006);
    return `${r.zip} ${r.city ?? ""} ${r.state ?? ""} (${r.confidence})`;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return "404 → app falls back to manual ZIP entry";
    throw e;
  }
});

// ---------- Account (native bearer) ----------
const email = `smoke-mobile-${Date.now()}@example.test`;
const password = `Smoke-${Math.random().toString(36).slice(2)}-Aa1!`;
await step("signup (native bearer token)", async () => {
  const r = await api.auth.register({ email, password, name: "Mobile Smoke" });
  token = r.sessionToken ?? null;
  assert(token, "no sessionToken in native register response");
  const me = await api.auth.me();
  assert(me.user?.email === email, "me mismatch");
  return "sessionToken received, /auth/me ok";
});
await step("login", async () => {
  const r = await api.auth.login({ email, password });
  token = r.sessionToken ?? token;
  return "ok";
});
await step("forgot password (always 200)", async () => {
  await api.auth.forgotPassword({ email });
  return "ok";
});
await step("preferences: ZIP + notifications + theme", async () => {
  const p = await api.me.updatePreferences({ zip: "10001", theme: "dark", notifications: { email: true, push: true, priceDrops: true, weeklyDigest: false, marketing: false } });
  assert(p.preferences.zip === "10001", "zip not saved");
  return "saved";
});
await step("favorites add/list/remove", async () => {
  const f = await api.me.favorites.add(ctx.product.product.id);
  const l = await api.me.favorites.list({ pageSize: 10 });
  await api.me.favorites.remove(f.id);
  return `${l.total} favorite(s) before remove`;
});
await step("price alerts create (below/drop%)/update/list/delete", async () => {
  const cur = ctx.product.offers[0]?.priceCents ?? 10000;
  const a = await api.me.alerts.create({ productId: ctx.product.product.id, type: "below_price", targetPriceCents: Math.max(100, Math.floor(cur * 0.9)), channels: ["in_app", "email", "push"] });
  const b = await api.me.alerts.create({ productId: ctx.product.product.id, type: "drop_percent", dropPercentBp: 1000, channels: ["in_app"] });
  await api.me.alerts.update(a.id, { active: false });
  const l = await api.me.alerts.list({ pageSize: 10 });
  await api.me.alerts.remove(a.id);
  await api.me.alerts.remove(b.id);
  return `${l.total} alerts listed`;
});
await step("shopping list create/add/remove/delete", async () => {
  const l = await api.me.lists.create({ name: "Smoke list", isPublic: false });
  const withItem = await api.me.lists.addItem(l.id, { productId: ctx.product.product.id, quantity: 1 });
  await api.me.lists.removeItem(l.id, withItem.items[0].id);
  await api.me.lists.remove(l.id);
  return "ok";
});
await step("coupon follow/list/unfollow + signed-in vote", async () => {
  await api.me.couponFollows.follow(ctx.couponStore);
  const f = await api.me.couponFollows.list();
  assert(f.items.some((x) => x.retailer.slug === ctx.couponStore), "follow missing");
  await api.me.couponFollows.unfollow(ctx.couponStore);
  let vote = "no coupon";
  if (ctx.coupon) {
    const v = await api.coupons.vote(ctx.coupon.id, true);
    vote = `vote recorded=${v.recorded}`;
  }
  return `${f.items.length} followed; ${vote}`;
});
await step("push device register/unregister", async () => {
  const t = `ExponentPushToken[smoke${Date.now().toString(36)}]`;
  const d = await api.me.devices.register({ token: t, platform: "ios" });
  await api.me.devices.remove(t);
  return `registered ${d.platform}`;
});
await step("recently viewed + home (signed in)", async () => {
  await api.catalog.product(ctx.product.product.slug);
  const r = await api.me.recentlyViewed();
  const h = await api.catalog.home();
  return `${r.items.length} recent, home recentlyViewed=${h.recentlyViewed?.length ?? "absent"}`;
});
await step("privacy consent PUT/GET (Do Not Sell/Share → advertising off + gpc)", async () => {
  await api.me.updateConsent({ functional: true, analytics: false, advertising: false, gpc: true });
  const c = await api.me.consent();
  assert(c.consent && c.consent.advertising === false && c.consent.gpc === true, "consent not saved");
  return "saved";
});
await step("data export", async () => {
  const e = await api.me.exportData();
  return `exported ${e.favorites.length} favorites, ${e.alerts.length} alerts`;
});
await step("delete account (cleanup)", async () => {
  await api.me.deleteAccount({ confirm: "DELETE", password });
  token = null;
  return "deleted";
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed${failed.length ? `; failed: ${failed.map((f) => f.name).join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
