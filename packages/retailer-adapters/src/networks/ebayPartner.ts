/**
 * eBay Partner Network — reporting API (transaction detail) + EPN link building.
 * EPN's partner API is hosted at https://api.partner.ebay.com/Mediapartners/{AccountSID}/ with HTTP Basic
 * AccountSID:AuthToken (credentials: partnernetwork.ebay.com → Tools → API).
 *   Transaction detail: GET /Reports/ebay_partner_transaction_detail.json?STATUS=ALL&START_DATE=&END_DATE=&date_type=update_date
 * UNVERIFIED: no public eBay page documents this reporting endpoint (EPN docs sit behind login). Its shape is
 * the Mediapartners pattern EPN partners receive with their API credentials; Admin → "Test connection" will
 * report an honest HTTP error if it differs. Column names follow the EPN "Transaction Detail" report and the
 * mapper accepts their common spellings. `customid` on our links comes back as the Custom ID column.
 * Links: https://partnerhelp.ebay.com/helpcenter/s/article/What-is-a-Custom-ID
 *
 * Env: EBAY_EPN_ACCOUNT_SID, EBAY_EPN_AUTH_TOKEN (+ EBAY_EPN_CAMPAIGN_ID for links).
 */
import { epnLink } from "../links";
import { arr, base64, isObject, str } from "../util";
import { BaseNetworkClient, conversionState, isoDate, signedCents } from "./base";
import type { DateRange, LinkRequest, NetworkConversion, Page } from "./types";

const API = "https://api.partner.ebay.com";

function pickKey(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "") return raw[k];
  return undefined;
}

export class EbayPartnerNetworkClient extends BaseNetworkClient {
  readonly id = "ebay_partner" as const;
  readonly name = "eBay Partner Network";
  readonly requiredEnv = ["EBAY_EPN_ACCOUNT_SID", "EBAY_EPN_AUTH_TOKEN"] as const;
  readonly capabilities = { products: false, coupons: false, conversions: true, links: true };
  override readonly maxReportDays = 30;
  protected override defaultRateLimit = { capacity: 2, refillPerSecond: 0.5 };

  private get root(): string {
    return `${API}/Mediapartners/${encodeURIComponent(this.requireEnv().EBAY_EPN_ACCOUNT_SID as string)}`;
  }

  private headers(): Record<string, string> {
    const env = this.requireEnv();
    return { Authorization: `Basic ${base64(`${env.EBAY_EPN_ACCOUNT_SID}:${env.EBAY_EPN_AUTH_TOKEN}`)}`, Accept: "application/json" };
  }

  override async fetchConversions(range: DateRange): Promise<Page<NetworkConversion>> {
    const qs = new URLSearchParams({ STATUS: "ALL", START_DATE: range.since.toISOString().slice(0, 10), END_DATE: range.until.toISOString().slice(0, 10), date_type: "update_date" });
    const res = await this.guard(() => this.http.json<Record<string, unknown>>({ url: `${this.root}/Reports/ebay_partner_transaction_detail.json?${qs.toString()}`, headers: this.headers() }));
    const rows = arr(res.Records ?? res.records ?? res.Transactions ?? res);
    const items = rows.map((r) => this.mapTransaction(r)).filter((c): c is NetworkConversion => c !== null);
    return this.page(items, null);
  }

  mapTransaction(raw: unknown): NetworkConversion | null {
    if (!isObject(raw)) return null;
    const id = str(pickKey(raw, ["EpnTransactionId", "Epn_Transaction_Id", "TransactionId", "epn_transaction_id"]));
    const occurredAt = isoDate(pickKey(raw, ["EventDate", "Event_Date", "TransactionDate", "Click_Timestamp", "event_date"]));
    if (!id || !occurredAt) return null;
    const earnings = signedCents(pickKey(raw, ["Earnings", "earnings", "Total_Earnings"]));
    return {
      network: this.id,
      externalId: id,
      subId: str(pickKey(raw, ["CustomId", "Custom_Id", "customid", "custom_id"])),
      advertiserId: "ebay",
      advertiserName: "eBay",
      orderId: str(pickKey(raw, ["ItemId", "Item_Id"])),
      saleAmountCents: signedCents(pickKey(raw, ["Sales", "GMB", "Gross_Merchandise_Bought", "sales"])),
      commissionCents: earnings,
      currency: (str(pickKey(raw, ["Currency", "currency"])) ?? "USD").toUpperCase(),
      state: earnings < 0 ? "reversed" : conversionState(pickKey(raw, ["Status", "TransactionStatus", "status"])),
      occurredAt,
      raw,
    };
  }

  override buildLink(req: LinkRequest): string | null {
    const campaign = this.envValue("EBAY_EPN_CAMPAIGN_ID");
    if (!campaign) return null;
    return epnLink({ campaignId: campaign, destinationUrl: req.destinationUrl, ...(req.subId ? { subId: req.subId } : {}) });
  }

  protected async ping(): Promise<void> {
    const today = new Date(this.clock.now());
    const yesterday = new Date(today.getTime() - 86_400_000);
    await this.fetchConversions({ since: yesterday, until: today });
  }
}
