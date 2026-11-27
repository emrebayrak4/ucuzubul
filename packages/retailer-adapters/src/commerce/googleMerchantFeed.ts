/**
 * Google Merchant Center product feed (merchant-supplied URL): RSS 2.0 / Atom XML with the g:
 * namespace, or TSV/CSV with Google attribute names.
 * Spec: https://support.google.com/merchants/answer/7052112
 *
 * Safety: https only, SSRF guard (no localhost / private / loopback IPs, DNS answers checked, every
 * redirect hop re-checked, max 3 hops), max response size (20 MB default), request timeout.
 * The feed is fetched in full; the result is a single page (nextCursor null).
 *
 * Config: feedUrl. Use `nextScheduledFetch()` to schedule re-fetches (default every 24h).
 */
import { AdapterHttpError, AdapterTimeoutError } from "../errors";
import { type FetchInitLike, type FetchLike, type FetchResponseLike } from "../http";
import { cleanGtin, currencyFromPriceString, mapAvailability, mapCondition, toCents } from "../util";
import { saleActive } from "../feeds/affiliateFeed";
import { csvToRecords, detectFeedFormat, xmlToRecords } from "../feeds/parse";
import { BaseCommerceConnector, type CommerceConnectorOptions } from "./base";
import type { CommerceCondition, CommerceConfig, CommerceProduct, CommerceStock, CommerceSyncOptions, CommerceSyncResult } from "./types";
import { assertPublicHttpsUrl, UnsafeUrlError, type HostResolver } from "./urlGuard";

export const GOOGLE_FEED_MAX_BYTES = 20 * 1024 * 1024;
export const GOOGLE_FEED_TIMEOUT_MS = 60_000;

export interface GoogleMerchantFeedOptions extends CommerceConnectorOptions {
  resolveHost?: HostResolver;
  maxBytes?: number;
  timeoutMs?: number;
}

/** Next time a feed should be fetched. `lastFetchedAt` null/invalid => due now. */
export function nextScheduledFetch(lastFetchedAt: Date | string | number | null | undefined, intervalHours = 24, now: Date = new Date()): Date {
  if (!(intervalHours > 0)) throw new RangeError("intervalHours must be > 0");
  if (lastFetchedAt === null || lastFetchedAt === undefined) return now;
  const t = lastFetchedAt instanceof Date ? lastFetchedAt.getTime() : typeof lastFetchedAt === "number" ? lastFetchedAt : Date.parse(lastFetchedAt);
  if (!Number.isFinite(t)) return now;
  return new Date(t + intervalHours * 3_600_000);
}

function googleStock(value: string | null): CommerceStock {
  const a = mapAvailability(value ?? undefined);
  if (a === "in_stock") return "in_stock";
  if (a === "limited") return "low_stock";
  if (a === "out_of_stock") return "out_of_stock";
  return "unknown"; // preorder / backorder / missing
}

function googleCondition(value: string | null): CommerceCondition {
  const c = mapCondition(value ?? undefined);
  if (c === "new" || c === "refurbished" || c === "used") return c;
  if (c === "open_box" || c === "for_parts") return "used";
  return "unknown";
}

function field(rec: Record<string, string>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return null;
}

/** Map one flat feed record (namespace-stripped keys) to a CommerceProduct; null when unusable. */
export function mapGoogleFeedRecord(rec: Record<string, string>, nowMs: number): CommerceProduct | null {
  const id = field(rec, "id");
  const title = field(rec, "title");
  const priceRaw = field(rec, "price");
  if (!id || !title || !priceRaw) return null;
  const currency = currencyFromPriceString(priceRaw);
  const regular = toCents(priceRaw);
  if (!currency || regular === null || regular <= 0) return null;
  const saleRaw = field(rec, "sale_price");
  const saleCents = saleRaw && saleActive(field(rec, "sale_price_effective_date"), nowMs) ? toCents(saleRaw) : null;
  const saleCurrency = saleRaw ? (currencyFromPriceString(saleRaw) ?? currency) : currency;
  const onSale = saleCents !== null && saleCents > 0 && saleCents < regular && saleCurrency === currency;
  return {
    externalId: id,
    sku: id,
    title,
    description: field(rec, "description"),
    brand: field(rec, "brand"),
    gtin: cleanGtin(field(rec, "gtin")),
    mpn: field(rec, "mpn"),
    priceCents: onSale ? (saleCents as number) : regular,
    listPriceCents: onSale ? regular : null,
    currency,
    url: field(rec, "link"),
    imageUrl: field(rec, "image_link"),
    condition: googleCondition(field(rec, "condition")),
    inventory: [{ locationExternalId: null, quantity: null, stock: googleStock(field(rec, "availability")) }],
  };
}

/** Parse feed text (XML or TSV/CSV) into products. */
export function parseGoogleMerchantFeed(content: string, nowMs: number = Date.now()): { products: CommerceProduct[]; skipped: number } {
  const records = detectFeedFormat(content) === "xml" ? xmlToRecords(content) : csvToRecords(content);
  const products: CommerceProduct[] = [];
  let skipped = 0;
  for (const r of records) {
    const p = mapGoogleFeedRecord(r, nowMs);
    if (p) products.push(p);
    else skipped++;
  }
  return { products, skipped };
}

interface StreamReaderLike {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}

function bodyReader(res: FetchResponseLike): StreamReaderLike | null {
  const body = (res as unknown as { body?: unknown }).body;
  if (typeof body === "object" && body !== null && typeof (body as { getReader?: unknown }).getReader === "function") {
    return (body as { getReader(): StreamReaderLike }).getReader();
  }
  return null;
}

export class GoogleMerchantFeedConnector extends BaseCommerceConnector {
  readonly provider = "google_merchant" as const;
  readonly requiredConfig = ["feedUrl"];

  constructor(config: CommerceConfig, protected readonly feedOptions: GoogleMerchantFeedOptions = {}) {
    super(config, feedOptions);
  }

  private get fetchImpl(): FetchLike {
    const f = this.feedOptions.fetch ?? (globalThis as unknown as { fetch?: FetchLike }).fetch;
    if (!f) throw new Error("No fetch implementation available");
    return f;
  }

  /** Download the feed with SSRF checks on every hop, a size cap and a timeout. */
  async download(): Promise<string> {
    const maxBytes = this.feedOptions.maxBytes ?? GOOGLE_FEED_MAX_BYTES;
    const timeoutMs = this.feedOptions.timeoutMs ?? GOOGLE_FEED_TIMEOUT_MS;
    let url = (await assertPublicHttpsUrl(this.required("feedUrl"), this.feedOptions.resolveHost)).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      for (let hop = 0; hop <= 3; hop++) {
        const init: FetchInitLike & { redirect: "manual" } = {
          method: "GET",
          headers: { "User-Agent": "PricoraBot/0.1 (+merchant-feed)", Accept: "application/xml, text/xml, text/tab-separated-values, text/plain, */*" },
          signal: controller.signal,
          redirect: "manual",
        };
        const res = await this.fetchImpl(url, init);
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc) throw new AdapterHttpError("commerce:google_merchant", res.status, "redirect without Location", false);
          url = (await assertPublicHttpsUrl(new URL(loc, url).toString(), this.feedOptions.resolveHost)).toString();
          continue;
        }
        if (res.status < 200 || res.status >= 300) throw new AdapterHttpError("commerce:google_merchant", res.status, "", res.status >= 500);
        const declared = Number(res.headers.get("content-length") ?? "NaN");
        if (Number.isFinite(declared) && declared > maxBytes) throw new RangeError(`feed exceeds ${maxBytes} bytes`);
        const reader = bodyReader(res);
        if (!reader) {
          const text = await res.text();
          if (Buffer.byteLength(text, "utf8") > maxBytes) throw new RangeError(`feed exceeds ${maxBytes} bytes`);
          return text;
        }
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel();
            throw new RangeError(`feed exceeds ${maxBytes} bytes`);
          }
          chunks.push(value);
        }
        return Buffer.concat(chunks).toString("utf8");
      }
      throw new UnsafeUrlError("too many redirects");
    } catch (err) {
      if (controller.signal.aborted) throw new AdapterTimeoutError("commerce:google_merchant", timeoutMs);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  protected async fetchPage(_opts: CommerceSyncOptions): Promise<Omit<CommerceSyncResult, "provider" | "status">> {
    const text = await this.download();
    const { products, skipped } = parseGoogleMerchantFeed(text, this.clock.now());
    return {
      products,
      locations: [],
      nextCursor: null,
      ...(skipped > 0 ? { message: `${skipped} feed item(s) skipped (missing id/title/price or currency)` } : {}),
    };
  }
}
