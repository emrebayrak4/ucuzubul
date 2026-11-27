/**
 * Impact.com — Partner ("Mediapartners") REST API.
 * Base: https://api.impact.com/Mediapartners/{AccountSID}/  · Auth: HTTP Basic AccountSID:AuthToken · Accept: application/json
 * Reference: https://integrations.impact.com/partner-api-reference (v16; pinned with the IR-Version header)
 *
 *  - Campaigns:      GET /Campaigns                   → { Campaigns: [{ CampaignId, CampaignName, ContractStatus }] }
 *  - Catalogs:       GET /Catalogs                    → { Catalogs: [{ Id, Name, CampaignId, CampaignName, NumberOfItems }] }
 *  - Catalog items:  GET /Catalogs/{Id}/Items         → { Items: [{ CatalogItemId, Name, CurrentPrice, OriginalPrice, Currency, Gtin, Mpn, Manufacturer, Url, ImageUrl, StockAvailability … }] }
 *                    `Url` is already our account's tracking URL. Paging past 20,000 items per catalog is not possible.
 *  - Deals (promos): GET /Campaigns/{CampaignId}/Deals → { Deals: [{ Id, Name, State, Type, DiscountType, DiscountPercent, DiscountAmount, DefaultPromoCode, MinimumPurchaseAmount, StartDate, EndDate }] }
 *                    Deals carry no tracking link → one program tracking link per campaign is created via TrackingLinks.
 *  - Actions:        GET /Actions?StartDate=&EndDate= (last-updated window ≤ 45 days; without it only 7 days)
 *                    → { Actions: [{ Id, State (PENDING|APPROVED|REVERSED), Amount (revenue), Payout (commission), Currency, SubId1, EventDate, CampaignId, Oid }] }
 *  - Tracking links: POST /Programs/{ProgramId}/TrackingLinks?DeepLink=&subId1=  (query-string params) → { TrackingURL }
 * Paging: lists return "@nextpageuri" (relative URI of the next page, "" when done).
 * Limits per hour: product search 3,000, /Actions 500, everything else 1,000; 429 carries Retry-After.
 *
 * Env: IMPACT_ACCOUNT_SID, IMPACT_AUTH_TOKEN.
 */
import { ResponseShapeError } from "../errors";
import { applySubId, detectLinkNetwork, impactDeepLink } from "../links";
import { arr, base64, get, isObject, str, toCents } from "../util";
import { BaseNetworkClient, buildListing, conversionState, isoDate, parseDiscount, signedCents } from "./base";
import type { DateRange, DiscountType, LinkRequest, NetworkConversion, NetworkCoupon, NetworkProduct, NetworkProductQuery, Page } from "./types";

const API = "https://api.impact.com";

export class ImpactNetworkClient extends BaseNetworkClient {
  readonly id = "impact" as const;
  readonly name = "Impact.com";
  readonly requiredEnv = ["IMPACT_ACCOUNT_SID", "IMPACT_AUTH_TOKEN"] as const;
  readonly capabilities = { products: true, coupons: true, conversions: true, links: true };
  override readonly maxReportDays = 45;
  override readonly maxLookbackDays = 365;
  // 1,000 calls/hour general limit ≈ 0.28/s
  protected override defaultRateLimit = { capacity: 5, refillPerSecond: 0.25 };

  private get root(): string {
    return `${API}/Mediapartners/${encodeURIComponent(this.requireEnv().IMPACT_ACCOUNT_SID as string)}`;
  }

  private headers(): Record<string, string> {
    const env = this.requireEnv();
    return { Authorization: `Basic ${base64(`${env.IMPACT_ACCOUNT_SID}:${env.IMPACT_AUTH_TOKEN}`)}`, Accept: "application/json", "IR-Version": "16" };
  }

  /** GET a path (relative to the account root) or a "@nextpageuri" (relative to the API host). */
  private async get(pathOrNext: string): Promise<Record<string, unknown>> {
    const url = pathOrNext.startsWith("/Mediapartners/") ? `${API}${pathOrNext}` : `${this.root}${pathOrNext}`;
    return this.guard(() => this.http.json<Record<string, unknown>>({ url, headers: this.headers() }));
  }

  private next(res: Record<string, unknown>): string | null {
    const n = str(res["@nextpageuri"]);
    return n && n.startsWith("/Mediapartners/") ? n : null;
  }

  /** List catalogs (advertiser product feeds the account has access to). */
  async listCatalogs(): Promise<{ id: string; name: string | null; campaignId: string | null; campaignName: string | null; items: number | null }[]> {
    const res = await this.get("/Catalogs?PageSize=1000");
    return arr(res.Catalogs)
      .map((c) => ({
        id: str(get(c, "Id")) ?? "",
        name: str(get(c, "Name")),
        campaignId: str(get(c, "CampaignId")),
        campaignName: str(get(c, "CampaignName")),
        items: Number(get(c, "NumberOfItems") ?? NaN) || null,
      }))
      .filter((c) => c.id !== "");
  }

  override async fetchProducts(q: NetworkProductQuery, cursor: string | null = null): Promise<Page<NetworkProduct>> {
    this.requireEnv();
    let path = cursor;
    if (!path) {
      let catalogId = q.catalogId;
      if (!catalogId) {
        const catalogs = await this.listCatalogs();
        const c = q.advertiserId ? catalogs.find((x) => x.campaignId === q.advertiserId) : catalogs[0];
        if (!c) return this.page([], null, [q.advertiserId ? `No Impact catalog for campaign ${q.advertiserId}` : "No Impact catalogs available"]);
        catalogId = c.id;
      }
      const qs = new URLSearchParams({ PageSize: String(Math.min(1000, q.pageSize ?? 1000)) });
      if (q.keywords) qs.set("Query", `Name~'${q.keywords.replace(/'/g, "")}'`);
      path = `/Catalogs/${encodeURIComponent(catalogId)}/Items?${qs.toString()}`;
    }
    const res = await this.get(path);
    const items = arr(res.Items)
      .map((r) => this.mapItem(r, q.advertiserId ?? null))
      .filter((p): p is NetworkProduct => p !== null);
    return this.page(items, this.next(res));
  }

  mapItem(raw: unknown, fallbackCampaign: string | null): NetworkProduct | null {
    if (!isObject(raw)) return null;
    const campaign = str(raw.CampaignId) ?? fallbackCampaign;
    if (!campaign) return null;
    const url = str(raw.Url);
    const isTracking = url !== null && detectLinkNetwork(url) === "impact";
    const listing = buildListing({
      retailerId: `impact:${campaign}`,
      sku: str(raw.CatalogItemId) ?? str(raw.Id),
      title: str(raw.Name),
      brand: raw.Manufacturer ?? raw.Brand,
      mpn: raw.Mpn,
      gtin: raw.Gtin ?? raw.Upc ?? raw.Ean,
      imageUrl: raw.ImageUrl,
      productUrl: isTracking ? null : url,
      affiliateUrl: isTracking ? url : (str(raw.TrackingLink) ?? null),
      description: raw.Description,
      category: raw.Category ?? raw.ProductType,
      price: raw.OriginalPrice ?? raw.CurrentPrice,
      salePrice: raw.CurrentPrice,
      currency: raw.Currency,
      availability: raw.StockAvailability,
      condition: raw.Condition,
      shipping: raw.ShippingRate,
      observedAt: new Date(this.clock.now()).toISOString(),
    });
    return listing ? { network: this.id, advertiserId: campaign, advertiserName: str(raw.CampaignName), listing } : null;
  }

  /** Active campaigns (programs) the account is in. */
  async listCampaigns(): Promise<{ id: string; name: string | null }[]> {
    const res = await this.get("/Campaigns?PageSize=1000");
    return arr(res.Campaigns)
      .filter((c) => (str(get(c, "ContractStatus")) ?? "Active").toLowerCase() === "active")
      .map((c) => ({ id: str(get(c, "CampaignId")) ?? "", name: str(get(c, "CampaignName")) }))
      .filter((c) => c.id !== "");
  }

  /** Cursor = campaign index (deals are listed per campaign). */
  override async fetchCoupons(cursor: string | null = null): Promise<Page<NetworkCoupon>> {
    const campaigns = await this.listCampaigns();
    const idx = cursor ? Number(cursor) : 0;
    const c = campaigns[idx];
    if (!c) return this.page([], null);
    const res = await this.get(`/Campaigns/${encodeURIComponent(c.id)}/Deals?State=ACTIVE&PageSize=1000`);
    const deals = arr(res.Deals)
      .map((d) => this.mapDeal(d, c.name))
      .filter((x): x is NetworkCoupon => x !== null);
    const warnings: string[] = [];
    if (deals.length) {
      try {
        const link = await this.createTrackingLink(c.id);
        for (const d of deals) d.trackingUrl = link;
      } catch (err) {
        warnings.push(`campaign ${c.id}: tracking link not created (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    return this.page(deals, idx + 1 < campaigns.length ? String(idx + 1) : null, warnings);
  }

  mapDeal(raw: unknown, campaignName: string | null = null): NetworkCoupon | null {
    if (!isObject(raw)) return null;
    const id = str(raw.Id);
    const title = str(raw.Name);
    if (!id || !title) return null;
    const state = str(raw.State)?.toUpperCase();
    if (state && state !== "ACTIVE") return null;
    const type = str(raw.Type)?.toUpperCase() ?? "";
    const dType = str(raw.DiscountType)?.toUpperCase() ?? "";
    let discountType: DiscountType;
    let discountValue: number | null = null;
    if (type.includes("FREE_SHIPPING")) discountType = "free_shipping";
    else if (dType.includes("PERCENT") && raw.DiscountPercent !== undefined && raw.DiscountPercent !== "") {
      discountType = "percent";
      discountValue = Math.round(Number(raw.DiscountPercent));
    } else if (dType.includes("FIXED") && raw.DiscountAmount !== undefined) {
      discountType = "amount";
      discountValue = toCents(raw.DiscountAmount);
    } else if (type.includes("BOGO") || dType.includes("BOGO")) discountType = "bogo";
    else ({ discountType, discountValue } = parseDiscount(`${title} ${str(raw.Description) ?? ""}`));
    return {
      network: this.id,
      externalId: id,
      advertiserId: str(raw.CampaignId),
      advertiserName: str(raw.CampaignName) ?? campaignName,
      code: str(raw.DefaultPromoCode) ?? str(raw.PromoCode),
      title,
      description: str(raw.Description),
      discountType,
      discountValue: Number.isFinite(discountValue) ? discountValue : null,
      minSpendCents: toCents(raw.MinimumPurchaseAmount),
      startsAt: isoDate(raw.StartDate),
      expiresAt: isoDate(raw.EndDate),
      trackingUrl: null,
      landingUrl: null,
    };
  }

  override async fetchConversions(range: DateRange, cursor: string | null = null): Promise<Page<NetworkConversion>> {
    // StartDate/EndDate filter on last-updated, so state changes (approved/reversed) of older actions are picked up.
    const qs = new URLSearchParams({
      StartDate: range.since.toISOString().replace(/\.\d{3}Z$/, "Z"),
      EndDate: range.until.toISOString().replace(/\.\d{3}Z$/, "Z"),
      PageSize: "1000",
    });
    const res = await this.get(cursor ?? `/Actions?${qs.toString()}`);
    const items = arr(res.Actions)
      .map((a) => this.mapAction(a))
      .filter((c): c is NetworkConversion => c !== null);
    return this.page(items, this.next(res));
  }

  mapAction(raw: unknown): NetworkConversion | null {
    if (!isObject(raw)) return null;
    const id = str(raw.Id);
    const occurredAt = isoDate(raw.EventDate) ?? isoDate(raw.CreationDate);
    if (!id || !occurredAt) return null;
    return {
      network: this.id,
      externalId: id,
      subId: str(raw.SubId1),
      advertiserId: str(raw.CampaignId),
      advertiserName: str(raw.CampaignName),
      orderId: str(raw.Oid),
      saleAmountCents: signedCents(raw.Amount ?? raw.IntendedAmount),
      commissionCents: signedCents(raw.Payout ?? raw.IntendedPayout),
      currency: (str(raw.Currency) ?? "USD").toUpperCase(),
      // Impact Action State: PENDING | APPROVED | REVERSED (+ LOCKED/CLEARED after approval)
      state: conversionState(raw.State),
      occurredAt,
      raw,
    };
  }

  /**
   * Create a tracking link via the API (async; used during ingestion for products/promos that come
   * without a tracking URL — never on the redirect hot path).
   */
  async createTrackingLink(programId: string, deepLink?: string, subId?: string): Promise<string> {
    const qs = new URLSearchParams();
    if (deepLink) qs.set("DeepLink", deepLink);
    if (subId) qs.set("subId1", subId);
    const res = await this.guard(() =>
      this.http.json<Record<string, unknown>>({ url: `${this.root}/Programs/${encodeURIComponent(programId)}/TrackingLinks?${qs.toString()}`, method: "POST", retries: 1, headers: this.headers() }),
    );
    const url = str(res.TrackingURL) ?? str(res.TrackingUrl);
    if (!url) throw new ResponseShapeError(this.id, "TrackingLinks response without TrackingURL");
    return url;
  }

  override buildLink(req: LinkRequest): string | null {
    if (!req.trackingBase) return null;
    if (detectLinkNetwork(req.trackingBase) === "impact" && /[?&]u=/.test(req.trackingBase)) return req.subId ? applySubId(req.trackingBase, req.subId) : req.trackingBase;
    return impactDeepLink({ trackingBase: req.trackingBase, destinationUrl: req.destinationUrl, ...(req.subId ? { subId: req.subId } : {}) });
  }

  protected async ping(): Promise<void> {
    await this.get("/Campaigns?PageSize=1");
  }
}
