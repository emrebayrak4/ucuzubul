# Master plan (condensed product brief)

Product: US-market price comparison + smart shopping + travel (flights & hotels) platform. Web, iOS, Android, API, admin, merchant portal, browser-extension-ready.
Combine: Akakçe/Cimri price grids · Google Shopping · ShopSavvy (barcode) · Keepa (price history) · Slickdeals (community) · Honey (coupons) · Kayak/Google Flights-style travel search. Original design, never copied.

## Design direction
Premium, minimal, warm, trustworthy, fast, product-first, scannable. Refs for quality: Apple, Airbnb, Stripe, Linear.
Avoid: gratuitous gradients, purple AI look, over-rounded everything, glassmorphism, giant empty heroes, cards-in-cards, emoji icons, fake reviews/badges, needless animation, placeholder images in prod.
Palette start: primary #104C3B, accent #D5F36A, bg #F7F8F5, surface #FFF, text #141816, text-2 #6B736F, border #E5E8E5, success #16834B, error #D63B3B. Light + dark mode.
Type: Geist (or Inter); tabular numerals for prices. Dense but orderly price layouts on web; native patterns on mobile (bottom tabs, bottom sheets, haptics).
Reference screenshots (IA only): akakce/cimri long homepages — category rails, "lowest price · N stores" tiles, campaign bands, footer link columns.

## Header
Logo · big search ("Search products, brands, or paste a product URL") · categories menu · Deals · Price Drops · Flights · Hotels · Price Alerts · Compare · Account (Log in / Sign up) · ZIP selector.

## Home sections
Trending · Today's best deals · Biggest price drops · Popular categories · Under $25/$50/$100 · Recently viewed · Recommendations · Popular retailers · Seasonal collections · Editor's picks · Flight & hotel quick search module.
Categories (DB-driven): Electronics, Computers, Smartphones, Gaming, Home & Kitchen, Appliances, Fashion, Beauty & Personal Care, Sports & Outdoors, Automotive, Baby & Kids, Toys, Grocery, Pet Supplies, Office Supplies, Tools & Home Improvement.

## Search
Instant, autocomplete, typo tolerance, synonyms, brand/category recognition, model no., UPC, natural language ("best laptop under $800" → parse price cap), URL paste, recent/trending.
Filters: price min/max, brand, store, condition, stock, shipping, pickup, rating, specs, discount %, delivery time. Sorts: best match, lowest total, highest price, best deal, popular, rating, newest, biggest drop. State in URL.

## Product page
Images, name, brand, model, UPC/GTIN, variants, specs, description, lowest price, store count, stock, last updated, price history chart (7/30/90/180/365/all, only real points), alert, favorite, compare, share.
Offer table: store, price, shipping, est. tax (or "estimated / unknown — set ZIP"), est. total, condition, stock, delivery, last checked, coupon, affiliate disclosure, Visit store (real /go redirect).

## Engines
Matching: GTIN/UPC/EAN/ISBN exact → brand+MPN → candidates → weighted attributes → semantic → confidence (≥0.98 auto, 0.85–0.98 review, <0.85 no merge) → conflicts → manual queue. Never merge different storage/color/size/pack/condition.
Price tracking: per-offer history; stats 7/30/90/180/365/all, ATL, avg, median, volatility, drop %. Events on change. Adaptive refresh frequency.
Deal Score 0–100: 30% vs 90d median, 25% near ATL, 20% vs other stores, 10% retailer trust, 10% freshness, 5% stock; confidence; tiers 90+ Exceptional, 75 Great, 60 Good, 40 Average, <40 Poor; explain reasons; sponsored never affects.
Fake discount: compare current vs 30/90d median, ATL, list price, other stores, pre-sale price hikes → neutral message ("advertised 40% off, only 8% below 90-day median").
Alerts: below price, drop 5/10/20%, back in stock, new cheaper store, ATL, coupon; push/email/in-app; dedupe + cooldown.
Smart basket: single-store vs multi-store vs min-stores, shipping thresholds, memberships, pickup; exact for small baskets, heuristic for large; show assumptions.
AI assistant: grounded on catalog data, provider adapter, cache/limits; never invent prices.

## Travel (added by founder)
Flights: airport autocomplete, one-way/round-trip, dates, passengers, cabin; results with price, airline, stops, duration, times; sort cheapest/fastest/best; provider list with status; affiliate redirect. Price calendar/alerts later.
Hotels: city/dates/guests/rooms search, list + filters (price, stars, amenities), hotel detail with rates per provider, affiliate redirect.
Candidate sources (need contracts/keys → pending_configuration): Duffel, Amadeus, Travelpayouts (Aviasales/Hotellook), Kiwi Tequila, Skyscanner partners, Expedia Rapid, Booking.com Demand API, Hotelbeds.

## Accounts
Browse without account. Email+password, Google, Apple. Saved, lists, alerts, recently viewed, favorite stores, preferred categories, ZIP, notifications, privacy, delete account, data export. Pages: /login, /signup, /forgot-password, /reset-password, /account.

## Business
Affiliate (click tracking, sub-ID, conversion import, commissions, reconciliation), sponsored placements (labeled), premium subscription (Stripe infra, admin-editable pricing), cashback states (pending/confirmed/reversed/payable/paid; never credited without verified conversion; payouts disabled until legal).
Merchant portal: register, verify, CSV/XML feed upload, offers, stock, prices, analytics, campaigns, billing, API keys, webhooks.
Admin: KPIs dashboard + users, products, categories, brands, retailers, offers, matching, duplicates, data quality, anomalies, affiliate programs, transactions, subscriptions, campaigns, notifications, moderation, SEO pages, feature flags, settings, audit logs. RBAC.

## Community (feature-flagged)
Deal posts, votes, comments, validation, expired reports, reputation, spam/duplicate detection, moderation.

## SEO/GEO
SSR/ISR, canonical, metadata, sitemap index + chunks, robots, breadcrumbs, OG, Product/AggregateOffer/BreadcrumbList JSON-LD, internal linking, facet index control, no thin pages, no fake rating data. Machine-readable price tables with sources + timestamps.

## Phases
01 Foundation → 02 Core platform → 03 Web & Mobile → 04 Smart shopping → 05 Business systems → 06 Hardening. End-to-end core flow first, then breadth.
