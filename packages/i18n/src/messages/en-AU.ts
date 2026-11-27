import type { MessageKey } from "./en-US";

/** en-AU overrides: only keys whose wording differs from en-GB (fallback: en-AU → en-GB → en-US). */
export const enAU = {
  // ── tax ──
  "tax.us_need_zip": "Prices include GST",
  "tax.addedAtCheckout": "GST included",
  "tax.zipInvalid": "Enter a 4-digit postcode.",

  // ── header ──
  "header.taglineStores": "Compare prices across {count, number} Australian stores",
  "header.taglineMany": "Compare prices across many Australian stores",

  // ── search ──
  "search.metaDescription": "Search and compare prices across Australian stores.",
  "search.metaDescriptionQuery": "Compare prices for {query} across Australian stores, including delivery.",

  // ── catalog ──
  "catalog.categoryMetaDescription": "Compare {name} prices across Australian stores, with price history and Deal Scores.",
  "catalog.categoryIntro": "{count, plural, one {# product} other {# products}} compared across Australian stores — lowest price, store count and price history for each.",
  "catalog.bestMetaDescription": "The best-value {name} right now, ranked by Deal Score from real price history across Australian stores.",
  "catalog.brandMetaDescription": "Compare prices on {name} products across Australian stores.",
  "catalog.newMetaDescription": "Products that most recently started appearing at the Australian stores we track.",
  "catalog.popularMetaDescription": "The most widely stocked products by category, compared across Australian stores.",

  // ── product / offers ──
  "product.exclTax": "excl. GST",
  "product.inclTaxForZip": "incl. GST · postcode {zip}",
  "offers.estTax": "GST",

  // ── alerts ──
  "alerts.enterTarget": "Enter a target price in dollars.",
  "alerts.enterWholeTarget": "Enter a target price in whole dollars.",

  // ── coupons / stores ──
  "coupons.metaDescription": "Coupon codes and deals from Australian stores, with real success reports from shoppers. Expired codes are removed.",
  "stores.metaDescription": "Products sold at {name}, compared with other Australian stores — price history and delivery costs.",

  // ── basket ──
  "basket.estTotalInclTax": "est. total incl. GST",
  "basket.estTotalExclTax": "est. total, excl. GST",
  "basket.taxEstimate": "GST estimate:",

  // ── account ──
  "account.airportPlaceholder": "e.g. SYD",
  "account.errAirport": "Use a 3-letter airport code (e.g. SYD)",

  // ── travel / flights ──
  "travel.airportUnavailable": "Airport search is unavailable. Type a 3-letter code (e.g. SYD).",
  "flights.carryOnIncluded": "Carry-on bag included",
  "flights.personalItemCarryOnFee": "Personal item only · carry-on est. {price}",
  "flights.carryOn": "Carry-on",
  "flights.noCarryOn": "No carry-on",
  "flights.carryOnBag": "Carry-on bag",

  // ── meta ──
  "meta.siteDescription": "Compare prices across Australian stores with delivery costs, real price history, honest Deal Scores, coupons and price alerts.",
  "meta.homeTitle": "WhichLess — Compare prices across Australian stores, track price drops, find coupons",
  "meta.manifestDescription": "Compare prices across Australian stores with delivery costs, price history, coupons and price alerts.",
} as const satisfies Partial<Record<MessageKey, string>>;
