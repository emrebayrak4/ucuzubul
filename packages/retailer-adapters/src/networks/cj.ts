/**
 * CJ Affiliate — publisher APIs. Auth for all: `Authorization: Bearer <Personal Access Token>`
 * (https://developers.cj.com/authentication/personal-access-token).
 *
 *  - Product Search (GraphQL): POST https://ads.api.cj.com/query
 *      query { products(companyId, partnerIds, keywords, limit, offset) { totalCount count resultList { … linkCode(pid) { clickUrl } } } }
 *      gtin/mpn/availability/condition live only on the concrete `Shopping` type (inline fragment).
 *      limit ≤ 10,000; offset paging is 1-based in CJ's example. 500 calls / 5 min.
 *      Docs: https://developers.cj.com/graphql/reference/Product%20Search
 *  - Link Search (REST, XML): GET https://link-search.api.cj.com/v2/link-search?website-id=&advertiser-ids=joined&promotion-type=coupon&page-number=&records-per-page=
 *      Docs: https://developers.cj.com/docs/rest-apis/link-search
 *  - Commission Detail (GraphQL): POST https://commissions.api.cj.com/query
 *      publisherCommissions(forPublishers:[CID], sincePostingDate, beforePostingDate, sinceCommissionId) { count payloadComplete maxCommissionId records { … shopperId … } }
 *      `shopperId` echoes the SID we put on the click (`sid` field is deprecated). ≤ 31 days per query, ≤ 10,000 records per payload,
 *      200 calls / 5 min. Corrections are separate records (original:false) with negative amounts.
 *      Docs: https://developers.cj.com/graphql/reference/Commission%20Detail
 *      Link Search: 25 calls/minute; paging attributes on <links>; dates MM/DD/YYYY or "ongoing".
 *  - Sub-ID on links: the documented way is linkCode(pid, shopperId) at query time. Appending `&sid=` to a
 *      click-PID-AID URL at redirect time follows CJ publisher guides (UNVERIFIED on a public CJ page — CJ's
 *      publisher-parameter docs require login). Verify one test click in CJ reporting before go-live.
 *
 * Env: CJ_PERSONAL_ACCESS_TOKEN, CJ_COMPANY_ID (publisher CID), CJ_WEBSITE_ID (PID / property id).
 */
import { ResponseShapeError } from "../errors";
import { xmlFirst, xmlRecordsByTag } from "../feeds/parse";
import { cjDeepLink, applySubId } from "../links";
import { arr, get, isObject, str } from "../util";
import { BaseNetworkClient, buildListing, conversionState, isoDate, clean, parseDiscount, parseMinSpend, signedCents } from "./base";
import type { DateRange, LinkRequest, NetworkConversion, NetworkCoupon, NetworkProduct, NetworkProductQuery, Page } from "./types";

const PRODUCTS_URL = "https://ads.api.cj.com/query";
const COMMISSIONS_URL = "https://commissions.api.cj.com/query";
const LINK_SEARCH_URL = "https://link-search.api.cj.com/v2/link-search";

export const CJ_PRODUCTS_QUERY = `query Products($companyId: ID!, $partnerIds: [ID!], $keywords: [String!], $limit: Int, $offset: Int, $pid: ID!) {
  products(companyId: $companyId, partnerIds: $partnerIds, keywords: $keywords, limit: $limit, offset: $offset) {
    totalCount
    count
    resultList {
      id
      catalogId
      advertiserId
      advertiserName
      title
      description
      brand
      link
      imageLink
      price { amount currency }
      salePrice { amount currency }
      linkCode(pid: $pid) { clickUrl }
      ... on Shopping { gtin mpn availability condition productType }
    }
  }
}`;

export const CJ_COMMISSIONS_QUERY = `query Commissions($cid: String!, $since: String!, $before: String!, $sinceId: String) {
  publisherCommissions(forPublishers: [$cid], sincePostingDate: $since, beforePostingDate: $before, sinceCommissionId: $sinceId) {
    count
    payloadComplete
    maxCommissionId
    records {
      commissionId
      actionStatus
      actionType
      orderId
      advertiserId
      advertiserName
      postingDate
      eventDate
      saleAmountUsd
      pubCommissionAmountUsd
      shopperId
      original
    }
  }
}`;

export class CjNetworkClient extends BaseNetworkClient {
  readonly id = "cj" as const;
  readonly name = "CJ Affiliate";
  readonly requiredEnv = ["CJ_PERSONAL_ACCESS_TOKEN", "CJ_COMPANY_ID", "CJ_WEBSITE_ID"] as const;
  readonly capabilities = { products: true, coupons: true, conversions: true, links: true };
  override readonly maxReportDays = 30;
  // Link Search is the tightest CJ limit: 25 calls/minute (product search 500 / 5 min, commissions 200 / 5 min).
  protected override defaultRateLimit = { capacity: 3, refillPerSecond: 0.4 };

  private auth(): Record<string, string> {
    const env = this.requireEnv();
    return { Authorization: `Bearer ${env.CJ_PERSONAL_ACCESS_TOKEN}` };
  }

  private async graphql(url: string, query: string, variables: Record<string, unknown>): Promise<unknown> {
    const res = await this.guard(() =>
      this.http.json<Record<string, unknown>>({ url, method: "POST", headers: { ...this.auth(), "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) }),
    );
    const errors = arr(res.errors);
    if (errors.length && !res.data) throw new ResponseShapeError(this.id, `GraphQL error: ${str(get(errors[0], "message")) ?? "unknown"}`);
    return res.data;
  }

  override async fetchProducts(q: NetworkProductQuery, cursor: string | null = null): Promise<Page<NetworkProduct>> {
    const env = this.requireEnv();
    const limit = Math.min(1000, Math.max(1, q.pageSize ?? 500));
    const offset = cursor ? Number(cursor) : 1;
    const data = await this.graphql(PRODUCTS_URL, CJ_PRODUCTS_QUERY, {
      companyId: env.CJ_COMPANY_ID,
      pid: env.CJ_WEBSITE_ID,
      limit,
      offset,
      ...(q.advertiserId ? { partnerIds: [q.advertiserId] } : {}),
      ...(q.keywords ? { keywords: q.keywords.split(/\s+/).filter(Boolean) } : {}),
    });
    const list = arr(get(data, "products.resultList"));
    const total = Number(get(data, "products.totalCount") ?? 0);
    const items = list.map((r) => this.mapProduct(r)).filter((p): p is NetworkProduct => p !== null);
    const nextOffset = offset + list.length;
    // offset paging is capped at 10,000 records by CJ
    return this.page(items, list.length > 0 && nextOffset <= Math.min(total, 10_000) ? String(nextOffset) : null);
  }

  mapProduct(raw: unknown): NetworkProduct | null {
    if (!isObject(raw)) return null;
    const advertiserId = str(raw.advertiserId);
    if (!advertiserId) return null;
    const listing = buildListing({
      retailerId: `cj:${advertiserId}`,
      sku: str(raw.id),
      title: str(raw.title),
      brand: raw.brand,
      mpn: raw.mpn,
      gtin: raw.gtin,
      imageUrl: raw.imageLink,
      productUrl: raw.link,
      affiliateUrl: get(raw, "linkCode.clickUrl"),
      description: raw.description,
      category: raw.productType,
      price: get(raw, "price.amount"),
      salePrice: get(raw, "salePrice.amount"),
      currency: get(raw, "price.currency"),
      availability: raw.availability,
      condition: raw.condition,
      observedAt: new Date(this.clock.now()).toISOString(),
    });
    return listing ? { network: this.id, advertiserId, advertiserName: str(raw.advertiserName), listing } : null;
  }

  override async fetchCoupons(cursor: string | null = null): Promise<Page<NetworkCoupon>> {
    const env = this.requireEnv();
    const page = cursor ? Number(cursor) : 1;
    const qs = new URLSearchParams({
      "website-id": env.CJ_WEBSITE_ID as string,
      "advertiser-ids": "joined",
      "promotion-type": "coupon",
      "page-number": String(page),
      "records-per-page": "100",
    });
    const res = await this.guard(() => this.http.request({ url: `${LINK_SEARCH_URL}?${qs.toString()}`, headers: { ...this.auth(), Accept: "application/xml" } }));
    const items = this.mapLinkSearch(res.text);
    const total = Number(xmlFirst(res.text, "links", "total-matched") ?? 0);
    const returned = Number(xmlFirst(res.text, "links", "records-returned") ?? items.length);
    return this.page(items, returned > 0 && page * 100 < total ? String(page + 1) : null);
  }

  mapLinkSearch(xml: string): NetworkCoupon[] {
    return xmlRecordsByTag(xml, "link")
      .map((r): NetworkCoupon | null => {
        const id = str(r.link_id);
        const title = str(r.link_name) ?? str(r.description);
        if (!id || !title) return null;
        const text = `${title} ${r.description ?? ""}`;
        const d = parseDiscount(text);
        return {
          network: this.id,
          externalId: id,
          advertiserId: clean(r.advertiser_id),
          advertiserName: str(r.advertiser_name),
          code: clean(r.coupon_code),
          title,
          description: clean(r.description),
          ...d,
          minSpendCents: parseMinSpend(text),
          startsAt: isoDate(r.promotion_start_date),
          expiresAt: isoDate(r.promotion_end_date),
          trackingUrl: clean(r.clickurl),
          landingUrl: clean(r.destination),
        };
      })
      .filter((c): c is NetworkCoupon => c !== null);
  }

  override async fetchConversions(range: DateRange, cursor: string | null = null): Promise<Page<NetworkConversion>> {
    const env = this.requireEnv();
    const data = await this.graphql(COMMISSIONS_URL, CJ_COMMISSIONS_QUERY, {
      cid: env.CJ_COMPANY_ID,
      since: range.since.toISOString().replace(/\.\d{3}Z$/, "Z"),
      before: range.until.toISOString().replace(/\.\d{3}Z$/, "Z"),
      ...(cursor ? { sinceId: cursor } : {}),
    });
    const root = get(data, "publisherCommissions");
    const items = arr(get(root, "records"))
      .map((r) => this.mapCommission(r))
      .filter((c): c is NetworkConversion => c !== null);
    const complete = get(root, "payloadComplete") !== false;
    const maxId = str(get(root, "maxCommissionId"));
    return this.page(items, !complete && maxId ? maxId : null);
  }

  mapCommission(raw: unknown): NetworkConversion | null {
    if (!isObject(raw)) return null;
    const id = str(raw.commissionId);
    const occurredAt = isoDate(raw.eventDate) ?? isoDate(raw.postingDate);
    if (!id || !occurredAt) return null;
    return {
      network: this.id,
      externalId: id,
      subId: str(raw.shopperId),
      advertiserId: str(raw.advertiserId),
      advertiserName: str(raw.advertiserName),
      orderId: str(raw.orderId),
      saleAmountCents: signedCents(raw.saleAmountUsd),
      commissionCents: signedCents(raw.pubCommissionAmountUsd),
      currency: "USD",
      // CJ actionStatus: new | extended | locked | closed; corrections arrive as separate records with negative amounts.
      state: signedCents(raw.pubCommissionAmountUsd) < 0 ? "reversed" : str(raw.actionStatus)?.toLowerCase() === "closed" || str(raw.actionStatus)?.toLowerCase() === "locked" ? "approved" : conversionState(raw.actionStatus),
      occurredAt,
      raw,
    };
  }

  override buildLink(req: LinkRequest): string | null {
    if (req.trackingBase) return req.subId ? applySubId(req.trackingBase, req.subId) : req.trackingBase;
    const pid = this.envValue("CJ_WEBSITE_ID");
    if (!pid) return null;
    return cjDeepLink({ websiteId: pid, destinationUrl: req.destinationUrl, ...(req.subId ? { subId: req.subId } : {}) });
  }

  protected async ping(): Promise<void> {
    const env = this.requireEnv();
    // Cheapest authenticated call: one product row for our company.
    await this.graphql(PRODUCTS_URL, CJ_PRODUCTS_QUERY, { companyId: env.CJ_COMPANY_ID, pid: env.CJ_WEBSITE_ID, limit: 1, offset: 1 });
  }
}

