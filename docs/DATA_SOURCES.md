# Data sources — retailers & travel providers

Owner: A05/06 · Researched 2026-11-26 · Code: `packages/retailer-adapters` (registry: `src/registry.ts`)

**Status of every source today: `pending_configuration`.** No credentials are configured, so every adapter
throws `PendingConfigurationError` from its fetch methods and never returns data. The one exception is
Travelpayouts Hotels (Hotellook), which reports `error` because the provider shut it down.
Mapping code is tested only against recorded-shape fixtures in `packages/retailer-adapters/__fixtures__`.
Those fixtures are test-only and contain synthetic values.

Legend:
- **Verified** — confirmed on an official page at the cited URL.
- **Secondary** — from third-party sources (directories, blogs, client libraries).
- **UNVERIFIED** — could not be confirmed. Check it in the network or partner dashboard before relying on it.

Several official pages blocked automated fetching (bot walls or 403s): walmart.io, the eBay developer HTML pages,
developer.kroger.com, samsclub.com, partners.target.com and amazon.com help. Facts that depend on those pages are marked as secondary or UNVERIFIED.

## Affiliate-network publisher APIs (2026-11-27)
Clients for CJ, Impact, Rakuten, Awin, Partnerize and eBay Partner Network live in `packages/retailer-adapters/src/networks/`.
Each client's header comment lists the verified endpoints, auth, paging and rate limits, with source URLs. Unverified points are marked UNVERIFIED, mainly:
- CJ `&sid=` appended to click URLs
- the EPN reporting endpoint
- the Rakuten manual `/deeplink` host
- the default Awin `aw_*` feed columns

Signup and credential steps: [AFFILIATE_ONBOARDING.md](AFFILIATE_ONBOARDING.md).

## Multi-retailer search and product content (2026-11-27)
Code: `packages/retailer-adapters/src/sources/` (registry `PRODUCT_SOURCE_REGISTRY`). Neither source is a single retailer or an
affiliate network, so they have their own registry. Ingestion, enrichment and Admin → Integrations wiring are A04 work (see TASKS.md Requests).

### Channel3 — product search across many US stores (`channel3`)
- **API: Verified** against the live API on 2026-11-27 with a free developer account.
  - `POST https://api.trychannel3.com/v1/search` `{query, limit?, page_token?, filters?}` with header `x-api-key` ([search](https://docs.trychannel3.com/guides/search)).
  - `GET /v1/products/{id}` is free; use it to refresh offers before display ([product detail](https://docs.trychannel3.com/guides/product-detail)).
  - `GET /v1/websites/search?query=` is free; the client uses it as the health check.
- **Response:** canonical products, each with `offers[]` from many stores. An offer has `domain`, `url` (Channel3-attributed buy link),
  `price`, `availability`, `condition` and `max_commission_rate` ([offer](https://docs.trychannel3.com/guides/offer)).
  - The price object observed live is `{price, compare_at_price, currency}`; doc examples show `{amount, currency}`. The client accepts both.
  - **No GTINs.** Matching has to rely on brand and title.
- **Filters used:** `price` (major units), `website_ids` (store domains or ids), `availability`.
- **Pricing:** 1,000 searches/month free, then $0.007/search; detail and website search are free ([pricing](https://docs.trychannel3.com/pricing)).
- **Commission:** buy links pay through Channel3. The dashboard warns that brands may deny commissions until the publisher profile is complete.
- **Mapping:** `channel3RetailerId(domain)` maps known store domains to our retailer ids (macys.com → `macys`, bestbuy.com → `bestbuy`, …).
  `toListings()` returns one `NormalizedListing` per offer, `source: "affiliate"`, `retailerSku = c3:<productId>` (suffixed with the
  condition for non-new offers), `productUrl: null` and `affiliateUrl` = the Channel3 link. Untracked stores keep their domain as `retailerId`.
- **Env:** `CHANNEL3_API_KEY`.

### Open Icecat — specs and licensed product images (`icecat`)
- **API: Verified** live on 2026-11-27 with a free Open Icecat account.
  - `GET https://live.icecat.biz/api?lang=&shopname=&GTIN=` (or `Brand=&ProductCode=`, or `icecat_id=`) ([JSON manual](https://iceclog.com/manual-for-icecat-json-product-requests/)).
  - Auth is the Icecat user name (`shopname`); there is no secret.
- **Content only:** title, brand, MPN, GTINs, category, summary, description, gallery images (up to 4500 px) and specs. No prices.
- **Not available → null:**
  - 400 `StatusCode 16` "The GTIN can not be found"
  - 400 "Products datasheet is not yet released"
  - 403 "To access Full Icecat content, an app_key is required" (the product exists only in paid Full Icecat)
- **Bad credentials:** 404 `StatusCode 3` "<user> the Icecat user is unknown".
- **Coverage:** Open Icecat covers sponsoring brands only. In the live test a Samsung phone returned 6 images and 134 specs; an HP product was "not yet released".
- **Terms:** the Open Icecat Fair Use Policy applies.
- **Env:** `ICECAT_SHOPNAME`.

## ToS baseline (all retailers)
Do not scrape. Every retailer ToS we could read prohibits robots, scraping or data mining without consent:
- Amazon Conditions of Use ([summary](https://conductatlas.com/platform/amazon/amazon-conditions-of-use/provision/CA-P-018441/prohibition-on-data-mining-and-scraping-tools/))
- Walmart ([summary](https://conductatlas.com/platform/walmart/walmart-terms-of-use/prohibition-on-automated-data-scraping/))
- Target ([summary](https://conductatlas.com/platform/target/target-terms-and-conditions/provision/CA-P-076764/prohibition-on-data-scraping-and-mining/))

This matches CLAUDE.md ("No scraping that bypasses CAPTCHA/auth/ToS"). The only data paths are:
1. official APIs
2. affiliate-network product feeds or APIs
3. merchant uploads through the generic feed parser

## Go-live matrix

| Adapter id | Kind | Data access | Network | What's needed to go live | Go-live class |
|---|---|---|---|---|---|
| bestbuy | retailer | official API | Impact | Free API key (company email) **+ legal review of the terms** | api_key |
| ebay | retailer | official API | eBay Partner Network | Developer keyset + EPN campaign id (both self-serve) | api_key |
| kroger | retailer | official API | UNVERIFIED | Developer app (client id/secret) + a store `locationId` | api_key |
| merchant_feed | retailer | feed upload | — | Nothing (parser works without credentials) | api_key |
| amazon | retailer | official API (Creators API) | Associates (in-house) | Approved Associates account with **10 qualifying sales in the last 30 days**, then Creators API credentials | affiliate_approval |
| walmart | retailer | official API (Affiliate API) | Impact | Approved Walmart affiliate + RSA key pair registered on walmart.io | affiliate_approval |
| target, costco, homedepot, lowes, newegg, bhphoto, adorama, macys, kohls, wayfair, staples, officedepot, walgreens, cvs, gamestop, samsclub, chewy | retailer | affiliate feed | see below | Advertiser approval in the network, then a product-feed URL (`<PREFIX>_FEED_URL`) | affiliate_approval |
| duffel | flight | official API | — | Self-serve signup gives a test token at once; live mode needs account activation and a balance | api_key |
| travelpayouts | flight | affiliate data API | Travelpayouts | Self-serve affiliate signup (token + marker) | api_key |
| hotelbeds | hotel | official API | — | Self-serve evaluation key (test, 50 req/day); production needs certification + contract | api_key |
| expedia_rapid | hotel | partner only | — | Partner application + launch review | partner_contract |
| booking | hotel | partner only | Booking.com Affiliate Partner Programme | Managed Affiliate Partner contract | partner_contract |
| amadeus | flight | partner only | — | Enterprise contract (Self-Service shut down 2026-07-17) | partner_contract |
| travelpayouts_hotels | hotel | — | Travelpayouts | **Discontinued** (Hotellook closed 2025-10-20) | discontinued |

These could be live with just a key: Best Buy (after legal sign-off), eBay, Kroger, Duffel (test mode now, live after activation),
Travelpayouts flights, Hotelbeds (evaluation), and merchant uploads.

---

## Retailers with an official API

### Amazon — Creators API
- **API: Verified.** The Creators API replaces PA-API 5.
  - Old PA-API 5 doc URLs now redirect to a deprecation page. That page says PA-API 5 is deprecated and calls return HTTP 403 `AccessDeniedException`. [deprecation page](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)
  - Reported dates: deprecation 2026-04-30, endpoint retirement 2026-05-15. **Secondary** ([dev.to](https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek)).
  - Offers V1 was retired separately; use OffersV2 ([thread](https://wordpress.org/support/topic/pa-api-deprecation-by-jan-31-2026/)).
  - Docs: [introduction](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)
- **Affiliate program:** Amazon Associates (in-house).
- **Product feed:** none. Use the API.
- **Access requirements:** final-accepted Associates account with **≥10 qualifying sales in the past 30 days**. The old "3 sales in 180 days" rule does not appear in the Creators API docs.
  - Only the primary account owner can register.
  - Access is lost after 30 consecutive days without qualified sales, and returns about 2 days after a new shipped sale.
  - Source: [api-rates](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/api-rates)
- **Rate limits:**
  - New credentials: 1 TPS / 8,640 TPD for the first 30 days.
  - After that, limits are recalculated daily from 30-day shipped revenue: 1 TPD per $0.05 and 1 TPS per $4,320, up to a maximum of 10 TPS.
  - Throttling returns 429. **Verified** (same page).
- **Auth:** OAuth2 client credentials. The token endpoint depends on the credential version:
  - v3.x uses Login with Amazon, a JSON body and scope `creatorsapi::default`.
  - v2.x uses Cognito, a form body and scope `creatorsapi/default`.
  - Then: `POST https://creatorsapi.amazon/catalog/v1/{getItems|searchItems}` with header `x-marketplace: www.amazon.com`.
  - The getItems path is **Verified** ([curl guide](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl)).
  - The exact searchItems path is **UNVERIFIED**; it is inferred from the [migration guide](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/migrating-to-creatorsapi-from-paapi).
- **Env:** `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_CREDENTIAL_SECRET`, `AMAZON_CREATORS_CREDENTIAL_VERSION` (e.g. `3.1`), `AMAZON_ASSOCIATE_TAG`. Optional: `AMAZON_MARKETPLACE`.
- **Status:** pending_configuration. Needs Associates approval, then the sales threshold, then credentials.

### Walmart — Affiliate API (walmart.io)
- **API:** Affiliate Product API v2.
  - Base `https://developer.api.walmart.com/api-proxy/service/affil/product/v2/`
  - Endpoints: `search`, `items?ids=` / `items?upc=`, `paginated/items`, `taxonomy`.
  - Docs: [quickstart](https://walmart.io/apidocs/affiliates/quickstart). The site blocks bots, so paths come from the [WIOpy client](https://raw.githubusercontent.com/CoderJoshDK/WIOpy/master/wiopy/WalmartIO.py) (**Secondary**).
- **Auth:** RSA-SHA256 signature over `consumerId\ntimestamp\nkeyVersion\n`.
  - Headers: `WM_CONSUMER.ID`, `WM_CONSUMER.INTIMESTAMP`, `WM_SEC.KEY_VERSION`, `WM_SEC.AUTH_SIGNATURE`.
  - Implemented and tested with a generated key pair.
  - Whether the Affiliate API has moved to OAuth (as the Marketplace APIs did) is **UNVERIFIED**.
- **Affiliate program:** Impact. Walmart's affiliate terms name Impact Radius ([terms](https://affiliates.walmart.com/terms), [impact.com](https://www.impact.com/advertisers/walmart/)). **Verified**.
- **Product feed:** "data feeds" are advertised, and there is a paginated catalog endpoint ([catalog-product](https://walmart.io/docs/affiliates/v1/catalog-product)).
- **Access requirements:** approved affiliate; RSA public key uploaded on walmart.io gives a consumer ID. How the Impact `publisherId` links to the API is **UNVERIFIED**.
- **Display rule:** link through `productTrackingUrl`.
- **Rate limit:** 5,000 calls/day by default (from the WIOpy docstring) — **UNVERIFIED officially**.
- **Env:** `WALMART_CONSUMER_ID`, `WALMART_PRIVATE_KEY` (PEM; `\n` escapes accepted), `WALMART_KEY_VERSION`. Optional: `WALMART_PUBLISHER_ID`.

### Best Buy — Products API
- **API:** `GET https://api.bestbuy.com/v1/products(<filters>)?apiKey=&format=json&show=&pageSize=&page=` ([docs](https://bestbuyapis.github.io/api-documentation/)). **Verified**.
- **Access requirements:** free key from developer.bestbuy.com. Keys are not issued to free-email addresses ([notice](https://medium.com/best-buy-developers/announcing-a-change-to-best-buy-s-api-access-b09afc4bc27a)).
- **Terms** ([developer.bestbuy.com/legal](https://developer.bestbuy.com/legal)), **Verified**:
  - Rate limits: 5 calls/s and 50,000/day. Exceeding them returns 403.
  - Caching is limited to 72 hours.
  - Attribution and the Best Buy logo are required. Best Buy must be in the primary tier of commerce options.
  - **The data may not be used to analyze Best Buy pricing for third parties. This needs legal review before use in a price-comparison product.**
- **Affiliate program:** Impact. The docs mention an "Impact Partner ID"; Impact is confirmed by [Marketing Brew](https://marketingbrew.com/stories/2025/04/29/broader-economic-factors-are-putting-pressure-on-best-buy-s-affiliate-program).
- **Product feed:** the API itself; an Impact feed is **UNVERIFIED**.
- **Site scraping ToS:** not reviewed (**UNVERIFIED**). It does not matter because we use the API only.
- **Env:** `BESTBUY_API_KEY`. Optional: `BESTBUY_AFFILIATE_LINK_TEMPLATE` (an Impact deep link containing `{url}` / `{subId}`).

### eBay — Browse API + eBay Partner Network
- **API:** Buy Browse v1 `item_summary/search` and `item/{id}` ([browse_api.md](https://developer.ebay.com/develop/api/buy/browse_api.md)). **Verified**.
  - Token: `POST /identity/v1/oauth2/token`, client credentials, scope `https://api.ebay.com/oauth/api_scope`.
  - Headers: `X-EBAY-C-MARKETPLACE-ID: EBAY_US` and `X-EBAY-C-ENDUSERCTX: affiliateCampaignId=…`.
  - Commission requires sending buyers through `itemAffiliateWebUrl`.
  - Known issue: `itemAffiliateWebUrl` is sometimes empty ([forum](https://community.ebay.com/t5/RESTful-Buy-APIs-Browse/itemAffiliateWebUrl-not-returned-in-browse-search-request-when/m-p/34701332/highlight/true)). The adapter then builds an EPN link itself; the EPN link parameter set is **UNVERIFIED** and should be checked in the EPN link generator.
- **Rate limits:** Browse API default is 5,000 calls/day ([limits](https://developer.ebay.com/develop/api/buy/api_call_limits)). Higher limits require an Application Growth Check ([kb](https://developer.ebay.com/support/knowledge-base/1362)).
- **Limited Release:** `getItems` (bulk) and the Feed API ([browse_api.md](https://developer.ebay.com/develop/api/buy/browse_api.md)).
- **User agreement / scraping:** not fetched (**UNVERIFIED**).
- **Env:** `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_EPN_CAMPAIGN_ID`. Optional: `EBAY_EPN_REFERENCE_ID`, `EBAY_ENVIRONMENT=sandbox`.

### Kroger — Public Products API
- **API:** `https://api.kroger.com/v1/products` (`filter.term`, `filter.locationId`, `filter.limit`, `filter.start`).
  - Token: `POST /v1/connect/oauth2/token` with Basic auth, `grant_type=client_credentials`, scope `product.compact`.
  - Portal: developer.kroger.com, which blocks bots. Shapes come from a [mirrored copy of the docs](https://www.val.town/embed/x/bgschiller/personalShopper/docs/kroger-products.md) and [a wrapper](https://glama.ai/mcp/servers/@EricLott/kroger-mcp/blob/32e3cb8ce7ad8c81b1ef4ddbbcbb5e0e784d421d/auth.py) — **Secondary**.
  - The exact token URL, whether `filter.start` is 0- or 1-based, and the maximum `filter.limit` (50) are **UNVERIFIED**.
- **Prices are store-specific:** price and inventory are only returned with a `locationId`, so `KROGER_LOCATION_ID` is required.
- **UPC quirk:** `upc` is commonly 13 digits without a check digit. The adapter repairs it (quirk **UNVERIFIED**).
- **Rate limit:** 10,000 calls/day (mirrored docs, **Secondary**).
- **Affiliate program:** **UNVERIFIED**; directories say Impact or FlexOffers ([uppromote](https://uppromote.com/affiliate-directory/kroger/)).
- **Commercial-use approval and scraping ToS:** **UNVERIFIED**.
- **Env:** `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, `KROGER_LOCATION_ID`.

---

## Retailers without a public product API (affiliate feeds)

All of these use the generic `AffiliateFeedAdapter`, which parses CSV/TSV/XML with Google Merchant-style columns.

Env per retailer:
- `<PREFIX>_FEED_URL` (required)
- `<PREFIX>_FEED_AUTH_HEADER` (optional, `Header: value`)
- `<PREFIX>_AFFILIATE_LINK_TEMPLATE` (optional; deep link with `{url}` and `{subId}`)

Most network feeds already carry tracked links (`buy_url`/`click_url`); the adapter uses those first.

Alternatives to file feeds are the network catalog APIs: Impact Catalog API, CJ Product Search, Rakuten Product Search. None is implemented yet.

**Confidence:** network assignments marked "medium" or "low" come from directories that often disagree. **Confirm each one inside the network dashboard.**

| Retailer (id / env prefix) | Network (confidence) | Feed | Notes / sources |
|---|---|---|---|
| Target (`target` / `TARGET`) | Impact, as Target Partners (medium) | "Data feed: yes" on Impact — **UNVERIFIED** | Commission-based creator program ended 2026-05-07, replaced by Club Target / Target Ambassadors on LTK ([Target](https://corporate.target.com/news-features/article/2026/05/club-target), [ManyChat](https://manychat.com/blog/target-creator-program/)). ToS bans scraping. |
| Costco (`costco` / `COSTCO`) | CJ (medium) | **UNVERIFIED** | Mostly memberships are commissionable ([ManyChat](https://manychat.com/blog/costco-affiliate-program/)). |
| The Home Depot (`homedepot` / `HOME_DEPOT`) | Impact (high, official page) | Daily feed — **UNVERIFIED** | [Official program page](https://www.homedepot.com/c/SF_MS_The_Home_Depot_Affiliate_Program), [uppromote](https://uppromote.com/affiliate-directory/home-depot/) |
| Lowe's (`lowes` / `LOWES`) | Impact vs CJ (low) | **UNVERIFIED** | [uppromote](https://uppromote.com/affiliate-directory/lowes/), [Niche Pursuits](https://www.nichepursuits.com/lowes-affiliate-program/) |
| Newegg (`newegg` / `NEWEGG`) | Rakuten (high, official page) | Rakuten feeds — **UNVERIFIED** | [newegg.com/affiliates](https://www.newegg.com/affiliates) |
| B&H Photo (`bhphoto` / `BH_PHOTO`) | Impact (medium) | **UNVERIFIED** | [uppromote](https://uppromote.com/affiliate-directory/bh-photo/) |
| Adorama (`adorama` / `ADORAMA`) | Impact (medium) | **UNVERIFIED** | [uppromote](https://uppromote.com/affiliate-directory/adorama/) |
| Macy's (`macys` / `MACYS`) | Rakuten vs CJ; also FlexOffers (low) | **UNVERIFIED** | [Affililist](https://www.affililist.com/blog/macy-s-affiliate-program), [FlexOffers](https://www.flexoffers.com/affiliate-programs/macys-com-affiliate-program) |
| Kohl's (`kohls` / `KOHLS`) | Impact (medium) | **UNVERIFIED** | [uppromote](https://uppromote.com/affiliate-directory/kohls/) |
| Wayfair (`wayfair` / `WAYFAIR`) | CJ for US (medium); Awin for UK | **UNVERIFIED** | [Strackr](https://strackr.com/blog/wayfair-affiliate-program), [Awin UK](https://ui.awin.com/merchant-profile-terms/72067) |
| Staples (`staples` / `STAPLES`) | Rakuten or CJ (low) | **UNVERIFIED** | [uppromote](https://uppromote.com/affiliate-directory/staples/) |
| Office Depot (`officedepot` / `OFFICE_DEPOT`) | CJ (medium) | **UNVERIFIED** | [Office Depot](https://www.officedepot.com/l/help/affiliate-program), [uppromote](https://uppromote.com/affiliate-directory/office-depot/) |
| Walgreens (`walgreens` / `WALGREENS`) | CJ; also FlexOffers (medium) | **UNVERIFIED** | [uppromote](https://uppromote.com/affiliate-program-directory/walgreens) |
| CVS (`cvs` / `CVS`) | CJ; also FlexOffers (low-medium) | **UNVERIFIED** | [LinkClicky](https://linkclicky.com/affiliate-program/cvs/), [FlexOffers](https://www.flexoffers.com/affiliate-programs/cvs-affiliate-program-2/) |
| GameStop (`gamestop` / `GAMESTOP`) | Rakuten (low, directory only) | **UNVERIFIED** | [uppromote](https://uppromote.com/affiliate-directory/gamestop/) |
| Sam's Club (`samsclub` / `SAMS_CLUB`) | Rakuten (from a search snippet of the bot-walled official page) | **UNVERIFIED** | [samsclub.com/content/affiliates](https://samsclub.com/content/affiliates). developer.samsclub.com is a seller/supplier API, not a catalog API ([auth docs](https://developer.samsclub.com/API/authentication/)). |
| Chewy (`chewy` / `CHEWY`) | Impact (official page); older sources say CJ/Partnerize | **UNVERIFIED** | [chewy.com affiliate](https://www.chewy.com/app/content/affiliate) |

Rate limits for network feeds: downloads are typically daily or a few times per day. The adapter caches each feed for 6 hours, at 0.5 req/s.
Network-specific API limits are **UNVERIFIED**.

### Merchant uploads (`merchant_feed`)
`AffiliateFeedAdapter.parseFeed(content)` accepts CSV/TSV (delimiter auto-detect, RFC 4180 quoting, BOM) or XML.
Supported XML formats: Google Merchant RSS `<item><g:…>`, Atom `<entry>`, or generic `<product>`.

It handles these columns ([Google Merchant spec](https://support.google.com/merchants/answer/7052112)):
- `id, title, description, link, image_link`
- `price, sale_price, sale_price_effective_date`
- `availability, condition, brand, gtin, mpn`
- `shipping` (`US::Standard:4.99 USD` or nested `<g:shipping><g:price>`)
- `product_type`

It also accepts common aliases (`sku`, `name`, `url`, `buy_url`, `upc`, `ean`, `manufacturer`, `model`, `stock`…).

It returns per-row validation errors. Invalid GTIN check digits, missing id/title and non-integer prices are rejected.
An expired `sale_price` is ignored, so there is never a fake "was" price.

---

## Travel — flights

### Duffel
- **API:** `POST https://api.duffel.com/air/offer_requests?return_offers=true` with headers `Authorization: Bearer`, `Duffel-Version: v2` ([docs](https://duffel.com/docs/api/v2/offer-requests/create-offer-request), [making requests](https://duffel.com/docs/api/overview/making-requests)). **Verified**.
- **Access requirements:** self-serve. Test mode starts immediately (`duffel_test_` tokens).
  - Live mode needs account activation: review, a card, and a top-up balance ([test mode](https://duffel.com/docs/api/overview/test-mode), [help](https://help.duffel.com/hc/en-gb/articles/360019685579), [agreement](https://duffel.com/services-agreement)).
- **Business model:** real bookings ([pricing](https://duffel.com/pricing)).
  - $3 per order and $2 per paid ancillary.
  - Managed Content adds 1%.
  - Searches above a 1,500:1 search-to-book ratio cost $0.005 each.
  - FX conversion costs 2%.
- **Display rule:** show the operating carrier name prominently. The adapter maps `operatingCarrierName`.
- **Rate limits:** **UNVERIFIED** (the docs page returned 404).
- **Env:** `DUFFEL_ACCESS_TOKEN`. Test-mode results carry a warning and `bookable: false`.

### Amadeus for Developers (Self-Service) — shut down
- **Status:** Self-Service registrations were paused in Feb 2026. On **2026-07-17** all Self-Service keys were disabled and the portal closed.
  - Sources: [PhocusWire](https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers), [Skift](https://skift.com/2026/09/03/amadeus-brings-travel-tech-into-claude/), [AirLabs](https://airlabs.co/amadeus-self-service-api-shutdown); the amadeus4dev GitHub organization was [archived](https://github.com/amadeus4dev).
  - Amadeus's own [statement](https://amadeus.com/en/industry-messaging/statement-regarding-amadeus-for-developers-portal) confirms Enterprise is unaffected but gives no dates.
- **Adapter:** keeps the former `/v2/shopping/flight-offers` mapping.
  - It requires `AMADEUS_BASE_URL` from an Enterprise contract.
  - It refuses the old `test.api.amadeus.com` / `api.amadeus.com` hosts with `ProviderDiscontinuedError`.
  - Enterprise endpoint parity is **UNVERIFIED**.
- **Env:** `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, `AMADEUS_BASE_URL`.

### Travelpayouts (Aviasales Data API)
- **API:** `GET https://api.travelpayouts.com/aviasales/v3/prices_for_dates` with header `X-Access-Token` ([docs](https://support.travelpayouts.com/hc/en-us/articles/203956163), [slate](https://travelpayouts.github.io/slate/)).
- **Data is cached, not live:** it returns the cheapest fares found by Aviasales users in the **last 48 hours**. The adapter sets `cached: true` and `bookable: false`, and the redirect carries `marker`.
- **Access requirements:** free affiliate signup.
  - The real-time Search API needs ≥50k MAU ([support](https://support.travelpayouts.com/hc/en-us/articles/30565016140434)).
  - Search API rules: booking links are generated only on click and expire after 15 minutes; default limit is 200 queries/hour/IP.
  - Data API rate limits are **UNVERIFIED**.
- **Commission rate:** **UNVERIFIED**.
- **Response fields:** `duration_to` and `duration` are **UNVERIFIED**.
- **Env:** `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER`.

### Kiwi.com Tequila / Skyscanner (not implemented)
- **Kiwi Tequila:** public signup reportedly ended in May 2024; access is invitation or partner only. **Secondary** ([ignav](https://ignav.com/docs/kiwi-tequila-alternative), [Kiwi](https://media.kiwi.com/articles-and-interviews/better-for-business-kiwi-com-takes-a-new-approach-to-partnerships/)).
- **Skyscanner Travel API:** requires an established business with more than 100k monthly traffic ([Skyscanner partner support](https://skyscannerpartnersupport.zendesk.com/hc/en-us/articles/10881149122717)).

Neither is available to a new site, so neither is in the registry.

## Travel — hotels

### Expedia Rapid
- **API:** `GET {test.ean.com|api.ean.com}/v3/properties/availability` ([shopping](https://developers.expediagroup.com/rapid/lodging/shopping/about-shopping-api)).
  - Auth: `Authorization: EAN APIKey=…,Signature=sha512(key+secret+ts),timestamp=…` ([signature auth](https://developers.expediagroup.com/rapid/resources/signature-authentication)).
- **Searches by `property_id` only:** mapping a city to properties needs the Rapid content/geography APIs, so city search throws `NotSupportedError`.
- **Access requirements:** partner application. The test key only works on test.ean.com. Production requires a launch review ([getting started](https://developers.expediagroup.com/docs/products/rapid/setup/getting-started), [launch requirements](https://developers.expediagroup.com/rapid/setup/launch-requirements/b2c-standalone)).
- **Rate limits:** daily and per-minute, sized by traffic versus revenue ([rate limiting](https://developers.expediagroup.com/rapid/lodging/shopping/rate-limiting)).
- **UNVERIFIED:** commission/margin terms, required `Customer-Ip`/session headers, and the inner shape of `totals.inclusive`.
- **Env:** `EXPEDIA_RAPID_API_KEY`, `EXPEDIA_RAPID_SECRET`. Optional: `EXPEDIA_RAPID_ENVIRONMENT=production`.

### Booking.com Demand API
- **API:** `POST https://demandapi.booking.com/3.1/accommodations/search` (sandbox: `demandapi-sandbox.booking.com`).
  - Headers: `Authorization: Bearer`, `X-Affiliate-Id` ([auth](https://developers.booking.com/demand/docs/development-guide/authentication), [search](https://developers.booking.com/demand/docs/open-api/3.1/demand-api/accommodations/accommodations/search)).
  - v3.1 is in maintenance mode; 3.2 is available ([quick guide](https://developers.booking.com/demand/docs/accommodations/v3.2/accommodation-quick-guide.md)).
- **Access requirements:** Managed Affiliate Partner contract. The account manager grants Partner Centre access ([prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites)).
- **City search:** needs Booking.com numeric city ids.
- **UNVERIFIED:** traffic thresholds, commission share, rate limits.
- **Env:** `BOOKING_API_KEY`, `BOOKING_AFFILIATE_ID`. Optional: `BOOKING_ENVIRONMENT=production`.

### Hotelbeds APItude
- **API:** `POST {api.test.hotelbeds.com|api.hotelbeds.com}/hotel-api/1.0/hotels` with headers `Api-key` and `X-Signature = sha256(key+secret+unixSeconds)` ([getting started](https://developer.hotelbeds.com/documentation/getting-started/), [workflow](https://developer.hotelbeds.com/documentation/hotels/booking-api/workflow)).
  - The production host comes from a third-party catalog ([API Evangelist](https://apis.apievangelist.com/store/hotelbeds-booking-api/)).
- **Access requirements:** self-serve evaluation key, 50 requests/day. Certification, then a contract, unlock production.
- **Prices are NET (wholesale):** `sellingRate` with `hotelMandatory=true` is the minimum resale price. The adapter reports `priceBasis: "net" | "selling"`. RECHECK rates need `/checkrates` before booking.
- **UNVERIFIED:** contract and commission terms.
- **Env:** `HOTELBEDS_API_KEY`, `HOTELBEDS_SECRET`. Optional: `HOTELBEDS_ENVIRONMENT=production`.

### Travelpayouts Hotels (Hotellook) — discontinued
Hotellook closed on **2025-10-20**; its API returns errors and there is no replacement hotel data API
([FAQ](https://support.travelpayouts.com/hc/en-us/articles/29534131568530-FAQ-on-the-closure-of-Hotellook)).
The adapter `travelpayouts_hotels` always reports `status: "error"` and throws `ProviderDiscontinuedError`.

---

## All adapter env keys
These go in `.env.example` with empty values. A04 owns that file; this list was sent to A04 as a request in docs/TASKS.md. `allAdapterEnvKeys()` returns the same list.

```
ADORAMA_AFFILIATE_LINK_TEMPLATE ADORAMA_FEED_AUTH_HEADER ADORAMA_FEED_URL
AMADEUS_BASE_URL AMADEUS_CLIENT_ID AMADEUS_CLIENT_SECRET
AMAZON_ASSOCIATE_TAG AMAZON_CREATORS_CREDENTIAL_ID AMAZON_CREATORS_CREDENTIAL_SECRET AMAZON_CREATORS_CREDENTIAL_VERSION AMAZON_MARKETPLACE
BESTBUY_AFFILIATE_LINK_TEMPLATE BESTBUY_API_KEY
BH_PHOTO_AFFILIATE_LINK_TEMPLATE BH_PHOTO_FEED_AUTH_HEADER BH_PHOTO_FEED_URL
BOOKING_AFFILIATE_ID BOOKING_API_KEY BOOKING_ENVIRONMENT
CHEWY_* COSTCO_* CVS_* GAMESTOP_* HOME_DEPOT_* KOHLS_* LOWES_* MACYS_* NEWEGG_* OFFICE_DEPOT_* SAMS_CLUB_* STAPLES_* TARGET_* WALGREENS_* WAYFAIR_*
  (each: _FEED_URL, _FEED_AUTH_HEADER, _AFFILIATE_LINK_TEMPLATE)
DUFFEL_ACCESS_TOKEN
EBAY_CLIENT_ID EBAY_CLIENT_SECRET EBAY_ENVIRONMENT EBAY_EPN_CAMPAIGN_ID EBAY_EPN_REFERENCE_ID
EXPEDIA_RAPID_API_KEY EXPEDIA_RAPID_ENVIRONMENT EXPEDIA_RAPID_SECRET
HOTELBEDS_API_KEY HOTELBEDS_ENVIRONMENT HOTELBEDS_SECRET
KROGER_CLIENT_ID KROGER_CLIENT_SECRET KROGER_LOCATION_ID
TRAVELPAYOUTS_MARKER TRAVELPAYOUTS_TOKEN
WALMART_CONSUMER_ID WALMART_KEY_VERSION WALMART_PRIVATE_KEY WALMART_PUBLISHER_ID
```

## Recommended order to go live
1. **eBay** and **Kroger** (keys only).
2. **Best Buy**, once legal has reviewed the "no analyzing Best Buy pricing for third parties" clause.
3. **Duffel** in test mode for the flights UI. Label results "test data" until live activation.
4. **Travelpayouts** for "from $X" cached fares.
5. **Hotelbeds** evaluation for hotels.
6. Apply to **Impact** (Walmart, Home Depot, Target, Kohl's, B&H, Adorama, Chewy, Best Buy links), **CJ** (Costco, Wayfair, Office Depot, Walgreens, CVS) and **Rakuten** (Newegg, Sam's Club, GameStop?). Confirm each network in its dashboard.
7. Amazon Creators API once the Associates account reaches 10 sales in 30 days.
8. Booking.com / Expedia Rapid once traffic justifies a partner contract.

## Store and brand logos (added by A04)
- Logos are **trademarks of their respective owners**, shown nominatively only to identify the store or brand next to its offers/products. No endorsement is implied.
- Source order: (1) the site's **own published icon** fetched from its official domain only (`apple-touch-icon` → largest `<link rel=icon>` → `/favicon.ico`; robots.txt respected, 8 s timeouts, icons on third-party hosts skipped) — `logoSource = official_site`; (2) admin upload — `admin_upload`; (3) optional logo provider (logo.dev, only when `LOGO_DEV_TOKEN` is configured in admin → Integrations) — `logo_provider`.
- When an affiliate program is approved, **replace these with the brand assets provided by the program** (they come with usage terms) via the admin logo upload.
- Run `pnpm -C apps/api logos:fetch` (add `--force` to refresh). Re-seeding the database clears logos (retailer/brand rows are recreated) — run the script again afterwards.

## Geo dataset: countries, cities, airports (added by A04)
| Dataset | Source | License | Use |
|---|---|---|---|
| Airports (`airports.csv`), countries (`countries.csv`), regions (`regions.csv`) | OurAirports — https://ourairports.com/data/ (mirror: davidmegginson.github.io/ourairports-data) | **Public domain** | IATA-coded airports with scheduled service plus large/medium IATA airports (type, ICAO, coordinates, region) |
| Cities ≥ 5,000 population (`cities5000.zip`), `countryInfo.txt`, `admin1CodesASCII.txt` | GeoNames — https://www.geonames.org/ | **CC BY 4.0** — attribution required: "Geographic data © GeoNames (geonames.org), CC BY 4.0" in the site footer/about page | Cities (names, ASCII names, limited Latin alternate names, admin1, coordinates, population, timezone), country ISO3/currency/capital/population |
| Metro (multi-airport) city codes | Curated list in `packages/database/prisma/geo/metros.ts` (IATA metropolitan area codes) | — | NYC, LON, PAR, TYO, IST… → their airports |
- Import: `pnpm -C packages/database geo:import [--refresh]` downloads into `<repo>/.data/geo-cache` (gitignored, refreshed weekly) and upserts idempotently; raw files are never committed.
- Airports are linked to the nearest GeoNames city matching the OurAirports municipality (fallback: nearest city within 25 km).
- Search: Meilisearch index `places` (rebuilt by the API when its size differs from the DB) with a Postgres pg_trgm + unaccent fallback.
- **A02/A03:** add the GeoNames attribution line to the footer / about page.

## US ZIP codes (ZCTA) — privacy/ZIP session, 2026-11-27
| Dataset | Source | License | Used for |
|---|---|---|---|
| ZCTA Gazetteer 2025 (`2025_Gaz_zcta_national.zip`) | US Census Bureau — https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html | Public domain (US Government work, 17 U.S.C. §105) | `zip_codes.zip`, `lat`/`lng` (internal point), `landAreaKm2` |
| ZCTA ↔ county 2020 relationship (`tab20_zcta520_county20_natl.txt`) | US Census Bureau — https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.html | Public domain | `state` (via county FIPS) and `county` — largest land overlap |
| ZCTA ↔ place 2020 relationship (`tab20_zcta520_place20_natl.txt`) | US Census Bureau (same page) | Public domain | `city` = Census place with the largest land overlap (an approximation of the USPS city name, not the official postal city) |
| Places Gazetteer 2025 (`2025_Gaz_place_national.zip`) | US Census Bureau | Public domain | FIPS→USPS state map; nearest-place fallback for ZCTAs with no place overlap |
| 2020 Decennial DHC `P1_001N` by ZCTA | api.census.gov | Public domain | `population` — **only if `CENSUS_API_KEY` is set** (the API redirects unkeyed bulk requests); otherwise null |

- Import: `pnpm -C packages/database zip:import [--refresh]` → downloads into `<repo>/.data/zip-cache` (gitignored, refreshed after 30 days), idempotent upsert of ~33.8k ZCTAs, deletes ZCTAs no longer in the source, refuses to import < 30,000 rows. Gazetteer year override: `CENSUS_GAZETTEER_YEAR`.
- ZCTAs ≠ USPS ZIPs: PO-box-only and single-building ZIPs have no ZCTA; 17 territory ZCTAs (USVI) have no state code.
- No paid geo API is used. Precise coordinates are never stored (see docs/PRIVACY.md).
