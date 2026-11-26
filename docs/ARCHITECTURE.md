# Architecture

## Shape
Modular monolith in a Turborepo + pnpm monorepo. One NestJS API, one BullMQ worker, two Next.js apps, one Expo app. Modules are split so hot paths (search, ingestion, travel) can be extracted into services later.

```
apps/web        Next.js App Router — consumer site (shopping + flights + hotels + auth)      :3100
apps/admin      Next.js — admin panel (/admin/*) + merchant portal (/merchant/*), RBAC        :3001
apps/api        NestJS REST + OpenAPI (/v1, docs at /docs)                                     :4400
apps/worker     BullMQ workers: ingestion, price refresh, alerts, search indexing
apps/mobile     Expo + Expo Router (iOS/Android): Home, Search, Scan, Saved, Account
packages/contracts         Zod schemas + inferred TS types for every API request/response
packages/database          Prisma schema, migrations, seed, client (Prisma 7 + @prisma/adapter-pg)
packages/design-tokens     Colors/type/spacing/radius as TS + CSS variables + Tailwind preset
packages/ui                Shared React (web) components built on tokens (shadcn-style, customized)
packages/api-client        Typed fetch client over contracts (used by web, admin, mobile)
packages/algorithms        Matching, deal score, fake-discount, price stats, basket optimizer (pure TS, tested)
packages/retailer-adapters Retailer + travel adapters behind one interface (pending_configuration w/o keys)
packages/config            brand.ts, shared tsconfig/eslint presets, env schema
packages/analytics         Event names + typed track() wrapper (provider-agnostic)
packages/utils             money formatting (cents), slugify, dates (US), ZIP validation
```

## Versions (checked on npm 2026-11-26)
Node 24, pnpm 12, Turbo 2.11, Next 16.4, React 19.3, Tailwind 4.3, NestJS 12.6, Prisma 7.10.1 (stable; 8.x is RC — do not use),
TypeScript 5.9.3 (pinned; TS 7 native compiler not yet safe for Nest decorators), Expo SDK 58, BullMQ 6.7, Meilisearch (JS 0.63).

## Local infrastructure (docker-compose.yml)
- Postgres 17 on host port **5434** (5433 is taken on this machine), db `pricora`, user/pass `pricora/pricora` (dev only)
- Redis 7 on **6380**
- Meilisearch on **7700**, master key from env
- API falls back to Postgres `ILIKE`/trigram search if Meilisearch is unreachable (logged as degraded).

## Data model rules
- Money: `Int` cents + `currency` (ISO 4217). Percentages as `Int` basis points where stored.
- `PriceHistory` is append-only, keyed (offerId, observedAt); designed for monthly range partitioning (raw SQL migration note in DATABASE_SCHEMA.md).
- Every Offer / FlightFare / HotelRate has `source` enum: `api | feed | merchant_upload | affiliate | demo`.
- Product variants that differ in storage/color/size/condition are distinct canonical products (or ProductVariants), never merged. `condition` enum: `new | refurbished | used | open_box`.
- Travel entities: `Airport`, `Airline`, `FlightSearch`(cache), `FlightOffer`(snapshot), `Hotel`, `HotelRate`(snapshot), `TravelAlert`.

## API surface (v1) — implemented in apps/api, typed in packages/contracts
Auth (httpOnly cookie session `pc_session`, CSRF double-submit token header `x-csrf-token`):
- `POST /v1/auth/register` {email,password,name} · `POST /v1/auth/login` · `POST /v1/auth/logout` · `GET /v1/auth/me`
- `POST /v1/auth/forgot-password` · `POST /v1/auth/reset-password` · `GET /v1/auth/oauth/:provider` (google/apple → pending_configuration w/o keys)
Catalog:
- `GET /v1/categories` (tree) · `GET /v1/categories/:slug` · `GET /v1/brands/:slug` · `GET /v1/retailers` · `GET /v1/retailers/:slug`
- `GET /v1/search?q&category&brand&retailer&minPrice&maxPrice&condition&inStock&sort&page` → `{items, facets, total, page, degraded}`
- `GET /v1/search/suggest?q` · `GET /v1/search/trending`
- `GET /v1/products/:slug` → product + identifiers + attributes + images + offers[] (with totals) + priceStats + dealScore
- `GET /v1/products/:slug/history?range=7d|30d|90d|180d|365d|all&retailer=` (only real points; no interpolation)
- `GET /v1/compare?ids=a,b,c` · `GET /v1/home` (sections: trending, bestDeals, priceDrops, under25/50/100, topCategories, retailers)
- `GET /v1/deals?sort&category` · `GET /v1/price-drops`
User (auth required): `/v1/me/favorites` CRUD · `/v1/me/alerts` CRUD · `/v1/me/lists` CRUD + items · `/v1/me/recently-viewed` · `/v1/me/preferences` · `GET /v1/me/export` · `DELETE /v1/me`
Basket: `POST /v1/basket/optimize` {items:[{productId,qty}], zip?, memberships?[]} → scenarios
Outbound: `GET /v1/go/:offerId` → logs AffiliateClick, 302 to affiliate/retailer URL (allow-listed hosts only)
Travel:
- `GET /v1/travel/airports?q` · `GET /v1/travel/flights/search?from&to&depart&return&adults&cabin` → `{offers, providers:[{id,status}], source}`
- `GET /v1/travel/hotels/search?city&checkin&checkout&guests&rooms` · `GET /v1/travel/hotels/:id`
- `GET /v1/travel/go/:type/:id` (affiliate redirect)
Scan: `GET /v1/scan/:code` (UPC/EAN/GTIN lookup → product + offers or not_found)
AI: `POST /v1/assistant` (provider adapter; disabled → 503 with reason) 
Admin (role ADMIN/EDITOR/ANALYST): `/v1/admin/stats`, `/v1/admin/{users,products,categories,retailers,offers,matches,anomalies,flags,audit-logs}`
Merchant (role MERCHANT): `/v1/merchant/{profile,feeds(upload CSV),offers,analytics,api-keys}`
Health: `GET /v1/health` (db, redis, search, adapters)

Errors: `{error:{code,message,details?}}` with proper HTTP status. Pagination: `page`, `pageSize` (max 60).

## Web routes (apps/web)
`/` home · `/search` · `/categories/[slug]` · `/brands/[slug]` · `/stores/[slug]` · `/products/[slug]` · `/compare` · `/deals` · `/price-drops`
`/best/[slug]` (only indexed when ≥N real products) · `/flights` + `/flights/search` · `/hotels` + `/hotels/search` + `/hotels/[id]`
`/login` · `/signup` · `/forgot-password` · `/reset-password` · `/account/*` (overview, saved, alerts, lists, settings, privacy)
`/basket` · `/assistant` · `/legal/{privacy,terms,affiliate-disclosure}` (marked DRAFT — needs legal review)
SEO: sitemap index + chunks, robots.txt, canonical, JSON-LD Product+AggregateOffer+BreadcrumbList (never Review/Rating unless real).

## Security baseline
argon2id passwords, session tokens hashed in DB, cookie `HttpOnly; Secure(prod); SameSite=Lax`, CSRF token for mutations, helmet, CORS allow-list,
rate limiting (@nestjs/throttler, Redis store), Zod validation on every input, outbound redirect host allow-list (anti open-redirect/SSRF), audit log for admin writes.
