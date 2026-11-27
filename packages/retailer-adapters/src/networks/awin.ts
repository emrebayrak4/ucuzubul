/**
 * Awin — Publisher API (https://help.awin.com/apidocs/introduction-1) + product feeds (Create-a-Feed).
 * Auth: `Authorization: Bearer <API token>` (token from the Awin UI → API credentials). Limit: 20 calls/minute per user.
 *
 *  - Accounts:      GET  https://api.awin.com/accounts                                    (health check)
 *  - Transactions:  GET  https://api.awin.com/publishers/{publisherId}/transactions/?startDate=&endDate=&timezone=UTC  (≤ 31 days)
 *                   → [{ id, advertiserId, commissionStatus (pending|approved|declined|deleted), saleAmount{amount,currency}, commissionAmount{…}, clickRefs{clickRef}, transactionDate }]
 *  - Promotions:    POST https://api.awin.com/publisher/{publisherId}/promotions  body { filters:{ membership:"joined", status:"active" }, pagination:{ page, pageSize } }
 *                   → { data:[{ promotionId, type, advertiser{id,name}, title, description, terms, startDate, endDate, url, urlTracking, voucher{code} }], pagination{ page, pageSize, total } }
 *  - Product feeds: https://ui.awin.com/productdata-darwin-download/publisher/{publisherId}/{datafeedKey}/1/feedList
 *                   (CSV list of feeds with download URLs on productdata.awin.com; the data-feed key is NOT the API token —
 *                   it is the value after `apikey/` in a Create-a-Feed URL). Only "Awin"-format CSV feeds are parsed here.
 *                   Column names depend on the columns chosen in Create-a-Feed; the aw_* aliases mapped in
 *                   FEED_COLUMN_ALIASES are UNVERIFIED as a default set — pick Google-merchant-style columns where possible.
 *  - Promotions response wrapper ({data, pagination}) is UNVERIFIED (schema shows `object`); a bare array is accepted too.
 *  - Links:         https://www.awin1.com/cread.php?awinmid=&awinaffid=&clickref=&ued=
 *
 * Env: AWIN_API_TOKEN, AWIN_PUBLISHER_ID; optional AWIN_FEED_API_KEY (product feeds).
 */
import { AffiliateFeedAdapter } from "../feeds/affiliateFeed";
import { csvToRecords } from "../feeds/parse";
import { applySubId, awinDeepLink } from "../links";
import { arr, get, isObject, str } from "../util";
import { BaseNetworkClient, conversionState, isoDate, parseDiscount, parseMinSpend, signedCents } from "./base";
import type { DateRange, LinkRequest, NetworkConversion, NetworkCoupon, NetworkProduct, NetworkProductQuery, Page } from "./types";

const API = "https://api.awin.com";
const FEED_LIST = "https://ui.awin.com/productdata-darwin-download/publisher";

export interface AwinFeedInfo {
  advertiserId: string;
  advertiserName: string | null;
  feedId: string;
  membership: string | null;
  /** "Awin" (CSV) or "Google" (JSONL enhanced feed). */
  format: string | null;
  region: string | null;
  products: number | null;
  url: string;
}

export class AwinNetworkClient extends BaseNetworkClient {
  readonly id = "awin" as const;
  readonly name = "Awin";
  readonly requiredEnv = ["AWIN_API_TOKEN", "AWIN_PUBLISHER_ID"] as const;
  readonly capabilities = { products: true, coupons: true, conversions: true, links: true };
  override readonly maxReportDays = 31;
  // 20 calls / minute
  protected override defaultRateLimit = { capacity: 3, refillPerSecond: 20 / 60 };

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.requireEnv().AWIN_API_TOKEN}`, Accept: "application/json" };
  }

  private get publisherId(): string {
    return this.requireEnv().AWIN_PUBLISHER_ID as string;
  }

  /** Joined advertisers' feeds (requires AWIN_FEED_API_KEY). */
  async listFeeds(): Promise<AwinFeedInfo[]> {
    const key = this.envValue("AWIN_FEED_API_KEY");
    if (!key) return [];
    const res = await this.guard(() => this.http.request({ url: `${FEED_LIST}/${encodeURIComponent(this.publisherId)}/${encodeURIComponent(key)}/1/feedList` }));
    return parseAwinFeedList(res.text).filter((f) => !f.format || f.format.toLowerCase() === "awin");
  }

  override async fetchProducts(q: NetworkProductQuery, cursor: string | null = null): Promise<Page<NetworkProduct>> {
    this.requireEnv();
    if (!this.envValue("AWIN_FEED_API_KEY")) return this.page([], null, ["AWIN_FEED_API_KEY not set — product feeds disabled (API token alone cannot download feeds)"]);
    const feeds = (await this.listFeeds()).filter((f) => (f.membership ?? "active").toLowerCase() === "active" && (!q.advertiserId || f.advertiserId === q.advertiserId) && (!q.catalogId || f.feedId === q.catalogId));
    const idx = cursor ? Number(cursor) : 0;
    const feed = feeds[idx];
    if (!feed) return this.page([], null, feeds.length ? [] : ["No joined Awin feeds match"]);
    // The list's download URLs default to gzip; request the uncompressed CSV instead (HttpClient reads text).
    const url = feed.url.replace(/\/compression\/[^/]+\//, "/");
    const res = await this.guard(() => this.http.request({ url }));
    const parsed = new AffiliateFeedAdapter({ id: `awin:${feed.advertiserId}`, name: feed.advertiserName ?? `Awin ${feed.advertiserId}`, retailerId: `awin:${feed.advertiserId}`, source: "affiliate" }, { env: {}, clock: this.clock }).parseFeed(res.text, "csv");
    const items = parsed.listings.map((listing) => ({ network: this.id, advertiserId: feed.advertiserId, advertiserName: feed.advertiserName, listing }));
    const warnings = parsed.stats.invalid ? [`feed ${feed.feedId}: ${parsed.stats.invalid} invalid row(s) skipped`] : [];
    return this.page(items, idx + 1 < feeds.length ? String(idx + 1) : null, warnings);
  }

  override async fetchCoupons(cursor: string | null = null): Promise<Page<NetworkCoupon>> {
    const page = cursor ? Number(cursor) : 1;
    const pageSize = 200;
    const res = await this.guard(() =>
      this.http.json<Record<string, unknown> | unknown[]>({
        url: `${API}/publisher/${encodeURIComponent(this.publisherId)}/promotions`,
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ filters: { membership: "joined", status: "active" }, pagination: { page, pageSize } }),
      }),
    );
    const items = arr(Array.isArray(res) ? res : res.data)
      .map((p) => this.mapPromotion(p))
      .filter((c): c is NetworkCoupon => c !== null);
    const total = Array.isArray(res) ? 0 : Number(get(res, "pagination.total") ?? 0);
    return this.page(items, page * pageSize < total ? String(page + 1) : null);
  }

  mapPromotion(raw: unknown): NetworkCoupon | null {
    if (!isObject(raw)) return null;
    const id = str(raw.promotionId);
    const title = str(raw.title);
    if (!id || !title) return null;
    const text = `${title} ${str(raw.description) ?? ""}`;
    return {
      network: this.id,
      externalId: id,
      advertiserId: str(get(raw, "advertiser.id")),
      advertiserName: str(get(raw, "advertiser.name")),
      code: str(get(raw, "voucher.code")),
      title,
      description: str(raw.description) ?? str(raw.terms),
      ...parseDiscount(text),
      minSpendCents: parseMinSpend(`${text} ${str(raw.terms) ?? ""}`),
      startsAt: isoDate(raw.startDate),
      expiresAt: isoDate(raw.endDate),
      trackingUrl: str(raw.urlTracking),
      landingUrl: str(raw.url),
    };
  }

  override async fetchConversions(range: DateRange): Promise<Page<NetworkConversion>> {
    const fmt = (d: Date) => d.toISOString().slice(0, 19);
    const qs = new URLSearchParams({ startDate: fmt(range.since), endDate: fmt(range.until), timezone: "UTC" });
    const res = await this.guard(() => this.http.json<unknown>({ url: `${API}/publishers/${encodeURIComponent(this.publisherId)}/transactions/?${qs.toString()}`, headers: this.headers() }));
    const items = arr(res)
      .map((t) => this.mapTransaction(t))
      .filter((c): c is NetworkConversion => c !== null);
    return this.page(items, null);
  }

  mapTransaction(raw: unknown): NetworkConversion | null {
    if (!isObject(raw)) return null;
    const id = str(raw.id);
    const occurredAt = isoDate(raw.transactionDate);
    if (!id || !occurredAt) return null;
    return {
      network: this.id,
      externalId: id,
      subId: str(get(raw, "clickRefs.clickRef")),
      advertiserId: str(raw.advertiserId),
      advertiserName: null,
      orderId: str(raw.orderRef),
      saleAmountCents: signedCents(get(raw, "saleAmount.amount")),
      commissionCents: signedCents(get(raw, "commissionAmount.amount")),
      currency: (str(get(raw, "commissionAmount.currency")) ?? str(get(raw, "saleAmount.currency")) ?? "USD").toUpperCase(),
      // pending | approved | declined | deleted
      state: conversionState(raw.commissionStatus),
      occurredAt,
      raw,
    };
  }

  override buildLink(req: LinkRequest): string | null {
    if (req.trackingBase) return req.subId ? applySubId(req.trackingBase, req.subId) : req.trackingBase;
    const pub = this.envValue("AWIN_PUBLISHER_ID");
    if (!pub || !req.advertiserId) return null;
    return awinDeepLink({ publisherId: pub, advertiserId: req.advertiserId, destinationUrl: req.destinationUrl, ...(req.subId ? { subId: req.subId } : {}) });
  }

  protected async ping(): Promise<void> {
    await this.guard(() => this.http.json({ url: `${API}/accounts`, headers: this.headers() }));
  }
}

/** Parse the Create-a-Feed list CSV ("Advertiser ID","Advertiser Name",…,"Feed ID",…,"URL"). */
export function parseAwinFeedList(csv: string): AwinFeedInfo[] {
  return csvToRecords(csv)
    .map((r): AwinFeedInfo | null => {
      const advertiserId = str(r.advertiser_id);
      const feedId = str(r.feed_id);
      const url = str(r.url);
      if (!advertiserId || !feedId || !url) return null;
      return {
        advertiserId,
        advertiserName: str(r.advertiser_name),
        feedId,
        membership: str(r.membership_status),
        format: str(r.datafeed_format),
        region: str(r.primary_region),
        products: Number(r.no_of_products) || null,
        url,
      };
    })
    .filter((f): f is AwinFeedInfo => f !== null);
}
