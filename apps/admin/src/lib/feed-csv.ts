import { MERCHANT_FEED_COLUMNS, MerchantFeedRow } from "@pricora/contracts";
import { parseMoneyToCents } from "@pricora/utils";

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, embedded newlines). Also accepts TSV when `delimiter` is "\t". */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0]?.trim() === ""));
}

type FeedColumn = (typeof MERCHANT_FEED_COLUMNS)[number];

/** Google Merchant Center attribute names → our feed columns. */
const ALIASES: Record<string, FeedColumn> = {
  id: "sku",
  offer_id: "sku",
  link: "url",
  image_link: "image_url",
  availability: "stock",
  sale_price: "price",
  google_product_category: "category",
  product_type: "category",
};

const STOCK: Record<string, string> = {
  "in stock": "in_stock",
  in_stock: "in_stock",
  instock: "in_stock",
  "out of stock": "out_of_stock",
  out_of_stock: "out_of_stock",
  outofstock: "out_of_stock",
  preorder: "preorder",
  backorder: "preorder",
  "limited availability": "low_stock",
  low_stock: "low_stock",
  "low stock": "low_stock",
};

const CONDITION: Record<string, string> = {
  new: "new",
  refurbished: "refurbished",
  used: "used",
  open_box: "open_box",
  "open box": "open_box",
};

export interface RowResult {
  /** 1-based data row number (header excluded), matching the API's `errors[].row`. */
  row: number;
  sku: string;
  title: string;
  ok: boolean;
  errors: { field: string; message: string }[];
  data?: MerchantFeedRow;
}

export interface FeedCheck {
  header: string[];
  mapped: Partial<Record<FeedColumn, number>>;
  unknownColumns: string[];
  missingRequired: FeedColumn[];
  rows: RowResult[];
}

const REQUIRED: FeedColumn[] = ["sku", "title", "price", "url"];

/** Client-side pre-check against the same Zod schema the API uses (`MerchantFeedRow`). The API remains the source of truth. */
/** `urlOptional`: local stores may leave `url` empty — those items are listed in-store only (never linked out). */
export function checkFeed(text: string, opts: { urlOptional?: boolean } = {}): FeedCheck {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const all = parseCsv(text, delimiter);
  const header = (all[0] ?? []).map((h) => h.trim());
  const mapped: Partial<Record<FeedColumn, number>> = {};
  const unknownColumns: string[] = [];
  header.forEach((h, idx) => {
    const key = h.toLowerCase().replace(/\s+/g, "_");
    const col = (MERCHANT_FEED_COLUMNS as readonly string[]).includes(key) ? (key as FeedColumn) : ALIASES[key];
    if (col && mapped[col] === undefined) mapped[col] = idx;
    else unknownColumns.push(h);
  });
  const missingRequired = REQUIRED.filter((c) => mapped[c] === undefined && !(c === "url" && opts.urlOptional));

  const rows: RowResult[] = all.slice(1).map((cells, i) => {
    const get = (c: FeedColumn) => {
      const idx = mapped[c];
      const v = idx === undefined ? "" : (cells[idx] ?? "").trim();
      return v;
    };
    const errors: { field: string; message: string }[] = [];
    const money = (c: FeedColumn): number | undefined => {
      const raw = get(c);
      if (!raw) return undefined;
      // Google shipping format "US:::5.99 USD" → take the trailing amount.
      const amount = raw.includes(":") ? (raw.split(":").pop() ?? "") : raw;
      const cents = parseMoneyToCents(amount);
      if (cents === null) {
        errors.push({ field: c, message: `“${raw}” is not a valid amount` });
        return undefined;
      }
      return cents;
    };
    const stockRaw = get("stock").toLowerCase();
    const condRaw = get("condition").toLowerCase();
    const candidate = {
      sku: get("sku"),
      title: get("title"),
      brand: get("brand") || undefined,
      gtin: get("gtin").replace(/[\s-]/g, "") || undefined,
      mpn: get("mpn") || undefined,
      condition: condRaw ? (CONDITION[condRaw] ?? condRaw) : undefined,
      priceCents: money("price"),
      listPriceCents: money("list_price"),
      shippingCents: money("shipping"),
      stock: stockRaw ? (STOCK[stockRaw] ?? stockRaw) : undefined,
      url: get("url"),
      imageUrl: get("image_url") || undefined,
      category: get("category") || undefined,
    };
    if (candidate.priceCents === undefined && !errors.some((e) => e.field === "price")) {
      errors.push({ field: "price", message: "Price is required" });
    }
    const parsed = MerchantFeedRow.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "row");
        if (field === "priceCents" && errors.some((e) => e.field === "price")) continue;
        if (field === "url" && opts.urlOptional && !candidate.url) continue;
        errors.push({ field, message: issue.message });
      }
    }
    if (parsed.success && parsed.data.listPriceCents !== undefined && parsed.data.listPriceCents < parsed.data.priceCents) {
      errors.push({ field: "list_price", message: "List price is lower than price (would never be shown as a strike-through)" });
    }
    return {
      row: i + 1,
      sku: candidate.sku,
      title: candidate.title,
      ok: errors.length === 0,
      errors,
      data: parsed.success ? parsed.data : undefined,
    };
  });

  return { header, mapped, unknownColumns, missingRequired, rows };
}

export const SAMPLE_HEADER = MERCHANT_FEED_COLUMNS.join(",");
