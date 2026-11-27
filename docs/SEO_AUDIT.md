# SEO + GEO audit — web (`apps/web`)

Date: 2026-11-27 · Scope: shopping site on `:3100` (travel hidden behind `NEXT_PUBLIC_TRAVEL_ENABLED`).
Benchmark: the categories of the MIT-licensed `claude-seo` plugin (technical, sitemap, images, hreflang, programmatic, schema, content/E-E-A-T, GEO/AI Overviews, agentic readiness, ecommerce). We did **not** install or run the plugin; the equivalent checks are implemented in this repo:

- `apps/web/test/structured-data.test.ts` — JSON-LD builders + canonical policy + generated copy (runs in CI, no server).
- `apps/web/test/seo-live.test.ts` — live crawl of every template (status, title/description length, canonical, robots, every JSON-LD block validated, OG image, Markdown alternates, llms.txt, sitemaps). Run with `SEO_LIVE_URL=http://localhost:3100 pnpm -C apps/web test`.
- Validator: `apps/web/src/lib/seo-validate.ts` (required/recommended fields per type + our honesty rules: no `aggregateRating`/`review`/`priceValidUntil`, decimal prices, ISO currency).

Result on 2026-11-27: 16/16 tests pass (12 unit + 4 live).

## Findings by severity

### Critical (fixed)
| # | Finding | Fix |
|---|---|---|
| C1 | No Organization entity anywhere; WebSite JSON-LD inline on home only, no `@id`/publisher. | `organizationJsonLd()` + `websiteJsonLd()` (`lib/seo.ts`) on home; pages reference `#organization` / `#website` by `@id`. |
| C2 | No E-E-A-T pages: no About, methodology, editorial policy or contact page (footer only had a `mailto:`). | New `/about`, `/how-we-compare` (data sources, offer ranking, **real Deal Score weights** from `packages/algorithms/src/dealScore.ts`, fake-discount rule, FAQPage), `/editorial-policy`, `/contact` (placeholder addresses flagged as not monitored). WebPage/AboutPage/ContactPage JSON-LD with organization as author + visible "last updated". Footer Company column links them. |
| C3 | No agentic/GEO surface: no `/llms.txt`, no Markdown versions, no answer-first summaries. | `/llms.txt` + `/llms-full.txt` (live category tree, stores, brands, data-honesty notes for assistants); `/md/products/[slug]`, `/md/categories/[slug]`, `/md/travel/guides/[slug]` (404 while travel hidden) with `Link: rel=canonical` + `X-Robots-Tag: noindex`; `<link rel="alternate" type="text/markdown">` on product/category/guide pages; answer-first summaries on product, category, brand×category and best pages. |
| C4 | Pagination canonicals on `/deals` and `/price-drops` pointed page N → page 1 (Google then drops pages 2+ and their products). | Self-canonical `?page=N`. |

### High (fixed)
| # | Finding | Fix |
|---|---|---|
| H1 | Facet policy too blunt: any param incl. `sort`/`view` → `noindex`; no curated facet was indexable. | `listingSeo()` (`lib/seo.ts`): sort/view only → canonical to clean URL, indexable; pagination → self canonical; narrowing facets → `noindex,follow`; single brand on a category → canonical to the curated `/brands/[brand]/[category]` page. Applied to category, brand, store, brand×category pages. |
| H2 | Product JSON-LD lacked per-offer data, availability, shipping, category, sku, variant grouping. | `productJsonLd()`: AggregateOffer (low/high/offerCount/availability) + `Offer[]` (price, currency, availability, condition, seller, `OfferShippingDetails` when shipping is known), `category`, `sku`, `isVariantOf` ProductGroup for storage/colour siblings. **Only non-demo offers**; no ratings; no `priceValidUntil` (we don't have a validity date — inventing one is a false claim). |
| H3 | No ItemList / CollectionPage on list templates. | CollectionPage + ItemList (URLs + names, deliberately **no prices**, so demo lists make no price claim) on category landing, brand×category, best, deals, price-drops; CollectionPage + breadcrumb on coupons. |
| H4 | No programmatic "<brand> <category>" pages; brand pages linked to facet URLs (`?brand=`). | New `/brands/[slug]/[category]` with data-built intro, breadcrumbs, cross links (more from this brand / other brands in this category). `CategoryBreakdown` links brand tiles there; category SEO block adds "By brand" links (brand↔category cross-linking). |
| H5 | `/best/[slug]` had no "under $X" variant and generic copy. | `/best/<category>-under-<dollars>` (10–100000; 0 results → 404), intro from live data (count, price range, top brands, recent drops), budget links (100/250/500/1000), CollectionPage + ItemList, breadcrumb via the category. Indexable only at ≥ 6 real products. |
| H6 | No social images per page (site default only). | `next/og` cards: `products/[slug]/opengraph-image.tsx`, `categories/[slug]/opengraph-image.tsx` (price shown only from real offers; demo cards say "Includes demo data"). Verified 200 `image/png`, also used as `twitter:image`. |
| H7 | Sitemap index used `lastmod = now` on every request (false freshness signal). | Index lastmod removed; per-URL lastmod only from data (`product.updatedAt`, newest real product for programmatic pages, guide `updatedAt`). |
| H8 | No image sitemap entries. | Product chunks add `<image:image>` (loc + alt/title) when a product has an http(s) image. Demo catalogue currently has none, so entries appear once real images exist. |

### Medium (fixed)
- M1 Titles/descriptions unbounded (product descriptions cut mid-word at 155; some titles > 70 chars). `metaTitle`/`metaDescription` clamp at word boundaries (~60/158 incl. brand suffix); product titles keep the full product name when the "— compare prices" suffix doesn't fit. Home title shortened to 57 chars. Live test enforces 15–75 / 50–165.
- M2 Snippet prices: product meta descriptions only quote a price when it comes from real offers.
- M3 Machine-readable price data on PDP: offer table "Checked" cells are `<time datetime>`; new sources line (per-offer source labels, currency, absolute last-updated `<time>`, link to methodology and the Markdown version).
- M4 Out-of-stock: notice when every offer is out of stock, summary says so, schema `OutOfStock`. Page stays indexable (product still has specs/history; see policy below).
- M5 Freshness signals: "Updated …" / "Latest drop …" `<time>` on deals and price-drops; `dateModified` on CollectionPage.
- M6 HTML sitemap `/sitemap` (all 3 category levels with counts, brands, stores, key pages) → every listing ≤ 2 clicks from any footer. Brand/store breadcrumbs now link to it.
- M7 Related-category links on non-leaf categories, "Best <category> deals" link from every category.
- M8 Sitemap index adds `best.xml` and `brand-categories.xml`; static sitemap adds `/popular`, `/new`, `/sitemap` and the company pages.

### Low / informational
- L1 `robots.txt` emits a `Host:` line (Yandex-only, ignored by Google) — harmless, left.
- L2 Google retired the visual sitelinks search box (Nov 2024); the WebSite SearchAction stays for other engines and entity clarity.
- L3 `hreflang`: US-only (multi-market stopped) → none needed; `<html lang="en">` + `og:locale en_US` present.
- L4 Viewport meta present (`width=device-width, initial-scale=1`); theme-color light/dark; manifest + icons (`/icon.png`, `/apple-icon.png`, `/brand/icon-*.png`) all 200.
- L5 Status codes verified: unknown product/category/brand/store/best → 404; `/best/<x>-under-5` → 404; hidden travel `/travel*` → 307 to `/` (temporary on purpose — it comes back); `/md/travel/...` → 404 while hidden; sitemaps 503 + `Retry-After` when the API is down.
- L6 Product pages with zero offers stay indexable (specs + alert CTA). Revisit with real data: if many such pages exist, noindex those without offers for > 30 days.

## Policies (documented decisions)
- **Indexability threshold**: programmatic pages (`/best/*`, `/brands/*/*`) are indexable and listed in sitemaps only with **≥ 6 products backed solely by real (non-demo) offers** in the top 48 results (`MIN_REAL_PRODUCTS`). Today the whole catalogue is demo data, so they all render with `noindex,follow` and `best.xml` / `brand-categories.xml` are empty — by design, not a bug.
- **Demo data**: never in structured-data prices, never in meta-description prices, always labeled in HTML, Markdown ("DEMO DATA (not a live price)") and OG cards. ItemLists carry no prices.
- **Facets**: see H1. `noindex,follow` + clean canonical is deliberate on narrowing facets (noindex wins; links still crawled).
- **Variants**: storage/colour siblings are separate SKUs with different prices → self canonical each, linked to each other, grouped via `isVariantOf` ProductGroup.
- **Markdown alternates**: `noindex` + canonical Link header so they never compete with the HTML page, but stay fetchable for AI agents (robots allows `/md/`).
- **Hidden travel**: out of sitemaps, 307 redirect, guide Markdown 404. When `NEXT_PUBLIC_TRAVEL_ENABLED=true`, guides come back with Article + FAQPage JSON-LD and Markdown alternates.

## Core Web Vitals (perf session owns fixes — report only)
Observed on the dev server (dev-mode timings, not field data): HTML TTFB 0.3–1.0 s for most templates, `/sitemap` ≈ 2 s (3 API calls), `best.xml` ≈ 3.4 s cold (fans out one search per category; cached 1 h).
- Product tile `<img>` has no width/height (CLS risk once real images land); aspect-square wrapper mitigates.
- PDP main image is eager with `fetchpriority="high"` (good LCP); thumbs lazy.
- Raw `<img>` everywhere (no `next/image` srcset) — responsive sizes are a perf decision once images are real.

## Needs real data / launch
1. Real offers → programmatic pages and product AggregateOffers become eligible automatically (no code change). Re-run the live test and check Search Console "Merchant listings" / "Product snippets".
2. Set `NEXT_PUBLIC_SITE_URL` to the production origin (all canonicals, sitemaps, JSON-LD and llms.txt use it).
3. Replace placeholder `supportEmail` / `privacyEmail` in `packages/config/src/brand.ts` (contact page shows a "not monitored" notice until then); consider adding `sameAs` social profiles to Organization once they exist.
4. Brand list for sitemap/HTML sitemap/llms comes from the search facet (top brands only) — add a brand index endpoint to list every brand.
5. Shipping/returns policy per merchant (`hasMerchantReturnPolicy`) needs retailer data we don't store yet.
6. Submit `sitemap.xml` in Search Console + Bing Webmaster; verify `llms.txt` is reachable at the production root.
7. Product images: when real images arrive, check alt text quality (currently `image.alt || product.title`) and image sitemap output.
