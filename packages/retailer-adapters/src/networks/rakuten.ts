/**
 * Rakuten Advertising — publisher web services (https://developers.rakutenadvertising.com/).
 *
 *  - Token:          POST https://api.linksynergy.com/token
 *                    Authorization: Bearer base64(client_id:client_secret) (Bearer, not Basic) · body grant_type=password&scope=<SID>
 *                    → { access_token, refresh_token, expires_in }   (docs: /guides/try_it_out "Access token")
 *  - Product Search: GET https://api.linksynergy.com/productsearch/1.0?keyword=&mid=&max=&pagenumber=   (XML <result><item>…)
 *  - Coupons:        GET https://api.linksynergy.com/coupon/1.0?network=1&resultsperpage=&pagenumber=  (XML <couponfeed><link>…)
 *  - Transactions:   GET https://api.linksynergy.com/events/1.0/transactions?process_date_start=&process_date_end=&limit=&page=  (JSON array; `u1` = our sub-id)
 *  - Deep links:     https://click.linksynergy.com/deeplink?id=<encrypted id>&mid=<advertiser>&murl=<url>&u1=<sub>
 *                    (manual host/path UNVERIFIED on a current Rakuten page; the official deep-link API is POST /v1/links/deep_links)
 * Rate limit: 100 calls/minute per API; exceeding it returns HTTP 403 (not 429). Events: ≤ 30-day range,
 * process_date ≤ 30 days back, data kept ~1–2 weeks and commission changes are not reflected (reversals arrive as negatives).
 *
 * Env: RAKUTEN_CLIENT_ID, RAKUTEN_CLIENT_SECRET, RAKUTEN_SID; optional RAKUTEN_ENCRYPTED_ID (for deep links).
 */
import { createHash } from "node:crypto";
import { ResponseShapeError } from "../errors";
import { xmlFirst, xmlRecordsByTag } from "../feeds/parse";
import { applySubId, rakutenDeepLink } from "../links";
import { TokenCache } from "../oauth";
import type { AdapterOptions } from "../base";
import { arr, base64, isObject, str } from "../util";
import { BaseNetworkClient, buildListing, isoDate, clean, parseDiscount, parseMinSpend, signedCents } from "./base";
import type { DateRange, DiscountType, LinkRequest, NetworkConversion, NetworkCoupon, NetworkProduct, NetworkProductQuery, Page } from "./types";

const API = "https://api.linksynergy.com";

/** "YYYY-MM-DD HH:MM:SS" (UTC) as expected by the Events API. */
function rakutenDate(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export class RakutenNetworkClient extends BaseNetworkClient {
  readonly id = "rakuten" as const;
  readonly name = "Rakuten Advertising";
  readonly requiredEnv = ["RAKUTEN_CLIENT_ID", "RAKUTEN_CLIENT_SECRET", "RAKUTEN_SID"] as const;
  readonly capabilities = { products: true, coupons: true, conversions: true, links: true };
  override readonly maxReportDays = 30;
  override readonly maxLookbackDays = 29;
  protected override defaultRateLimit = { capacity: 3, refillPerSecond: 0.5 };
  private readonly tokens: TokenCache;

  constructor(options: AdapterOptions = {}) {
    super(options);
    this.tokens = new TokenCache(this.clock);
  }

  private async token(): Promise<string> {
    const env = this.requireEnv();
    return this.tokens.get(async () => {
      const res = await this.guard(() =>
        this.http.json<Record<string, unknown>>({
          url: `${API}/token`,
          method: "POST",
          headers: { Authorization: `Bearer ${base64(`${env.RAKUTEN_CLIENT_ID}:${env.RAKUTEN_CLIENT_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "password", scope: env.RAKUTEN_SID as string }).toString(),
        }),
      );
      const accessToken = str(res.access_token);
      if (!accessToken) throw new ResponseShapeError(this.id, "token response without access_token");
      return { accessToken, expiresInSec: Number(res.expires_in) || 3600 };
    });
  }

  private async call(path: string, accept: "xml" | "json"): Promise<string> {
    const token = await this.token();
    const res = await this.guard(() =>
      this.http.request({ url: `${API}${path}`, headers: { Authorization: `Bearer ${token}`, Accept: accept === "xml" ? "application/xml" : "application/json" } }),
    );
    return res.text;
  }

  override async fetchProducts(q: NetworkProductQuery, cursor: string | null = null): Promise<Page<NetworkProduct>> {
    this.requireEnv();
    const page = cursor ? Number(cursor) : 1;
    const qs = new URLSearchParams({ max: String(Math.min(100, q.pageSize ?? 100)), pagenumber: String(page) });
    if (q.keywords) qs.set("keyword", q.keywords);
    if (q.advertiserId) qs.set("mid", q.advertiserId);
    const xml = await this.call(`/productsearch/1.0?${qs.toString()}`, "xml");
    const items = this.mapProductSearch(xml);
    const totalPages = Number(xmlFirst(xml, "TotalPages") ?? 0);
    return this.page(items, page < totalPages ? String(page + 1) : null);
  }

  mapProductSearch(xml: string): NetworkProduct[] {
    const now = new Date(this.clock.now()).toISOString();
    return xmlRecordsByTag(xml, "item")
      .map((r): NetworkProduct | null => {
        const mid = str(r.mid);
        if (!mid) return null;
        const link = str(r.linkurl);
        const listing = buildListing({
          retailerId: `rakuten:${mid}`,
          sku: str(r.sku) ?? str(r.linkid),
          title: str(r.productname),
          gtin: r.upccode,
          imageUrl: r.imageurl,
          productUrl: null,
          affiliateUrl: link,
          description: r["description.short"] ?? r.description,
          category: [str(r["category.primary"]), str(r["category.secondary"])].filter(Boolean).join(" > ") || null,
          price: r.price,
          salePrice: r.saleprice,
          currency: "USD",
          observedAt: now,
        });
        return listing ? { network: this.id, advertiserId: mid, advertiserName: str(r.merchantname), listing } : null;
      })
      .filter((p): p is NetworkProduct => p !== null);
  }

  override async fetchCoupons(cursor: string | null = null): Promise<Page<NetworkCoupon>> {
    const page = cursor ? Number(cursor) : 1;
    const xml = await this.call(`/coupon/1.0?network=1&resultsperpage=500&pagenumber=${page}`, "xml");
    const items = this.mapCoupons(xml);
    const totalPages = Number(xmlFirst(xml, "TotalPages") ?? 0);
    return this.page(items, page < totalPages ? String(page + 1) : null);
  }

  mapCoupons(xml: string): NetworkCoupon[] {
    return xmlRecordsByTag(xml, "link")
      .map((r): NetworkCoupon | null => {
        const title = str(r.offerdescription);
        const click = str(r.clickurl);
        const advertiserId = str(r.advertiserid);
        if (!title || !advertiserId) return null;
        const offerId = click ? (() => {
          try {
            return new URL(click).searchParams.get("offerid");
          } catch {
            return null;
          }
        })() : null;
        const code = clean(r.couponcode);
        const externalId = offerId ?? createHash("sha256").update(`${advertiserId}|${click ?? ""}|${code ?? ""}|${title}`).digest("hex").slice(0, 32);
        const promo = `${str(r.promotiontypes) ?? ""} ${str(r["promotiontypes.promotiontype"]) ?? ""}`.toLowerCase();
        let d: { discountType: DiscountType; discountValue: number | null } = parseDiscount(title);
        if (d.discountType === "other" && promo.includes("free shipping")) d = { discountType: "free_shipping", discountValue: null };
        return {
          network: this.id,
          externalId,
          advertiserId,
          advertiserName: str(r.advertisername),
          code,
          title,
          description: clean(r.couponrestriction),
          ...d,
          minSpendCents: parseMinSpend(`${title} ${r.couponrestriction ?? ""}`),
          startsAt: isoDate(r.offerstartdate),
          expiresAt: isoDate(r.offerenddate),
          trackingUrl: click,
          landingUrl: null,
        };
      })
      .filter((c): c is NetworkCoupon => c !== null);
  }

  override async fetchConversions(range: DateRange, cursor: string | null = null): Promise<Page<NetworkConversion>> {
    const page = cursor ? Number(cursor) : 1;
    const limit = 1000;
    const qs = new URLSearchParams({ process_date_start: rakutenDate(range.since), process_date_end: rakutenDate(range.until), limit: String(limit), page: String(page) });
    const text = await this.call(`/events/1.0/transactions?${qs.toString()}`, "json");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ResponseShapeError(this.id, "transactions response is not JSON");
    }
    const rows = arr(parsed);
    const items = rows.map((r) => this.mapTransaction(r)).filter((c): c is NetworkConversion => c !== null);
    return this.page(items, rows.length >= limit ? String(page + 1) : null);
  }

  mapTransaction(raw: unknown): NetworkConversion | null {
    if (!isObject(raw)) return null;
    const id = str(raw.etransaction_id);
    const occurredAt = isoDate(raw.transaction_date) ?? isoDate(raw.process_date);
    if (!id || !occurredAt) return null;
    const sale = signedCents(raw.sale_amount);
    const commission = signedCents(raw.commissions);
    return {
      network: this.id,
      externalId: id,
      subId: str(raw.u1),
      advertiserId: str(raw.advertiser_id),
      advertiserName: null,
      orderId: str(raw.order_id),
      saleAmountCents: sale,
      commissionCents: commission,
      currency: (str(raw.currency) ?? "USD").toUpperCase(),
      // Rakuten reports returns/cancellations as separate negative transactions; the network has no "approved" flag here.
      state: commission < 0 || sale < 0 ? "reversed" : "pending",
      occurredAt,
      raw,
    };
  }

  override buildLink(req: LinkRequest): string | null {
    if (req.trackingBase) return req.subId ? applySubId(req.trackingBase, req.subId) : req.trackingBase;
    const encryptedId = this.envValue("RAKUTEN_ENCRYPTED_ID");
    if (!encryptedId || !req.advertiserId) return null;
    return rakutenDeepLink({ siteId: encryptedId, advertiserId: req.advertiserId, destinationUrl: req.destinationUrl, ...(req.subId ? { subId: req.subId } : {}) });
  }

  protected async ping(): Promise<void> {
    this.tokens.invalidate();
    await this.token();
  }
}
