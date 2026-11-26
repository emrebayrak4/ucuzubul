# Database schema

PostgreSQL 17 · Prisma 7.10.1 (`prisma-client` generator, `@prisma/adapter-pg` driver adapter).
Schema: `packages/database/prisma/schema.prisma` · config: `packages/database/prisma.config.ts` · migrations: `packages/database/prisma/migrations`.

## Conventions
- Table names are snake_case plural (`@@map`); columns are camelCase (quote them in raw SQL: `"priceCents"`).
- IDs: `cuid()` strings. Exceptions: `Airport.iata`, `Airline.iata`, `FeatureFlag.key`, `UserPreference.userId`, and `PriceHistory` (composite).
- Money: `Int` cents + `currency CHAR(3)` (default `USD`). Percentages/confidence stored as basis points (`dropPercentBp`, `commissionRateBp`, `confidenceBp`).
- Timestamps: `timestamptz(3)`; hotel stay dates and travel alert dates are `date`.
- Every price-bearing row (`Offer`, `PriceHistory`, `FlightOffer`, `HotelRate`, `Hotel`, `ProductImage`) has `source` (`api | feed | merchant_upload | affiliate | demo`).
- Deletes: user-owned rows cascade from `User`; catalog children cascade from `Product`; soft links (`SetNull`) for analytics/audit rows so history survives deletions.

## Entities

### Users & auth
| Model | Notes |
|---|---|
| `User` | `email` unique (store lowercased), `passwordHash` (argon2id, null for OAuth-only), `role` enum `USER/MERCHANT/EDITOR/ANALYST/ADMIN`, `status` (`active/suspended/deleted`), `deletedAt` for account deletion. |
| `UserSession` | Opaque token in cookie `pc_session`; only SHA-256 `tokenHash` stored (unique). `expiresAt`, `revokedAt`, `lastSeenAt`. |
| `OAuthAccount` | `(provider, providerAccountId)` unique. Google/Apple. |
| `PasswordResetToken` | Hashed single-use token with expiry. |
| `UserPreference` | 1:1. ZIP, favorite retailers, preferred categories, memberships (basket optimizer), notification toggles, theme, home airport. |
| `Address` | Optional saved addresses (tax/shipping estimates). |

### Catalog
| Model | Notes |
|---|---|
| `Category` | Self-referencing tree (`parentId`) + materialized `path` (`electronics/tv-home-theater`, unique) + `depth`. 16 roots. |
| `Brand` | `slug`, `name` unique. |
| `Product` | Canonical product. `condition` enum `new/refurbished/used/open_box` — different conditions are **different products** (never merged). `isDemo` marks seed rows. GIN trigram index on `title` for the search fallback. |
| `ProductVariant` | 1:1 with Product. Products sharing `familyKey` are variants (storage/color/size) shown as a picker; each keeps its own offers/history. |
| `ProductIdentifier` | `UPC/EAN/GTIN/ISBN/MPN/ASIN/SKU`. Indexed on `(type, value)` and `value` for scan lookups. Not globally unique (refurbished units share a UPC with new). `retailerId` set for retailer-scoped ids. |
| `ProductAttribute` | Grouped spec rows (`group`, `name`, `value`, `unit`), index on `(name, value)` for facets. |
| `ProductImage` | Ordered images with `source`. (Demo seed adds none — no licensed imagery.) |

### Retailers, offers, prices
| Model | Notes |
|---|---|
| `Retailer` | Real US retailers. `integrationStatus` (`live/pending_configuration/error/disabled`), `brandColor` for text tiles, `freeShippingThresholdCents`, `membershipKey`, `allowedRedirectHosts` (outbound allow-list). `trustScore` is nullable and stays null until computed from real signals. |
| `RetailerIntegration` | Adapter per retailer (`kind`, `provider`), status + last sync/error. Non-secret config only. |
| `RetailerFeed` | Feed upload/fetch runs (CSV/XML/JSON) with row counts and errors. |
| `Offer` | Retailer listing for a product. `(retailerId, retailerSku)` unique. Price, list price, shipping (`null` = unknown, `0` = free), stock, coupon, `source`, `lastCheckedAt`, `lastChangedAt`. Hot index `(productId, isActive, priceCents)`. |
| `PriceHistory` | Append-only observations. PK `(offerId, observedAt)`; denormalized `productId`, `retailerId` for chart/stat queries. See partitioning below. |
| `PriceAnomaly` | Spikes, outlier drops, stale offers, fake discounts, feed errors — admin queue. |

### Matching
`ProductMatch` (candidate → product, `confidenceBp`, `method` gtin/brand_mpn/attributes/semantic/manual, `status`, `conflicts[]`) and `MatchReview` (reviewer decision log). Thresholds from MASTER_PLAN: ≥9800 auto, 8500–9800 review, <8500 no merge.

### User features
`PriceAlert` (types `below_price/drop_percent/back_in_stock/new_cheaper_store/all_time_low/coupon`, channels, `cooldownUntil`), `Notification` (`dedupeKey` unique to prevent double sends), `Favorite` (`userId, productId` unique), `ShoppingList` + `ShoppingListItem` (`listId, productId` unique), `ProductComparison`, `RecentlyViewed` (`userId, productId` unique; upsert `viewedAt`).

### Monetization
`AffiliateProgram` (network enum, `(network, externalId)` unique), `AffiliateClick` (unique `subId` for attribution, hashed IP only, `kind` product/flight/hotel), `AffiliateConversion` (`(network, externalId)` unique — idempotent imports), `Commission` (1:1 conversion), `CashbackTransaction` (`pending/confirmed/reversed/payable/paid`; only created from a verified conversion; payouts flag-disabled), `SubscriptionPlan` / `Subscription` (Stripe ids), `SponsoredCampaign` (always labeled; never read by ranking or Deal Score code).

### Community (feature flag `community.deals`)
`Deal`, `DealVote` (`dealId, userId` unique, ±1), `DealComment` (threaded, moderation status).

### Ops
`SearchEvent` (query analytics, zero-result tracking), `FeatureFlag`, `AuditLog` (all admin writes: actor, action, entity, diff, ip), `DataIngestionJob`, `IntegrationError`.

### Merchants
`MerchantAccount` (1:1 user, optional 1:1 retailer, verification status), `ApiKey` (prefix + SHA-256 `keyHash`; secret shown once; scopes; revocable).

### Travel
`Airport` (IATA PK, ICAO, city, country, lat/lon, tz, `searchRank` for autocomplete), `Airline` (IATA PK), `FlightSearch` (short-lived cache keyed by normalized params), `FlightOffer` (fare snapshot; `slices` JSON matches contracts `FlightSlice[]`), `Hotel`, `HotelRate` (rate snapshot per stay window), `TravelAlert`.

## Migrations
1. `…_init` — full schema.
2. `…_search_trgm` — `CREATE EXTENSION pg_trgm` + `products_title_trgm_idx` (GIN) used by the Postgres search fallback when Meilisearch is down.

Commands (from repo root): `pnpm db:migrate` (dev), `pnpm -C packages/database migrate:deploy` (CI/prod), `pnpm db:seed`, `pnpm db:generate`.

## PriceHistory partitioning plan
Volume estimate: 1M offers × 1–4 observations/day ≈ 1–4M rows/day. Plan (apply before production ingestion starts):

```sql
-- 1. New partitioned parent (same columns, PK must include the partition key — ours already does)
CREATE TABLE price_history_p (LIKE price_history INCLUDING DEFAULTS) PARTITION BY RANGE ("observedAt");
ALTER TABLE price_history_p ADD PRIMARY KEY ("offerId", "observedAt");
CREATE INDEX ON price_history_p ("productId", "observedAt");
CREATE INDEX ON price_history_p ("retailerId", "observedAt");
-- 2. Monthly partitions (created ahead of time by a worker cron, e.g. 3 months forward)
CREATE TABLE price_history_2026_12 PARTITION OF price_history_p
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE price_history_default PARTITION OF price_history_p DEFAULT;
-- 3. Copy, swap names in one transaction, re-add FKs (offerId/productId/retailerId)
INSERT INTO price_history_p SELECT * FROM price_history;
ALTER TABLE price_history RENAME TO price_history_old;
ALTER TABLE price_history_p RENAME TO price_history;
```
- Prisma keeps working: it only sees the parent table name. Keep the migration as a hand-written SQL migration (`prisma migrate dev --create-only`), and do not let Prisma regenerate this table.
- FKs referencing a partitioned table are supported in PG ≥ 12; FKs *from* it (to offers/products) are fine.
- Alternative if partition maintenance is unwanted: TimescaleDB hypertable on `observedAt` (chunk = 7 days) with compression after 30 days.

## Retention
| Data | Retention |
|---|---|
| `price_history` raw | 13 months at full resolution; older months downsampled to one row per offer per day (daily min/close) into `price_history_daily` (to be added) and the raw partition dropped. Charts' "all" range reads raw + daily. |
| `search_events` | 90 days raw, then aggregated (query, day, count, zero-result count). |
| `affiliate_clicks` | 24 months (conversion windows + tax/audit), IP stored only as salted hash. |
| `audit_logs` | 7 years (admin actions), never edited. |
| `integration_errors`, `data_ingestion_jobs` | 90 days. |
| `user_sessions` | Delete 30 days after `expiresAt`/`revokedAt`. `password_reset_tokens`: 7 days after expiry. |
| `flight_searches` / `flight_offers` | Cache: delete after `expiresAt` + 1 day. `hotel_rates`: 30 days after checkout. |
| `notifications` | 180 days. |
| Deleted accounts | `DELETE /v1/me` anonymizes/erases PII immediately (cascade deletes user-owned rows); clicks/conversions keep `userId = null`. |

## Demo seed (`packages/database/prisma/seed.ts`)
- **Resets** catalog, travel and community tables on each run (TRUNCATE … CASCADE); users are upserted. Refuses to run with `NODE_ENV=production`.
- 16 categories + 40 subcategories; 22 real US retailers (no logos, no trust scores, `pending_configuration`; official-API retailers get a pending `RetailerIntegration`).
- 89 demo products (real names/brands/specs; 2 refurbished, 1 used as separate products), 2–5 offers each (`source = demo`), offer URLs point at the retailer's real **search page** for the product title.
- 90–200 days of deterministic price history per product (seeded RNG `pricora-seed-v1`) with patterns: stable, sale windows, recent drops, gradual decline, and "hike then sale" (fake-discount detector test case; inflated `listPriceCents`).
- Demo UPCs are generated in the GS1 restricted-circulation range (prefix `4`) — they cannot collide with real products. MPN/model numbers are real where given.
- 64 airports, 18 airlines (real IATA/ICAO), 15 fictional "Demo …" hotels in 6 US cities with demo rates for 3 stay windows.
- Users (password = `SEED_ADMIN_PASSWORD` or the dev default documented in `.env.example`): `admin@`, `editor@`, `analyst@`, `merchant@` (with pending `MerchantAccount`), `user@pricora.local`.
- Feature flags: `community.deals`, `assistant.enabled`, `cashback.payouts`, `sponsored.placements` off; travel + basket on.
