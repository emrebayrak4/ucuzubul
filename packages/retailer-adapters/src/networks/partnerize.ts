/**
 * Partnerize — Partner (publisher) API. Docs: https://api-docs.partnerize.com/partner/
 * Auth: HTTP Basic base64(user_application_key:user_api_key).
 *  - Campaigns:   GET https://api.partnerize.com/user/publisher/{publisherId}/campaign/a.json   (approved campaigns; health check)
 *  - Conversions: GET https://api.partnerize.com/reporting/report_publisher/publisher/{publisherId}/conversion.json?start_date=&end_date=&limit=&cursor_id=
 *                 → { conversions: [{ conversion_data: { conversion_id, campaign_id, campaign_title, publisher_reference, advertiser_reference,
 *                     conversion_time, currency, conversion_value{ conversion_status, value, publisher_commission } } }],
 *                     hypermedia: { pagination: { next_page } } }   (cursor paging, limit ≤ 300)
 *  - Links:       https://prf.hn/click/camref:{camref}/pubref:{pubref}/destination:{url}
 * Rate limits are not published; X-RateLimit-* headers and 429 are honoured by the shared HTTP client.
 * Vouchers/feeds/link APIs exist but are not wired yet (coupons/products capability off).
 *
 * Env: PARTNERIZE_USER_API_KEY, PARTNERIZE_USER_APPLICATION_KEY, PARTNERIZE_PUBLISHER_ID.
 */
import { applySubId, partnerizeDeepLink } from "../links";
import { arr, base64, get, isObject, str } from "../util";
import { BaseNetworkClient, conversionState, isoDate, signedCents } from "./base";
import type { DateRange, LinkRequest, NetworkConversion, Page } from "./types";

const API = "https://api.partnerize.com";

/** Extract `cursor_id` from hypermedia next_page (a URL or path); null when there is no next page. */
export function nextCursor(nextPage: unknown): string | null {
  const s = str(nextPage);
  if (!s) return null;
  try {
    return new URL(s, API).searchParams.get("cursor_id");
  } catch {
    return null;
  }
}

export class PartnerizeNetworkClient extends BaseNetworkClient {
  readonly id = "partnerize" as const;
  readonly name = "Partnerize";
  readonly requiredEnv = ["PARTNERIZE_USER_API_KEY", "PARTNERIZE_USER_APPLICATION_KEY", "PARTNERIZE_PUBLISHER_ID"] as const;
  readonly capabilities = { products: false, coupons: false, conversions: true, links: true };
  override readonly maxReportDays = 30;
  protected override defaultRateLimit = { capacity: 3, refillPerSecond: 1 };

  private headers(): Record<string, string> {
    const env = this.requireEnv();
    return { Authorization: `Basic ${base64(`${env.PARTNERIZE_USER_APPLICATION_KEY}:${env.PARTNERIZE_USER_API_KEY}`)}`, Accept: "application/json" };
  }

  private get publisherId(): string {
    return encodeURIComponent(this.requireEnv().PARTNERIZE_PUBLISHER_ID as string);
  }

  override async fetchConversions(range: DateRange, cursor: string | null = null): Promise<Page<NetworkConversion>> {
    const limit = 300;
    const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
    const qs = new URLSearchParams({ start_date: fmt(range.since), end_date: fmt(range.until), limit: String(limit), date_type: "last_updated" });
    if (cursor) qs.set("cursor_id", cursor);
    const res = await this.guard(() =>
      this.http.json<Record<string, unknown>>({ url: `${API}/reporting/report_publisher/publisher/${this.publisherId}/conversion.json?${qs.toString()}`, headers: this.headers() }),
    );
    const rows = arr(res.conversions);
    const items = rows.map((r) => this.mapConversion(r)).filter((c): c is NetworkConversion => c !== null);
    return this.page(items, rows.length > 0 ? nextCursor(get(res, "hypermedia.pagination.next_page")) : null);
  }

  mapConversion(raw: unknown): NetworkConversion | null {
    const d = isObject(raw) && isObject(raw.conversion_data) ? raw.conversion_data : raw;
    if (!isObject(d)) return null;
    const id = str(d.conversion_id);
    const occurredAt = isoDate(d.conversion_time);
    if (!id || !occurredAt) return null;
    return {
      network: this.id,
      externalId: id,
      subId: str(d.publisher_reference),
      advertiserId: str(d.campaign_id),
      advertiserName: str(d.campaign_title),
      orderId: str(d.advertiser_reference),
      saleAmountCents: signedCents(get(d, "conversion_value.value") ?? d.value),
      commissionCents: signedCents(get(d, "conversion_value.publisher_commission") ?? d.commission),
      currency: (str(d.currency) ?? "USD").toUpperCase(),
      // pending | approved | rejected
      state: conversionState(get(d, "conversion_value.conversion_status") ?? d.conversion_status),
      occurredAt,
      raw: d,
    };
  }

  /** Partnerize links need the campaign's camref: pass it as trackingBase ("camref:XXXX" or a full prf.hn link). */
  override buildLink(req: LinkRequest): string | null {
    if (!req.trackingBase) return null;
    if (req.trackingBase.startsWith("https://prf.hn/")) return req.subId ? applySubId(req.trackingBase, req.subId) : req.trackingBase;
    const camref = req.trackingBase.replace(/^camref:/, "");
    return partnerizeDeepLink({ camref, destinationUrl: req.destinationUrl, ...(req.subId ? { subId: req.subId } : {}) });
  }

  protected async ping(): Promise<void> {
    await this.guard(() => this.http.json({ url: `${API}/user/publisher/${this.publisherId}/campaign/a.json`, headers: this.headers() }));
  }
}
