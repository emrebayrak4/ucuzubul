/**
 * Minimal JSON-LD validator for the schema.org types we emit. Mirrors the "required" (errors) and
 * "recommended" (warnings) fields of Google's rich-result docs plus our own honesty rules
 * (no ratings/reviews, no priceValidUntil, numeric price strings, ISO currency).
 * Used by test/structured-data.test.ts (fixtures) and test/seo-live.test.ts (running dev server).
 */

type Json = Record<string, unknown>;
export interface Issue {
  level: "error" | "warning";
  path: string;
  message: string;
}

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isUrl = (v: unknown) => typeof v === "string" && /^https?:\/\/[^\s]+$/.test(v);
const PRICE = /^\d+(\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const FORBIDDEN = ["aggregateRating", "review", "reviews", "priceValidUntil"];

export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) out.push(JSON.parse(m[1]!));
  return out;
}

export function validateJsonLd(node: unknown, path = "$"): Issue[] {
  const issues: Issue[] = [];
  const err = (p: string, message: string) => issues.push({ level: "error", path: p, message });
  const warn = (p: string, message: string) => issues.push({ level: "warning", path: p, message });
  if (Array.isArray(node)) return node.flatMap((n, i) => validateJsonLd(n, `${path}[${i}]`));
  if (!isObj(node)) return [{ level: "error", path, message: "not an object" }];
  if (path === "$" && node["@context"] !== "https://schema.org") err(path, "@context must be https://schema.org");
  for (const key of Object.keys(node)) {
    if (FORBIDDEN.includes(key)) err(`${path}.${key}`, `"${key}" is not allowed (no fake ratings/reviews/validity dates)`);
  }
  const type = node["@type"];
  const req = (k: string) => {
    if (node[k] === undefined || node[k] === null || node[k] === "") err(`${path}.${k}`, `${String(type)}.${k} is required`);
  };
  switch (type) {
    case "Product": {
      req("name");
      if (node.url !== undefined && !isUrl(node.url)) err(`${path}.url`, "url must be absolute");
      if (!node.image) warn(`${path}.image`, "image recommended");
      if (!node.offers) warn(`${path}.offers`, "no offers (expected when only demo offers exist)");
      if (node.offers) issues.push(...validateJsonLd(node.offers, `${path}.offers`));
      break;
    }
    case "AggregateOffer": {
      req("lowPrice");
      req("priceCurrency");
      req("offerCount");
      if (typeof node.lowPrice === "string" && !PRICE.test(node.lowPrice)) err(`${path}.lowPrice`, "lowPrice must be a decimal string");
      if (typeof node.highPrice === "string" && !PRICE.test(node.highPrice)) err(`${path}.highPrice`, "highPrice must be a decimal string");
      if (Number(node.highPrice) < Number(node.lowPrice)) err(path, "highPrice < lowPrice");
      if (typeof node.priceCurrency === "string" && !CURRENCY.test(node.priceCurrency)) err(`${path}.priceCurrency`, "ISO 4217 code required");
      if (Array.isArray(node.offers)) {
        if (node.offers.length !== node.offerCount) err(`${path}.offerCount`, "offerCount must equal offers.length");
        node.offers.forEach((o, i) => issues.push(...validateJsonLd(o, `${path}.offers[${i}]`)));
      }
      break;
    }
    case "Offer": {
      req("price");
      req("priceCurrency");
      if (typeof node.price === "string" && !PRICE.test(node.price)) err(`${path}.price`, "price must be a decimal string");
      if (typeof node.priceCurrency === "string" && !CURRENCY.test(node.priceCurrency)) err(`${path}.priceCurrency`, "ISO 4217 code required");
      if (node.availability !== undefined && !String(node.availability).startsWith("https://schema.org/")) err(`${path}.availability`, "availability must be a schema.org URL");
      if (!node.availability) warn(`${path}.availability`, "availability recommended");
      break;
    }
    case "BreadcrumbList":
    case "ItemList": {
      const list = node.itemListElement;
      if (!Array.isArray(list) || list.length === 0) {
        err(`${path}.itemListElement`, "itemListElement must be a non-empty array");
        break;
      }
      list.forEach((li, i) => {
        const p = `${path}.itemListElement[${i}]`;
        if (!isObj(li) || li["@type"] !== "ListItem") return err(p, "must be a ListItem");
        if (li.position !== i + 1 && type === "BreadcrumbList") err(`${p}.position`, "positions must be 1..n");
        if (typeof li.position !== "number") err(`${p}.position`, "position required");
        if (!li.name) err(`${p}.name`, "name required");
        const target = type === "BreadcrumbList" ? li.item : li.url;
        // Last breadcrumb may omit item per Google; we always include it.
        if (!isUrl(target)) err(p, `${type === "BreadcrumbList" ? "item" : "url"} must be an absolute URL`);
      });
      break;
    }
    case "Organization": {
      req("name");
      req("url");
      if (!isUrl(node.logo)) warn(`${path}.logo`, "logo URL recommended");
      break;
    }
    case "WebSite": {
      req("name");
      req("url");
      const action = node.potentialAction;
      if (isObj(action)) {
        const target = isObj(action.target) ? action.target.urlTemplate : action.target;
        if (typeof target !== "string" || !target.includes("{search_term_string}")) err(`${path}.potentialAction`, "SearchAction target needs {search_term_string}");
        if (action["query-input"] !== "required name=search_term_string") err(`${path}.potentialAction`, "query-input mismatch");
      }
      break;
    }
    case "FAQPage": {
      const qs = node.mainEntity;
      if (!Array.isArray(qs) || !qs.length) err(`${path}.mainEntity`, "FAQPage needs questions");
      else
        qs.forEach((q, i) => {
          if (!isObj(q) || q["@type"] !== "Question" || !q.name) err(`${path}.mainEntity[${i}]`, "Question.name required");
          else if (!isObj(q.acceptedAnswer) || !q.acceptedAnswer.text) err(`${path}.mainEntity[${i}]`, "acceptedAnswer.text required");
        });
      break;
    }
    case "Article": {
      req("headline");
      if (!node.datePublished && !node.dateModified) warn(path, "datePublished/dateModified recommended");
      if (!node.author) warn(`${path}.author`, "author recommended");
      break;
    }
    case "CollectionPage":
    case "WebPage":
    case "AboutPage":
    case "ContactPage": {
      req("name");
      req("url");
      break;
    }
    default:
      warn(path, `unchecked @type ${String(type)}`);
  }
  return issues;
}
