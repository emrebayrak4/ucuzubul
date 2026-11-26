/**
 * Dependency-free feed parsers.
 *  - CSV/TSV (RFC 4180 quoting, CRLF, BOM, delimiter auto-detect)
 *  - XML product feeds: Google Merchant RSS 2.0 (<item><g:id>…), Atom (<entry>), and generic
 *    <product> lists (CJ/Rakuten/Awin style). Namespaces are stripped ("g:price" -> "price");
 *    nested children are flattened with dots ("shipping.price").
 */

export type Delimiter = "," | "\t" | "|" | ";";

export function detectDelimiter(headerLine: string): Delimiter {
  const candidates: Delimiter[] = [",", "\t", "|", ";"];
  let best: Delimiter = ",";
  let bestCount = -1;
  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of headerLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Parse delimited text into rows of cells. Handles quoted fields with delimiters, quotes ("") and newlines. */
export function parseCsv(text: string, delimiter?: Delimiter): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLineEnd = src.search(/\r?\n/);
  const d = delimiter ?? detectDelimiter(firstLineEnd === -1 ? src : src.slice(0, firstLineEnd));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") inQuotes = true;
    else if (ch === d) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || (row[0] ?? "") !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || (row[0] ?? "") !== "") rows.push(row);
  }
  return rows;
}

/** CSV -> array of records keyed by normalized header (lowercase, spaces/dashes -> underscore). */
export function csvToRecords(text: string, delimiter?: Delimiter): Record<string, string>[] {
  const rows = parseCsv(text, delimiter);
  const header = rows.shift();
  if (!header) return [];
  const keys = header.map(normalizeKey);
  return rows.map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (k) rec[k] = (r[i] ?? "").trim();
    });
    return rec;
  });
}

export function normalizeKey(key: string): string {
  return key
    .trim()
    .replace(/^[a-z]+:/i, "")
    .toLowerCase()
    .replace(/[\s\-/]+/g, "_")
    .replace(/[^a-z0-9_.]/g, "");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeXmlText(raw: string): string {
  let s = raw.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(s);
  if (cdata) return (cdata[1] as string).trim();
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .trim();
}

function parseChildren(xml: string, prefix: string, out: Record<string, string>): void {
  const re = /<([A-Za-z_][\w:.-]*)((?:\s+[^>]*?)?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = re.exec(xml)) !== null) {
    any = true;
    const key = prefix + normalizeKey(m[1] as string);
    const attrs = m[2] ?? "";
    const inner = m[3];
    if (inner === undefined) {
      // self-closing: keep href/url/value attributes (Atom <link href="..."/>)
      const attr = /\b(?:href|url|value)\s*=\s*"([^"]*)"/.exec(attrs);
      if (attr && !(key in out)) out[key] = decodeXmlText(attr[1] as string);
      continue;
    }
    const stripped = inner.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
    if (/<[A-Za-z_]/.test(stripped)) {
      parseChildren(inner, `${key}.`, out);
    } else if (!(key in out)) {
      out[key] = decodeXmlText(inner);
    } else {
      // repeated element (e.g. additional_image_link): keep first, join others
      out[`${key}_all`] = out[`${key}_all`] ? `${out[`${key}_all`]}|${decodeXmlText(inner)}` : `${out[key]}|${decodeXmlText(inner)}`;
    }
  }
  if (!any && prefix) out[prefix.slice(0, -1)] = decodeXmlText(xml);
}

/** Extract product records from an XML feed. Each <item>/<entry>/<product> becomes one flat record. */
export function xmlToRecords(xml: string): Record<string, string>[] {
  const body = xml.replace(/<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const records: Record<string, string>[] = [];
  for (const tag of ["item", "entry", "product", "offer"]) {
    const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}\\s*>`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const rec: Record<string, string> = {};
      parseChildren(m[1] as string, "", rec);
      records.push(rec);
    }
    if (records.length > 0) break;
  }
  return records;
}

export type FeedFormat = "csv" | "xml";

export function detectFeedFormat(content: string): FeedFormat {
  return /^\s*(?:\uFEFF)?\s*</.test(content) ? "xml" : "csv";
}
