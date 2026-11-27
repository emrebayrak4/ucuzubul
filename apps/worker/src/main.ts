/**
 * Pricora background worker (BullMQ):
 *  - price-refresh: scheduled every 30 min; adapters without credentials are skipped (no-op, logged).
 *  - price-events:  evaluates price alerts on price/stock changes → Notification rows (dedupe + cooldown).
 *  - search-index:  full Meilisearch reindex (scheduled every 6 h and on demand).
 *  - travel-alerts: flight fare alerts (Track prices) every 6 h → Notification rows (dedupe + 24 h cooldown).
 *  - fx-rates:      ECB reference rates every 6 h (90-day backfill on first run) — only for "≈" cross-market hints.
 *  - network-ingest: affiliate networks (CJ, Impact, Rakuten, Awin, Partnerize, EPN) — coupons, product
 *    catalogs → matching → offers/price history, and conversion imports, on per-network schedules from
 *    NETWORK_REGISTRY. Networks without credentials finish immediately as pending_configuration.
 */
import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  COUPONS_QUEUE,
  expireCoupons,
  pullCouponFeeds,
  reverifyStaleCoupons,
  IntegrationConfig,
  parseKey,
  MERCHANT_FEEDS_QUEUE,
  parseMerchantFeed,
  processMerchantFeed,
  type MerchantFeedJob,
  PRICE_EVENTS_QUEUE,
  PRICE_REFRESH_QUEUE,
  SEARCH_INDEX_QUEUE,
  processPriceEvent,
  reindexProducts,
  type PriceEventJob,
  FlightFareService,
  TRAVEL_ALERTS_QUEUE,
  evaluateFlightAlerts,
  NETWORK_INGEST_QUEUE,
  networkSchedules,
  runNetworkJob,
  hideDemoOffers,
  FX_QUEUE,
  refreshFxRates,
  type NetworkIngestJob,
} from "@pricora/api/core";
import { parseServerEnv } from "@pricora/config/env";
import { disconnectPrisma, getPrisma, type PrismaClient } from "@pricora/database";
import { createRetailerAdapters, type RetailerAdapter } from "@pricora/retailer-adapters";
import { Queue, Worker, type Job } from "bullmq";
import { Meilisearch } from "meilisearch";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}
const env = parseServerEnv(process.env);
const prisma: PrismaClient = getPrisma();
const meili = new Meilisearch({ host: env.MEILI_HOST, ...(env.MEILI_MASTER_KEY ? { apiKey: env.MEILI_MASTER_KEY } : {}) });
const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };
/** Admin-managed credentials (DB) overlaid on process.env; invalidated via Redis pub/sub when admins edit them. */
const integrations = new IntegrationConfig(prisma, parseKey(env.CREDENTIALS_ENCRYPTION_KEY));
integrations.subscribe(env.REDIS_URL);

const log = (scope: string, msg: string) => console.log(`${new Date().toISOString()} [${scope}] ${msg}`);

/** Adapter id → our retailer slug (where they differ). */
const ADAPTER_RETAILER: Record<string, string> = { bestbuy: "best-buy", homedepot: "home-depot", bhphoto: "bh-photo" };

async function refreshAdapter(adapter: RetailerAdapter, priceEvents: Queue): Promise<{ checked: number; changed: number }> {
  const slug = ADAPTER_RETAILER[adapter.id] ?? adapter.id;
  const retailer = await prisma.retailer.findUnique({ where: { slug } });
  if (!retailer) return { checked: 0, changed: 0 };
  const offers = await prisma.offer.findMany({
    where: { retailerId: retailer.id, isActive: true, source: { in: ["api", "feed"] } },
    orderBy: { lastCheckedAt: "asc" },
    take: 200,
  });
  let changed = 0;
  for (const offer of offers) {
    const res = await adapter.fetchProductDetails(offer.retailerSku);
    const fresh = res.data?.offer;
    const now = new Date();
    if (!fresh) {
      await prisma.offer.update({ where: { id: offer.id }, data: { lastCheckedAt: now } });
      continue;
    }
    const stock = fresh.availability === "in_stock" ? "in_stock" : fresh.availability === "limited" ? "low_stock" : fresh.availability === "out_of_stock" ? "out_of_stock" : fresh.availability === "preorder" ? "preorder" : "unknown";
    const priceChanged = fresh.priceCents !== offer.priceCents;
    const stockChanged = stock !== offer.stock;
    await prisma.offer.update({
      where: { id: offer.id },
      data: { priceCents: fresh.priceCents, listPriceCents: fresh.listPriceCents, shippingCents: fresh.shippingCents, stock, lastCheckedAt: now, ...(priceChanged ? { lastChangedAt: now } : {}) },
    });
    await prisma.priceHistory.create({
      data: { offerId: offer.id, observedAt: now, productId: offer.productId, retailerId: retailer.id, priceCents: fresh.priceCents, shippingCents: fresh.shippingCents, stock, source: offer.source },
    });
    if (priceChanged || stockChanged) {
      changed++;
      const job: PriceEventJob = {
        offerId: offer.id,
        previousPriceCents: offer.priceCents,
        newPriceCents: fresh.priceCents,
        previousInStock: offer.stock !== "out_of_stock",
        newInStock: stock !== "out_of_stock",
        occurredAt: now.toISOString(),
      };
      await priceEvents.add("price-change", job, { removeOnComplete: 1000, removeOnFail: 1000 });
    }
  }
  // A live adapter returning real prices for this retailer hides its demo offers automatically.
  const refreshed = offers.length > 0 ? await prisma.offer.count({ where: { retailerId: retailer.id, source: { in: ["api", "feed"] }, isActive: true } }) : 0;
  if (refreshed > 0) await hideDemoOffers(prisma, retailer.id);
  return { checked: offers.length, changed };
}

async function main(): Promise<void> {
  const priceEvents = new Queue(PRICE_EVENTS_QUEUE, { connection });
  const searchIndex = new Queue(SEARCH_INDEX_QUEUE, { connection });
  const priceRefresh = new Queue(PRICE_REFRESH_QUEUE, { connection });
  const coupons = new Queue(COUPONS_QUEUE, { connection });
  const travelAlerts = new Queue(TRAVEL_ALERTS_QUEUE, { connection });
  const networkIngest = new Queue(NETWORK_INGEST_QUEUE, { connection });
  const fxRates = new Queue(FX_QUEUE, { connection });
  const flightFares = new FlightFareService(prisma, () => integrations.env());

  await priceRefresh.upsertJobScheduler("price-refresh-30m", { every: 30 * 60_000 }, { name: "refresh-all" });
  await coupons.upsertJobScheduler("coupons-maintain-daily", { every: 24 * 60 * 60_000 }, { name: "maintain" });
  await coupons.upsertJobScheduler("coupons-ingest-6h", { every: 6 * 60 * 60_000 }, { name: "ingest" });
  await travelAlerts.upsertJobScheduler("travel-alerts-6h", { every: 6 * 60 * 60_000 }, { name: "evaluate" });
  // ECB publishes once per working day ~16:00 CET; 6-hourly polling is cheap and catches it the same day.
  // Multi-market is dormant (US only, founder 2026-11-27): only schedule ECB FX refresh when MARKETS_ENABLED=true.
  if (process.env.MARKETS_ENABLED === "true") await fxRates.upsertJobScheduler("fx-ecb-6h", { every: 6 * 60 * 60_000 }, { name: "refresh" });
  else await fxRates.removeJobScheduler("fx-ecb-6h").catch(() => undefined);
  await searchIndex.upsertJobScheduler("search-reindex-6h", { every: 6 * 60 * 60_000 }, { name: "reindex" });
  // Coupons for CJ/Impact/Rakuten/Awin run inside the coupons queue ("ingest"); here: products + conversions.
  for (const s of networkSchedules().filter((x) => x.job.kind !== "coupons")) {
    await networkIngest.upsertJobScheduler(s.id, { every: s.everyMs }, { name: s.job.kind, data: s.job, opts: { removeOnComplete: 200, removeOnFail: 200 } });
  }

  const workers = [
    new Worker(
      PRICE_REFRESH_QUEUE,
      async () => {
        const job = await prisma.dataIngestionJob.create({ data: { kind: "price-refresh", status: "processing", startedAt: new Date() } });
        const stats: Record<string, unknown> = {};
        let changedTotal = 0;
        for (const adapter of createRetailerAdapters({ env: await integrations.env() })) {
          // Upload-only adapters (merchant feeds) are driven by the API, not by scheduled refresh.
          if (adapter.id === "merchant_feed") continue;
          const status = adapter.status();
          if (status !== "live") {
            stats[adapter.id] = { skipped: status };
            continue;
          }
          try {
            const r = await refreshAdapter(adapter, priceEvents);
            changedTotal += r.changed;
            stats[adapter.id] = r;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            stats[adapter.id] = { error: message };
            await prisma.integrationError.create({ data: { provider: adapter.id, code: "refresh_failed", message } });
          }
        }
        await prisma.dataIngestionJob.update({ where: { id: job.id }, data: { status: "completed", finishedAt: new Date(), stats: stats as object } });
        const live = Object.values(stats).filter((s) => !(typeof s === "object" && s !== null && "skipped" in s)).length;
        log("price-refresh", `done: ${live} live adapter(s), ${Object.keys(stats).length - live} skipped (pending configuration)`);
        if (changedTotal > 0) await searchIndex.add("reindex", {}, { removeOnComplete: 100, removeOnFail: 100 });
        return stats;
      },
      { connection, concurrency: 1 },
    ),
    new Worker(
      PRICE_EVENTS_QUEUE,
      async (job: Job<PriceEventJob>) => {
        const r = await processPriceEvent(prisma, job.data);
        if (r.created > 0) log("price-events", `offer ${job.data.offerId}: ${r.created} notification(s) from ${r.evaluated} alert(s)`);
        return r;
      },
      { connection, concurrency: 4 },
    ),
    new Worker(
      COUPONS_QUEUE,
      async (job: Job) => {
        if (job.name === "maintain") {
          const expired = await expireCoupons(prisma);
          const reverify = await reverifyStaleCoupons(prisma);
          log("coupons", `maintain: ${expired} expired, ${reverify} queued for re-verification`);
          return { expired, reverify };
        }
        const run = await prisma.dataIngestionJob.create({ data: { kind: "coupon-feeds", status: "processing", startedAt: new Date() } });
        const results = await pullCouponFeeds(prisma, await integrations.env());
        await prisma.dataIngestionJob.update({ where: { id: run.id }, data: { status: "completed", finishedAt: new Date(), stats: results as unknown as object } });
        log("coupons", "ingest: " + results.map((r) => r.id + "=" + r.status).join(", "));
        return results;
      },
      { connection, concurrency: 1 },
    ),
    new Worker(
      MERCHANT_FEEDS_QUEUE,
      async (job: Job<MerchantFeedJob>) => {
        const { feedId, path: staged, format } = job.data;
        const feed = await prisma.retailerFeed.findUnique({ where: { id: feedId }, include: { merchantAccount: true } });
        if (!feed) return { skipped: "feed not found" };
        try {
          const text = await readFile(staged, "utf8");
          const parsed = parseMerchantFeed(text, format, { id: "merchant-" + (feed.merchantAccountId ?? "unknown"), name: feed.merchantAccount?.companyName ?? feed.name, retailerId: feed.retailerId });
          await processMerchantFeed(prisma, feedId, parsed, async (ev) => {
            await priceEvents.add("price-change", ev, { removeOnComplete: 1000, removeOnFail: 1000 });
          });
          await searchIndex.add("reindex", {}, { removeOnComplete: 100, removeOnFail: 100 });
          log("merchant-feeds", "feed " + feedId + " processed (" + parsed.stats.rows + " rows)");
          await unlink(staged).catch(() => undefined);
          return { rows: parsed.stats.rows };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
            await prisma.retailerFeed.update({ where: { id: feedId }, data: { status: "failed", completedAt: new Date(), errors: [{ row: 0, field: null, message: "Processing failed" }] } });
            await unlink(staged).catch(() => undefined);
          }
          throw new Error(message);
        }
      },
      { connection, concurrency: 1 },
    ),
    new Worker(
      TRAVEL_ALERTS_QUEUE,
      async () => {
        const r = await evaluateFlightAlerts(prisma, flightFares);
        log("travel-alerts", `evaluated ${r.evaluated}, notified ${r.notified}, expired ${r.expired}, cooldown ${r.skippedCooldown}`);
        return r;
      },
      { connection, concurrency: 1 },
    ),
    new Worker(
      NETWORK_INGEST_QUEUE,
      async (job: Job<NetworkIngestJob>) => {
        const r = await runNetworkJob(prisma, job.data, await integrations.env(), async (ev) => {
          await priceEvents.add("price-change", ev, { removeOnComplete: 1000, removeOnFail: 1000 });
        });
        log("network-ingest", `${job.data.network}/${job.data.kind}: ${String(r.status)} — ${String(r.message)}`);
        if (job.data.kind === "products" && r.status === "ok") await searchIndex.add("reindex", {}, { removeOnComplete: 100, removeOnFail: 100 });
        return r;
      },
      // One network call stream at a time keeps us inside every network's per-minute limits.
      { connection, concurrency: 1 },
    ),
    new Worker(
      FX_QUEUE,
      async () => {
        // First run backfills 90 days so "≈" hints work immediately; later runs fetch the daily file.
        const history = (await prisma.fxRate.count()) === 0;
        const r = await refreshFxRates(prisma, { history });
        log("fx-rates", `ECB ${r.latest ?? "?"}: ${r.rows} rates over ${r.days} day(s)`);
        return r;
      },
      { connection, concurrency: 1 },
    ),
    new Worker(
      SEARCH_INDEX_QUEUE,
      async () => {
        const n = await reindexProducts(prisma, meili);
        log("search-index", `indexed ${n} products`);
        return { indexed: n };
      },
      { connection, concurrency: 1 },
    ),
  ];
  for (const w of workers) {
    w.on("failed", (job, err) => log(w.name, `job ${job?.id ?? "?"} failed: ${err.message}`));
    w.on("error", (err) => log(w.name, `worker error: ${err.message}`));
  }

  // Job schedulers fire immediately on first registration; add an initial reindex so a fresh environment is usable.
  await searchIndex.add("reindex", {}, { removeOnComplete: 100, removeOnFail: 100 });
  log("worker", `started (queues: ${PRICE_REFRESH_QUEUE}, ${PRICE_EVENTS_QUEUE}, ${SEARCH_INDEX_QUEUE}, ${MERCHANT_FEEDS_QUEUE}, ${COUPONS_QUEUE}, ${TRAVEL_ALERTS_QUEUE}, ${NETWORK_INGEST_QUEUE}, ${FX_QUEUE})`);

  const shutdown = async () => {
    log("worker", "shutting down");
    await Promise.allSettled([...workers.map((w) => w.close()), priceEvents.close(), searchIndex.close(), priceRefresh.close(), coupons.close(), travelAlerts.close(), networkIngest.close(), fxRates.close()]);
    await integrations.close();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
