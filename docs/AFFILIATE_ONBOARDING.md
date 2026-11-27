# Affiliate & data-provider onboarding — Afterwish Inc.

A step-by-step checklist for turning on real data. Every network, program and provider is listed with:
- where to sign up
- what you need to submit
- how approval works and how long it usually takes
- which credentials go into which **Admin → Integrations** field
- how to test it

The list is ordered from **fastest to live** to slowest.

> **Who does what.** The founder creates every account, accepts every agreement and enters the tax, bank and
> identity details personally. No account was created or signed up for during development, and no terms
> were accepted. The code only reads credentials that an admin enters in Admin → Integrations.
> Those credentials are stored encrypted, and DB values override `.env`.
> Timelines below are typical ranges taken from the networks' public help pages and common experience. They are not guarantees.

Code references:
- network clients: `packages/retailer-adapters/src/networks/*`
- retailer and travel adapters: `src/retailers/*`, `src/travel/*`
- link builders: `src/links.ts`
- ingestion: `apps/api/src/core/integrations-ingest.ts`
- worker schedules: `apps/worker/src/main.ts`
- API research notes with source URLs: [DATA_SOURCES.md](DATA_SOURCES.md)

---

## 0. Prepare once (used by every application)

| Item | Notes |
|---|---|
| Legal entity | Afterwish Inc.: exact legal name, state of incorporation, registered address |
| EIN | Needed for the W-9 tax form on every US network |
| W-9 | Completed inside each network's dashboard (tax interview). **Founder only.** |
| Payout method | ACH bank account (routing + account) or PayPal; some networks also offer Payoneer or wire. **Entered by the founder in each network dashboard, never in our admin.** |
| Business email on own domain | Best Buy refuses free-mail addresses; networks review the email domain |
| Live website URL(s) | Production domain with real content, an About page, a **Privacy Policy**, **Terms** and an **affiliate disclosure** (FTC) visible near links. Add the iOS/Android app store URLs once published. |
| Traffic / promotion description | Accurate wording to reuse: "Price-comparison and deal site for US shoppers. We show live prices from several retailers, verified coupon codes, price history and price-drop alerts. Traffic comes from organic search, email alerts (opt-in), a mobile app and a browser extension." |
| Promotional methods to declare | Comparison shopping, coupon/deal site, email (opt-in), mobile app, **browser extension**. Declare the extension and the coupon use honestly. Many advertisers restrict "software / toolbar / browser extension" or "coupon" partners. Approval is per advertiser, and hiding these methods leads to reversed commissions and bans. |
| Monthly traffic | Real numbers only (analytics screenshot if asked). New sites can say "pre-launch / new". |
| Sub-ID policy | Our click id (`AffiliateClick.subId`, a random 16-character token, no PII) is sent as `sid` / `subId1` / `u1` / `clickref` / `pubref` / `customid` / `ascsubtag`. |

After any credential is saved: **Admin → Integrations → (entry) → Test connection.** The result is honest:
- `live`: the provider answered a real authenticated call.
- `pending_configuration`: a required field is missing.
- `error`: the provider responded but rejected the call. The provider's HTTP status is shown.

---

## 1. Duffel (flights) — test mode: minutes

- **Sign up:** https://app.duffel.com/join
- **Needed:** name, work email, company name. No approval is needed for test mode.
- **Approval:** test mode works immediately. Live mode needs account verification (company details, KYB) and a funded balance. Duffel charges a fee per order.
- **Credentials:** app.duffel.com → Developers → Access tokens → create a **test** token (`duffel_test_…`) → Admin → Integrations → **Duffel** → `DUFFEL_ACCESS_TOKEN`.
- **Test:**
  1. Run Test connection.
  2. Search a flight on /travel/flights, for example JFK→LAX in 30 days. Offers come from Duffel's test airline ("Duffel Airways").
  3. Results carry the provider's source. Test-mode fares are not real inventory, so keep the site in staging until the live token is in.
- **Go live:** complete verification in the Duffel dashboard, then replace the token with `duffel_live_…`.

## 2. Kroger (grocery prices) — minutes to 1 day

- **Sign up:** https://developer.kroger.com/ → Register → Create App
  - Environment: Production
  - Scope: `product.compact`
  - Redirect URI: not needed for client credentials
- **Needed:** name, email, app name and description (use "price comparison").
- **Approval:** apps are usually active immediately. Limit: 10,000 product calls/day.
- **Credentials:** Admin → Integrations → **Kroger**:
  - `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`
  - `KROGER_LOCATION_ID`: the 8-character store id that prices are taken from. Find it with the Locations API or the store page.
- **Affiliate:** Kroger's public developer program has no affiliate commission. Links are plain links.
- **Test:** run Test connection. The next `price-refresh` run (every 30 minutes) updates Kroger offers, and demo Kroger offers are hidden automatically once real offers exist.

## 3. eBay — Browse API + eBay Partner Network (EPN): 1–3 days

**3a. eBay developer keys (Browse API)**
- **Sign up:** https://developer.ebay.com/signin → create an account → Application Keys → **Production** keyset.
- **Needed:** eBay account, contact details. To keep the production keyset active, you must answer the marketplace account-deletion notification requirement (opt-out is available for apps that store no eBay user data).
- **Credentials:** Admin → Integrations → **eBay**:
  - `EBAY_CLIENT_ID` (App ID)
  - `EBAY_CLIENT_SECRET` (Cert ID)
  - `EBAY_EPN_CAMPAIGN_ID` (from 3b)
- **Limits:** Browse API 5,000 calls/day by default. Request more through Application Growth Check.

**3b. eBay Partner Network**
- **Sign up:** https://partnernetwork.ebay.com/ → Join
- **Needed:** website URL, traffic description, promotional methods (declare the extension), W-9 and payout details (founder, inside EPN).
- **Approval:** the application is reviewed, usually within a few business days.
- **After approval:**
  - Campaigns → create a campaign "WhichLess web" → copy the 10-digit **campaign id** into `EBAY_EPN_CAMPAIGN_ID`.
  - Optional: EPN Tools → API → copy **Account SID** and **Auth Token** into Admin → Integrations → **eBay Partner Network (reporting)** (`EBAY_EPN_ACCOUNT_SID`, `EBAY_EPN_AUTH_TOKEN`). This enables conversion import.
  - The reporting endpoint is not publicly documented (UNVERIFIED). Test connection will show whether it accepts the credentials.
- **Test:**
  1. Run Test connection on **eBay**.
  2. Open an eBay offer on the site → "Go to store". The redirect URL contains `campid=<yours>&customid=<click id>`.
  3. Check the click in the EPN dashboard after about 24 hours.

## 4. Hotelbeds APItude (hotels) — evaluation: same day

- **Sign up:** https://developer.hotelbeds.com/ → Register → request a **Hotel APItude evaluation** key.
- **Needed:** company details and use case.
- **Approval:** the evaluation key is issued quickly. It runs on the test environment with 50 requests/day.
  Production needs a certification review and a commercial contract, which usually takes weeks.
- **Credentials:** Admin → Integrations → **Hotelbeds APItude**:
  - `HOTELBEDS_API_KEY`, `HOTELBEDS_SECRET`
  - `HOTELBEDS_ENVIRONMENT=test` until certified
- **Test:**
  - Test connection calls `/hotel-api/1.0/status` with the `X-Signature` SHA-256 header.
  - Hotel search for a supported destination code returns NET (wholesale) rates. These are labeled by price basis, and any markup is our pricing decision.
  - Keep usage low: the evaluation key allows only 50 requests/day.

## 5. Travelpayouts (Aviasales flights) — same day

- **Sign up:** https://app.travelpayouts.com/signup
- **Needed:** website URL, traffic sources, payout details (founder).
- **Approval:** the account is instant. Some brand programs need a separate "Join" approval.
- **Credentials:** Profile → API token, and the numeric **marker**. Enter them in Admin → Integrations → **Travelpayouts** (`TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER`).
- **Notes:**
  - The Data API returns cached fares (up to 48 hours old). These are labeled as cached.
  - The sub-ID is appended to the marker as `marker=<id>.<clickId>`.
  - Travelpayouts Hotels (Hotellook) closed in 2025 and stays discontinued.
- **Test:** run Test connection, then run a flight search. Travelpayouts results show "cached" freshness.

## 6. Awin — 2–7 business days, then per-advertiser approvals

- **Sign up:** https://ui.awin.com/publisher-signup/en/awin/step1 (US publishers)
- **Needed:**
  - company details and website
  - promotional type (comparison shopping, coupon/voucher, browser extension)
  - traffic sources
  - W-9 and bank details (founder)
  - Awin has historically asked new publishers for a small refundable deposit. Check the current form.
- **Approval:** account review takes a few days. Then apply to each advertiser under Advertisers → Join programmes. Each advertiser approves on its own schedule.
- **Credentials:** Admin → Integrations → **Awin**:
  - `AWIN_API_TOKEN`: ui.awin.com → user menu → API credentials. A Personal Access Token works with both API sets.
  - `AWIN_PUBLISHER_ID`: the number in the dashboard URL.
  - `AWIN_FEED_API_KEY` (optional, for product feeds): Toolbox → Create-a-Feed → the value after `apikey/` in a feed URL. **This is not the API token.**
    When creating feeds, include identifier columns (EAN/UPC, MPN, brand), price, RRP, the merchant deep link and the Awin deep link.
- **What runs:**
  - Coupons: Promotions API (voucher codes are visible only for joined advertisers), every 6 hours.
  - Transactions: every 4 hours, 31-day windows, `clickref` = our click id.
  - Feeds: daily.
- **Test:**
  1. Run Test connection (`GET /accounts`).
  2. Go to Admin → Affiliate programs → run **Awin coupons**. Advertisers appear in the program list.
  3. Link each one to a retailer slug. The next run imports coupons and products for linked programs.

## 7. CJ Affiliate — account in days; advertiser approvals days to weeks

- **Sign up:** https://signup.cj.com/member/signup/publisher/
- **Needed:**
  - company and website
  - "property" details: add the website as a Property and describe the promotional model honestly, including the browser extension as a separate property if required
  - W-9 and payment (founder)
- **Approval:** account approval is usually quick. Each advertiser (Costco, Wayfair, Office Depot, Walgreens…) approves separately: Advertisers → Search → Apply.
- **Credentials:** Admin → Integrations → **CJ Affiliate**:
  - `CJ_PERSONAL_ACCESS_TOKEN`: https://developers.cj.com/account/personal-access-tokens → Create
  - `CJ_COMPANY_ID`: your publisher CID (Account → Company ID)
  - `CJ_WEBSITE_ID`: the Property ID (PID) of the site
- **What runs:**
  - Coupons: Link Search, `promotion-type=coupon`, joined advertisers only; 25 calls/minute; every 6 hours.
  - Products: Product Search GraphQL for each linked program, every 12 hours.
  - Commissions: Commission Detail every 3 hours. Corrections arrive as negative records and are stored as reversals.
- **Sub-ID:** our click id is added as `sid`.
  The documented API option is `linkCode(pid, shopperId)`. Appending `&sid=` at redirect time follows CJ's publisher guides, which require login to read, so it is UNVERIFIED publicly.
  **Do one real test click and confirm the SID shows in CJ reporting before scaling.**
- **Test:** run Test connection (a one-row Product Search). Then go to Admin → Affiliate programs → run **CJ coupons** and link the advertisers.

## 8. Impact.com — account in a day; brand approvals vary (Walmart, Target, Home Depot, Best Buy, Chewy…)

- **Sign up:** https://app.impact.com/signup/create-account-partner.ihtml
- **Needed:** company, website(s), promotional methods, tax (W-9) and payout (founder).
- **Approval:** the partner account is quick. Each brand reviews its own applications under Brands → Marketplace → Apply.
- **Credentials:** Admin → Integrations → **Impact.com**:
  - `IMPACT_ACCOUNT_SID`: Settings → API, starts with `IR`
  - `IMPACT_AUTH_TOKEN`: read-only access is enough
- **What runs:**
  - Catalogs: item `Url` is already your tracking link; every 12 hours.
  - Deals: listed per campaign. A program tracking link is created through the TrackingLinks API because deals carry no link.
  - Actions: last-updated windows of up to 45 days, every 3 hours; `subId1` = our click id.
  - Rate limits: 1,000/hour general, 500/hour for `/Actions`.
- **Walmart Affiliate API** (product data via walmart.io; needs Walmart approval on Impact first):
  1. Generate an RSA key pair.
  2. Upload the **public** key at https://walmart.io → Consumer ID.
  3. Admin → Integrations → **Walmart**: `WALMART_CONSUMER_ID`, `WALMART_PRIVATE_KEY` (PEM), `WALMART_KEY_VERSION`, optional `WALMART_PUBLISHER_ID` (your Impact ID).
- **Best Buy:** see §12. The legal review comes first.
- **Test:**
  1. Run Test connection (`GET /Campaigns`).
  2. Run **Impact coupons** in Admin → Affiliate programs.
  3. Link the campaigns (for example Walmart → `walmart`).

## 9. Rakuten Advertising — days; per-advertiser approvals (Newegg, Sam's Club, …)

- **Sign up:** https://rakutenadvertising.com/en-us/publishers/ → Join
- **Needed:** company, website, promotional methods, W-9 and payment (founder).
- **Approval:** the account review usually takes a few business days. Then apply to advertisers.
- **Credentials:** https://developers.rakutenadvertising.com/ → create an Application → Admin → Integrations → **Rakuten Advertising**:
  - `RAKUTEN_CLIENT_ID`, `RAKUTEN_CLIENT_SECRET`
  - `RAKUTEN_SID`: your Site ID
  - `RAKUTEN_ENCRYPTED_ID` (optional): the `id=` value in any LinkShare link; it enables deep links
- **Notes:**
  - All APIs allow 100 calls/minute. Exceeding the limit returns **403**.
  - The Events API keeps about 2 weeks of data and does not reflect commission changes. Returns arrive as negative rows. For full reconciliation, also download the Rakuten payment reports monthly.
- **Test:**
  - Test connection requests a token.
  - Admin → Affiliate programs → run **Rakuten coupons** and link the advertisers.

## 10. Partnerize — per-brand invitation or application (weeks)

- **Sign up:** https://partnerize.com/ → "Become a partner", or accept a brand invitation.
- **Needed:** company, website, promotional methods, tax and payment (founder).
- **Credentials:** console.partnerize.com → Settings → Account settings → Admin → Integrations → **Partnerize**:
  - `PARTNERIZE_USER_APPLICATION_KEY` (this is the Basic-auth username)
  - `PARTNERIZE_USER_API_KEY` (this is the password)
  - `PARTNERIZE_PUBLISHER_ID`
- **What runs:**
  - Conversion report every 4 hours (cursor paging); `pubref` = our click id.
  - Links: `prf.hn/click/camref:<campaign camref>/pubref:<click id>/destination:<url>`. The camref is per campaign.
- **Not wired yet:** Partnerize vouchers and feeds. Those endpoints exist and are a follow-up.

## 11. Amazon Associates → Creators API — provisional now; API after 10 sales in 30 days

- **Sign up:** https://affiliate-program.amazon.com/
- **Needed:**
  - website and app list
  - how you drive traffic
  - tax interview (W-9) and payment (founder)
  - the store id (tracking id), for example `yourstore-20`
- **Approval:**
  - Associates accounts start provisional. Amazon reviews the account after qualifying sales (currently 3 within 180 days) and closes accounts that do not reach that.
  - **Creators API access additionally requires 10 qualifying shipped sales in the last 30 days.**
  - Access lapses after 30 days without sales.
  - PA-API 5 is retired.
- **Until then:** Amazon offers can only be linked manually with the tag (`amazonLink()` adds `tag` and `ascsubtag`). No Amazon prices are shown without the API, and none are invented.
- **Credentials (once eligible):** Associates Central → Tools → Creators API → create a credential → Admin → Integrations → **Amazon**:
  - `AMAZON_CREATORS_CREDENTIAL_ID`, `AMAZON_CREATORS_CREDENTIAL_SECRET`
  - `AMAZON_CREATORS_CREDENTIAL_VERSION`, for example `3.1`
  - `AMAZON_ASSOCIATE_TAG`
- **Conversions:** Amazon has no reporting API for Associates. Earnings come from the Associates Central reports. `ascsubtag` values appear in the downloadable reports for manual reconciliation.
- **Program terms:** the Associates Operating Agreement limits caching Amazon prices (show prices as of a time, refresh often) and restricts some uses, including browser-extension and email use. Read it before enabling Amazon in the extension or alerts.

## 12. Best Buy Products API — key in minutes; **blocked on legal review**

- **Sign up:** https://developer.bestbuy.com/ → Get API Key. A company email is required.
- **Legal gate:**
  - The API terms restrict using Best Buy data to analyze Best Buy pricing for third parties.
  - The adapter stays `pending_configuration` until `BESTBUY_LEGAL_APPROVED` = `true`.
  - **Only set this after counsel has signed off in writing.**
- **Credentials:** Admin → Integrations → **Best Buy**:
  - `BESTBUY_API_KEY`
  - `BESTBUY_LEGAL_APPROVED`
  - optional `BESTBUY_AFFILIATE_LINK_TEMPLATE`: an Impact deep link for Best Buy containing `{url}` and `{subId}`, after Impact approval
- **Terms:** 5 calls/second and 50,000/day. Cache for at most 72 hours. Attribution is required.

## 13. Expedia Group Rapid (hotels) — partner contract: weeks to months

- **Apply:** https://developers.expediagroup.com/rapid → Become a partner.
- **Needed:** business plan, traffic, booking-flow description, a commercial agreement, and a launch review before production.
- **Credentials:** Admin → Integrations → **Expedia Rapid**:
  - `EXPEDIA_RAPID_API_KEY`, `EXPEDIA_RAPID_SECRET`
  - `EXPEDIA_RAPID_ENVIRONMENT=test` (the test key works on test.ean.com only)
- **Signing:** the Lodging API uses `Authorization: EAN APIKey=…,Signature=sha512(key+secret+ts),timestamp=…`. This is implemented and tested.

## 14. Booking.com Demand API (hotels) — Managed Affiliate Partner: weeks to months

- **Apply:** https://www.booking.com/affiliate-program/v2/index.html. Demand API access is for **managed** affiliate partners.
- **Credentials:** Partner Centre → Admin → Integrations → **Booking.com Demand API**:
  - `BOOKING_API_KEY` (Bearer token)
  - `BOOKING_AFFILIATE_ID` (sent as `X-Affiliate-Id`)
  - `BOOKING_ENVIRONMENT=sandbox`
- **Base URLs:** `demandapi-sandbox.booking.com/3.1` and `demandapi.booking.com/3.1`.
- **Sub-ID:** Booking links get our click id in `label`.

## 15. Feed-only retailers (Target, Home Depot, Lowe's, Newegg, Costco, Macy's, …)

These retailers have no public product API, and scraping is prohibited. After the network (§6–§9) approves you for the retailer, there are two options:

- **Preferred:** link the retailer's program in Admin → Affiliate programs. Its network catalog then flows in automatically.
- **Alternative:** paste the retailer's feed URL into Admin → Integrations → (retailer) → `<RETAILER>_FEED_URL`, with an optional auth header and link template.

---

## After any network is live: the end-to-end check

1. **Admin → Integrations → (network) → Test connection** shows `live`.
2. **Admin → Affiliate programs → Run coupons** (or products). Advertisers appear with status "pending configuration" until linked.
3. **Link** each program to our retailer slug (for example `walmart`, `home-depot`).
   The network's click host (for example `www.anrdoezrs.net`) is added to that retailer's redirect allow-list automatically. Only recognised network hosts are added.
4. The next run (or Run now) imports:
   - coupons (new ones start "unverified")
   - offers matched to catalog products by GTIN, or by brand/MPN/title through the matching engine (≥ 0.98 auto-merge, 0.85–0.98 → manual review queue)
   - price history
   Live offers for a retailer **automatically hide that retailer's demo offers.**
5. **Click test:**
   1. Open an imported offer → "Go to store".
   2. The redirect URL contains our click id in the network's sub-ID parameter.
   3. A row exists in `affiliate_clicks`.
6. **Conversion test:**
   1. After a real purchase through a test click (founder, real order), wait for the network to report it. This takes minutes on Impact and hours to a day on others.
   2. The conversion import creates `affiliate_conversions` + `commissions` rows attached to the click.
   3. Reversals flip the commission to `reversed` and reverse any pending cashback linked to it. Cashback crediting rules are unchanged: no cashback is ever created from an unverified conversion.
7. Check **data_ingestion_jobs** (`kind = network-<kind>:<network>`) and **integration_errors** for failures.
