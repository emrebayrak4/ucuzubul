import type { MessageKey } from "./en-US";

/** en-CA overrides: only keys whose wording differs from en-US (fallback: en-CA → en-US). */
export const enCA = {
  // ── demo ──
  "demo.someDemo": "Some prices are demo data and labelled as such.",

  // ── tax ──
  "tax.us_estimated": "Est. tax {amount} ({region}, US state base rate — local taxes not included)",
  "tax.us_need_zip": "Set a postal code to estimate GST/HST/PST",
  "tax.setZip": "Set postal code",
  "tax.setZipForTax": "set postal code for tax",
  "tax.zipDialogTitle": "Set your postal code",
  "tax.zipDialogBody": "Used only to estimate sales tax (GST/HST/PST) and shipping on offers. Stored in a cookie on this device.",
  "tax.zipLabel": "Postal code",
  "tax.clearZip": "Clear postal code",
  "tax.saveZip": "Save postal code",
  "tax.zipInvalid": "Enter a valid Canadian postal code (e.g. K1A 0B1).",
  "tax.zipSet": "Postal code set to {zip}",
  "tax.estimatedFromZip": "Estimated from your postal code",

  // ── header ──
  "header.taglineStores": "Compare prices across {count, number} Canadian stores",
  "header.taglineMany": "Compare prices across many Canadian stores",
  "header.setZipForTax": "Set postal code for tax",
  "header.favorites": "Favourites",
  "header.travelTagline": "Compare flights and stays across providers — demo data is always labelled.",

  // ── footer ──
  "footer.disclosure": "Affiliate disclosure: WhichLess may earn a commission when you buy through links on this site. Commissions never change our price ranking or Deal Score, and sponsored placements are always labelled. Prices, shipping and tax are estimates; the retailer’s checkout price is final.",

  // ── home ──
  "home.offerCountsLive": "Offer counts are live from our catalogue",

  // ── search ──
  "search.metaDescription": "Search and compare prices across Canadian stores.",
  "search.metaDescriptionQuery": "Compare prices for {query} across Canadian stores, with shipping and estimated tax.",

  // ── catalog ──
  "catalog.categoryMetaDescription": "Compare {name} prices across Canadian stores, with price history and Deal Scores.",
  "catalog.categoryIntro": "{count, plural, one {# product} other {# products}} compared across Canadian stores — lowest price, store count and price history for each.",
  "catalog.bestMetaDescription": "The best-value {name} right now, ranked by Deal Score from real price history across Canadian stores.",
  "catalog.brandMetaDescription": "Compare prices on {name} products across Canadian stores.",
  "catalog.newMetaDescription": "Products that most recently started appearing at the Canadian stores we track.",
  "catalog.popularMetaDescription": "The most widely stocked products by category, compared across Canadian stores.",

  // ── product / offers ──
  "product.inclTaxForZip": "incl. est. tax for postal code {zip}",
  "offers.disclosureSetZip": "We may earn a commission when you buy through “Visit store” links. This never affects the order of offers or the Deal Score. Totals are estimates — set your postal code to include sales tax; the store’s checkout price is final.",

  // ── coupons / stores ──
  "coupons.metaDescription": "Coupon codes and deals from Canadian stores, with real success reports from shoppers. Expired codes are removed.",
  "stores.metaDescription": "Products sold at {name}, compared with other Canadian stores — price history, shipping and estimated tax.",

  // ── basket ──
  "basket.taxZip": "Postal code {zip}",

  // ── account ──
  "account.zipLabel": "Postal code (for tax estimates)",
  "account.airportPlaceholder": "e.g. YYZ",
  "account.errZip": "Enter a valid postal code",
  "account.errAirport": "Use a 3-letter airport code (e.g. YYZ)",

  // ── assistant ──
  "assistant.metaDescription": "Ask questions about products, prices and the best time to buy — answers grounded in tracked catalogue data.",
  "assistant.emptyBody": "Answers are grounded in our catalogue — prices always come from tracked offers, never generated.",

  // ── travel ──
  "travel.heroSub": "Compare flights and hotels from multiple providers — demo data is always labelled.",
  "travel.settingUp": "We’re setting up {providers}. Until then, flight fares and hotel listings are clearly labelled demo data and can’t be booked.",
  "travel.airportUnavailable": "Airport search is unavailable. Type a 3-letter code (e.g. YYZ).",

  // ── flights ──
  "flights.travelerCount": "{count, plural, one {# traveller} other {# travellers}}",
  "flights.travelersSummary": "{count, plural, one {# traveller} other {# travellers}}, {cabin}",
  "flights.travelersAndCabin": "Travellers and cabin class",
  "flights.resultsDisclosure": "Price is per adult incl. taxes (estimated); totals include all travellers. Bag fees are estimates — check the airline before booking. We may earn a commission from “View deal” links; it never affects the order of results or the Best ranking.",
  "flights.legacyDisclosure": "Fares are totals for all travellers as returned by the provider and can change until booked. We may earn a commission from “View deal” links; it never affects the order of results.",

  // ── hotels ──
  "hotels.popularWithTravelers": "Popular with travellers",
  "hotels.workTrip": "I’m travelling for work",
  "hotels.fromCenterKm": "{distance} km from centre",
  "hotels.fromCenterM": "{distance} m from centre",
  "hotels.filters.distance": "Distance from centre",
  "hotels.filters.neighborhood": "Neighbourhood",
  "hotels.filters.maxDistance": "< {distance} km from centre",

  // ── guides ──
  "guides.metaDescription": "Practical city guides: neighbourhoods to stay in, getting around, when to go — with hotel and flight search built in.",
  "guides.searchByNeighborhood": "Search hotels by neighbourhood",

  // ── meta ──
  "meta.siteDescription": "Compare prices across Canadian stores with shipping and estimated tax, real price history, honest Deal Scores, coupons and price alerts.",
  "meta.homeTitle": "WhichLess — Compare prices across Canadian stores, track price drops, find coupons",
  "meta.manifestDescription": "Compare prices across Canadian stores with shipping and estimated tax, price history, coupons and price alerts.",

  // ── a11y ──
  "a11y.setZip": "Set postal code for tax estimates",
} as const satisfies Partial<Record<MessageKey, string>>;
