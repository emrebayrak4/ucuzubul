import type { MessageKey } from "./en-US";

/** en-GB overrides: only keys whose wording differs from en-US (fallback: en-GB → en-US). */
export const enGB = {
  // ── demo ──
  "demo.someDemo": "Some prices are demo data and labelled as such.",

  // ── tax ──
  "tax.us_estimated": "Est. tax {amount} ({region}, US state base rate — local taxes not included)",
  "tax.us_need_zip": "Prices include VAT",
  "tax.addedAtCheckout": "VAT included",
  "tax.setZip": "Set postcode",
  "tax.setZipForTax": "set postcode",
  "tax.zipDialogTitle": "Set your postcode",
  "tax.zipDialogBody": "Used only to estimate delivery costs on offers. Stored in a cookie on this device.",
  "tax.zipLabel": "Postcode",
  "tax.clearZip": "Clear postcode",
  "tax.saveZip": "Save postcode",
  "tax.zipInvalid": "Enter a valid UK postcode.",
  "tax.zipSet": "Postcode set to {zip}",
  "tax.zipSetBody": "Delivery and totals are now estimated for this area.",
  "tax.estimatedFromZip": "Estimated from your postcode",

  // ── header ──
  "header.taglineStores": "Compare prices across {count, number} UK stores",
  "header.taglineMany": "Compare prices across many UK stores",
  "header.setZipForTax": "Set postcode",
  "header.favorites": "Favourites",
  "header.travelTagline": "Compare flights and stays across providers — demo data is always labelled.",

  // ── footer ──
  "footer.disclosure": "Affiliate disclosure: WhichLess may earn a commission when you buy through links on this site. Commissions never change our price ranking or Deal Score, and sponsored placements are always labelled. Prices and delivery costs are estimates; the retailer’s checkout price is final.",

  // ── home ──
  "home.offerCountsLive": "Offer counts are live from our catalogue",
  "home.personalizedTitle": "See personalised recommendations",

  // ── search ──
  "search.metaDescription": "Search and compare prices across UK stores.",
  "search.metaDescriptionQuery": "Compare prices for {query} across UK stores, including delivery.",

  // ── filters / sort ──
  "filters.freeShipping": "Free delivery",
  "sort.lowestShipping": "Lowest delivery cost",

  // ── catalog ──
  "catalog.categoryMetaDescription": "Compare {name} prices across UK stores, with price history and Deal Scores.",
  "catalog.categoryIntro": "{count, plural, one {# product} other {# products}} compared across UK stores — lowest price, store count and price history for each.",
  "catalog.bestMetaDescription": "The best-value {name} right now, ranked by Deal Score from real price history across UK stores.",
  "catalog.brandMetaDescription": "Compare prices on {name} products across UK stores.",
  "catalog.newMetaDescription": "Products that most recently started appearing at the UK stores we track.",
  "catalog.popularMetaDescription": "The most widely stocked products by category, compared across UK stores.",

  // ── product ──
  "product.exclTax": "excl. VAT",
  "product.inclTaxForZip": "incl. VAT · postcode {zip}",
  "product.metaDescription": "Compare {title} prices across {count, plural, one {# store} other {# stores}}, with price history and delivery costs.",
  "product.metaDescriptionNoStores": "Compare {title} prices, with price history and delivery costs.",

  // ── offers ──
  "offers.shipping": "Delivery",
  "offers.estTax": "VAT",
  "offers.delivery": "Delivery time",
  "offers.pickup": "Collection",
  "offers.disclosureSetZip": "We may earn a commission when you buy through “Visit store” links. This never affects the order of offers or the Deal Score. Totals are estimates — set your postcode to include delivery; the store’s checkout price is final.",

  // ── alerts ──
  "alerts.enterTarget": "Enter a target price in pounds.",
  "alerts.enterWholeTarget": "Enter a target price in whole pounds.",

  // ── compare ──
  "compare.rowLowestTotal": "Lowest est. total",

  // ── coupons / stores ──
  "coupons.metaDescription": "Coupon codes and deals from UK stores, with real success reports from shoppers. Expired codes are removed.",
  "stores.metaDescription": "Products sold at {name}, compared with other UK stores — price history and delivery costs.",
  "stores.freeShippingOver": "Free delivery over {price}",

  // ── basket ──
  "basket.metaDescription": "Compare buying your basket at one store, across the cheapest stores, or at the fewest stores — with free-delivery thresholds.",
  "basket.intro": "Your basket is stored on this device. Optimisation uses current tracked offers, delivery thresholds and your memberships.",
  "basket.estTotalInclTax": "est. total incl. VAT",
  "basket.estTotalExclTax": "est. total, excl. VAT",
  "basket.shippingAmount": "Delivery {amount}",
  "basket.shippingFree": "Free delivery",
  "basket.thresholdMet": "(free-delivery threshold met)",
  "basket.addForFreeShipping": "add {amount} for free delivery",
  "basket.taxEstimate": "VAT estimate:",
  "basket.taxZip": "Postcode {zip}",
  "basket.runOptimizer": "Run the optimiser to compare buying everything at one store, splitting across the cheapest stores, or using the fewest stores.",

  // ── account ──
  "account.zipLabel": "Postcode (for delivery estimates)",
  "account.airportPlaceholder": "e.g. LHR",
  "account.errZip": "Enter a valid postcode",
  "account.errAirport": "Use a 3-letter airport code (e.g. LHR)",

  // ── auth ──
  "auth.benefitCompare": "Compare prices across stores, including delivery costs",

  // ── assistant ──
  "assistant.metaDescription": "Ask questions about products, prices and the best time to buy — answers grounded in tracked catalogue data.",
  "assistant.emptyBody": "Answers are grounded in our catalogue — prices always come from tracked offers, never generated.",

  // ── travel ──
  "travel.heroSub": "Compare flights and hotels from multiple providers — demo data is always labelled.",
  "travel.settingUp": "We’re setting up {providers}. Until then, flight fares and hotel listings are clearly labelled demo data and can’t be booked.",
  "travel.cheapestRoundTrips": "Cheapest return trips abroad for a week away",
  "travel.airportUnavailable": "Airport search is unavailable. Type a 3-letter code (e.g. LHR).",

  // ── flights ──
  "flights.metaDescription": "Search one-way, return and multi-city flights worldwide, compare fares, use flexible dates and explore the cheapest destinations.",
  "flights.travelerCount": "{count, plural, one {# traveller} other {# travellers}}",
  "flights.travelersSummary": "{count, plural, one {# traveller} other {# travellers}}, {cabin}",
  "flights.travelersAndCabin": "Travellers and cabin class",
  "flights.roundTrip": "Return",
  "flights.resultsDisclosure": "Price is per adult incl. taxes (estimated); totals include all travellers. Bag fees are estimates — check the airline before booking. We may earn a commission from “View deal” links; it never affects the order of results or the Best ranking.",
  "flights.legacyDisclosure": "Fares are totals for all travellers as returned by the provider and can change until booked. We may earn a commission from “View deal” links; it never affects the order of results.",
  "flights.nonstop": "Direct",
  "flights.carryOnIncluded": "Cabin bag included",
  "flights.personalItemCarryOnFee": "Personal item only · cabin bag est. {price}",
  "flights.carryOn": "Cabin bag",
  "flights.noCarryOn": "No cabin bag",
  "flights.carryOnBag": "Cabin bag",
  "flights.calendarCaption": "Return prices: rows are departure dates, columns are return dates",
  "flights.cheapestPerAdultRound": "Cheapest fare per adult for the return trip",
  "flights.roundTripPerAdult": "return · per adult",

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
  "meta.siteDescription": "Compare prices across UK stores with delivery costs, real price history, honest Deal Scores, coupons and price alerts.",
  "meta.homeTitle": "WhichLess — Compare prices across UK stores, track price drops, find coupons",
  "meta.manifestDescription": "Compare prices across UK stores with delivery costs, price history, coupons and price alerts.",

  // ── a11y ──
  "a11y.setZip": "Set postcode for delivery estimates",
} as const satisfies Partial<Record<MessageKey, string>>;
