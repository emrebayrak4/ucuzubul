/**
 * Open Icecat — free, manufacturer-approved product content: titles, specs and licensed images (icecat.biz).
 * Content only: Icecat has no prices or offers. Use it to enrich catalog products (by GTIN, or brand + MPN).
 *
 * Live JSON: GET https://live.icecat.biz/api?lang=&shopname=&(GTIN=|Brand=&ProductCode=|icecat_id=)
 * Auth:      the Icecat user name (`shopname`) of a free Open Icecat account; no secret.
 * Errors observed 2026-11-27: 400 {StatusCode:16, "The GTIN can not be found"}, 400 "Products datasheet is not yet
 *            released", 403 {StatusCode:9, "To access Full Icecat content, an app_key is required"} (paid-only product)
 *            → null; 404 {StatusCode:3, "<user> the Icecat user is unknown"} → bad credentials.
 * Open Icecat covers sponsoring brands only; Full Icecat (paid) covers more. Fair Use Policy applies.
 */
import { AdapterCore } from "../base";
import { AdapterHttpError } from "../errors";
import { arr, get, isObject, isValidGtin, str } from "../util";

const ENDPOINT = "https://live.icecat.biz/api";
/** Probe GTIN for health checks: a "not found" answer still proves the account is known. */
const PROBE_GTIN = "4006381333931";

export type IcecatLookup = { gtin: string } | { brand: string; productCode: string } | { icecatId: string };

export interface IcecatImage {
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface IcecatContent {
  icecatId: string;
  title: string;
  shortTitle: string | null;
  brand: string | null;
  productCode: string | null;
  /** Valid GTINs only. */
  gtins: string[];
  category: string | null;
  summary: string | null;
  /** Plain text (HTML stripped). */
  description: string | null;
  images: IcecatImage[];
  /** Feature name → presentation value ("Display diagonal" → "15.8 cm (6.2\")"). */
  specs: Record<string, string>;
  source: "icecat";
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function dimension(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class IcecatClient extends AdapterCore {
  readonly id = "icecat";
  readonly name = "Open Icecat";
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = ["ICECAT_SHOPNAME"] as const;
  protected override ttlSeconds = 7 * 24 * 3600;
  protected override defaultRateLimit = { capacity: 5, refillPerSecond: 2 };

  /** Product content, or null when Icecat has no released datasheet for it. */
  async lookup(q: IcecatLookup, lang = "en"): Promise<IcecatContent | null> {
    const env = this.requireEnv();
    const params = new URLSearchParams({ lang, shopname: env.ICECAT_SHOPNAME as string });
    if ("gtin" in q) {
      const gtin = q.gtin.replace(/[\s-]/g, "");
      if (!isValidGtin(gtin)) throw new RangeError(`invalid GTIN: ${q.gtin}`);
      params.set("GTIN", gtin);
    } else if ("icecatId" in q) {
      params.set("icecat_id", q.icecatId);
    } else {
      params.set("Brand", q.brand);
      params.set("ProductCode", q.productCode);
    }
    const res = await this.guard(async () => {
      try {
        return await this.http.json({ url: `${ENDPOINT}?${params.toString()}` });
      } catch (err) {
        if (err instanceof AdapterHttpError) {
          if (/user is unknown/i.test(err.bodySnippet)) throw new AdapterHttpError(this.id, 401, "Icecat user (ICECAT_SHOPNAME) is unknown", false);
          if (err.status === 400 && /can not be found|not yet released|"StatusCode":\s*16/i.test(err.bodySnippet)) return null;
          // Product exists only in paid Full Icecat: not available to an Open Icecat account (not a credentials problem).
          if (err.status === 403 && /Full Icecat/i.test(err.bodySnippet)) return null;
        }
        throw err;
      }
    });
    return res === null ? null : this.normalize(get(res, "data"));
  }

  private normalize(data: unknown): IcecatContent | null {
    if (!isObject(data)) return null;
    const gi = data.GeneralInfo;
    const icecatId = str(get(gi, "IcecatId"));
    const title = str(get(gi, "Title"));
    if (!icecatId || !title) return null;
    const images: IcecatImage[] = arr(data.Gallery)
      .map((g) => ({ url: str(get(g, "Pic")), thumbUrl: str(get(g, "ThumbPic")), width: dimension(get(g, "PicWidth")), height: dimension(get(g, "PicHeight")) }))
      .filter((g): g is IcecatImage => g.url !== null);
    const high = str(get(data, "Image.HighPic"));
    if (!images.length && high) {
      images.push({ url: high, thumbUrl: str(get(data, "Image.ThumbPic")), width: dimension(get(data, "Image.HighPicWidth")), height: dimension(get(data, "Image.HighPicHeight")) });
    }
    const specs: Record<string, string> = {};
    for (const group of arr(data.FeaturesGroups)) {
      for (const f of arr(get(group, "Features"))) {
        const name = str(get(f, "Feature.Name.Value"));
        const value = str(get(f, "PresentationValue")) ?? str(get(f, "Value"));
        if (name && value && !(name in specs)) specs[name] = value;
      }
    }
    const longDesc = str(get(gi, "Description.LongDesc")) ?? str(get(gi, "Description.MiddleDesc"));
    return {
      icecatId,
      title,
      shortTitle: str(get(gi, "TitleInfo.GeneratedIntTitle")) ?? str(get(gi, "ProductName")),
      brand: str(get(gi, "Brand")),
      productCode: str(get(gi, "BrandPartCode")),
      gtins: arr(get(gi, "GTIN")).map((g) => str(g)).filter((g): g is string => !!g && isValidGtin(g)),
      category: str(get(gi, "Category.Name.Value")),
      summary: str(get(gi, "SummaryDescription.ShortSummaryDescription")),
      description: longDesc ? stripHtml(longDesc) || null : null,
      images,
      specs,
      source: "icecat",
    };
  }

  protected async ping(): Promise<void> {
    await this.lookup({ gtin: PROBE_GTIN });
  }
}
