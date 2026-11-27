# Web ↔ mobile parity (shopping, account, coupons, privacy)

Last checked: 2026-11-27. The source is the web route inventory (`apps/web/src/app/**`, `components/**`) compared against `apps/mobile/src/app/**`. Travel (flights, hotels, guides) is out of scope; it stays hidden behind `EXPO_PUBLIC_TRAVEL_ENABLED`.

Status legend:
- ✅ same feature
- ➕ mobile does more
- 🌐 opens the web page in the in-app browser (static or legal content)
- ⏳ not on mobile, with the reason given
- n/a not applicable to a native app

## Shopping

| Feature | Web | Mobile | Status |
|---|---|---|---|
| Home: promo tiles with photos + ⓘ credit | `/` | Home tab | ✅ |
| Home: category circles with photos | `/` | Home tab (+ "All" → tree) | ✅ |
| Home: Near lowest / Today's best deals / Biggest price drops rails (real previous price) | `/` | Home tab | ✅ |
| Home: Shop by discount 10/25/50% | `/` | Home tab → `/browse?minDiscount` | ✅ |
| Home: price-alert CTA, Trending, Under $25/$50/$100 | `/` | Home tab | ✅ |
| Home: coupons teaser | — | Home tab | ➕ |
| Home: recently viewed | signed-in rail | server list when signed in, device list otherwise | ➕ |
| Home: popular categories / popular stores | `/` | Home tab | ✅ |
| Category tree (3 levels) | mega-menu | `/categories` accordion + leaf chips | ✅ |
| Category page: breadcrumbs, sub/sibling chips, top brands, guide text | `/categories/[slug]` | `/categories/[slug]` (photo header, collapsible buying guide) | ✅ |
| Category page: "Popular in X", "Price drops in X", "Best deals" links | rails + links | link chips → `/popular?category`, `/price-drops?category`, `/best/[slug]` | ✅ |
| Search results: sort (8), grid/list, applied chips, infinite pages | SearchResults | `ProductBrowser` | ✅ |
| Filters: category, price slider + histogram, brand/store multi-select with logos, spec facets with counts | sidebar / sheet | filter bottom sheet with live "Show N results" | ✅ |
| Filters: condition (New default, groups + Any), in stock, free shipping, pay over time, below-typical 10/20/30% | sheet | filter sheet | ✅ |
| Suggestions: searches / categories / brands / products, recent + trending | header search box | Search tab | ✅ |
| Did-you-mean, "We understood", zero-results alternatives | SearchResults | Search tab | ✅ |
| Barcode lookup | — | Scan tab + typed barcode in Search | ➕ |
| Brand page + category breakdown | `/brands/[slug]` | `/brands/[slug]` | ✅ |
| Brand × category | `/brands/[slug]/[category]` | deep link → brand screen scoped to category | ✅ |
| Store page: status, shipping threshold, membership, return policy, disclosure, categories | `/stores/[slug]` | `/stores/[slug]` | ✅ |
| Store page: payment options (BNPL) with source + verified date | `/stores/[slug]` | `/stores/[slug]` | ✅ |
| Store page: coupons + follow | `/stores/[slug]` | `/stores/[slug]` (+ success rate stats) | ➕ |
| PDP gallery / variants / breadcrumbs / identifiers | ✅ | ✅ | ✅ |
| PDP price box: previous price + drop, ZIP tax line, "updated X ago" with stale warning | ✅ | ✅ (ZIP sheet works signed out) | ✅ |
| PDP Deal Score reasons, fake-discount warning, out-of-stock notice | ✅ | ✅ | ✅ |
| PDP condition tabs (New / Open box / Refurbished / Used), per-condition stats and Deal Score | ✅ | ✅ | ✅ |
| PDP offer table: sort, shipping/tax/total, condition + seller + returns, coupon, pay over time, Sponsored/Demo/Lowest | ✅ | ✅ | ✅ |
| PDP history: 7d/30d/90d/180d/1y/All, per-store toggles, condition | ✅ | ✅ (drag to read values) | ✅ |
| PDP favorite / price alert (types + condition + −5/−10/−20% presets) / compare / basket / share | ✅ | ✅ (+ add to list) | ➕ |
| PDP coupons for the product | chips | chips → coupon sheet | ✅ |
| PDP "Compare with" alternatives + similar | ✅ | ✅ (one tap to compare side by side) | ✅ |
| Compare 2–5: price + spec rows grouped, only differences, best value marked, remove | `/compare` | `/compare`: pinned product header (image, name, price, Visit store), best per row, add from search | ➕ |
| Compare tray | bottom bar | floating tray on every screen; entry points in Account and Saved | ✅ |
| Deals (sort, condition, category, top reason, fake-discount warning) | `/deals` | `/deals` | ✅ |
| Price drops (24h/7d/30d, condition, category) | `/price-drops` | `/price-drops` | ✅ |
| Popular / New | `/popular`, `/new` | `/popular`, `/new` | ✅ |
| Best-of lists (+ budget caps) | `/best/[slug]`, `/best/[cat]-under-[N]` | `/best/[slug]` (same slugs) | ✅ |
| Smart Basket (qty, ZIP, memberships, allow second-hand, scenarios) | `/basket` | `/basket` (+ Visit per line) | ✅ |
| Shopping assistant (experimental, disabled notice without provider) | `/assistant` | `/assistant` | ✅ |
| Pay over time on cards / offers | ✅ | ✅ | ✅ |
| "Used from $X" on cards | ✅ | ✅ | ✅ |
| Grocery unit price + size on cards, offers, PDP (prominent when `unitPricing`) | ✅ | ✅ | ✅ |
| "Compare sizes" (size family, best value) | ✅ | PDP chips | ✅ |
| Sort by unit price / nearest store | ✅ | sort sheet (nearest only with a ZIP) | ✅ |
| "Near me" filter with count + nearest store on cards | ✅ | filter sheet + cards (ZIP from account or device) | ✅ |
| "Available nearby" on PDP (distance, stock, pickup/delivery, separate Sponsored slot, online price) | ✅ | `NearbySection` (set-ZIP prompt, call store) | ✅ |
| Basket fulfillment (shipping / pickup / delivery) + order minimum (unknown never assumed) | ✅ | basket screen | ✅ |

## Coupons

| Feature | Web | Mobile | Status |
|---|---|---|---|
| Coupon list: store filter, sort, category | `/coupons` | `/coupons` (store sheet, 4 sorts) | ✅ |
| Show code / copy / go to store | CouponCard | animated reveal, clipboard, `/v1/coupons/:id/go` | ✅ |
| Worked? votes | signed-in vote | signed-in vote, or anonymous device report | ➕ |
| Follow store coupons + followed stores page | ✅ | ✅ | ✅ |
| Submit a coupon | API only (no web form) | `/coupons` → "Submit a coupon" sheet | ➕ |

## Account

| Feature | Web | Mobile | Status |
|---|---|---|---|
| Log in / sign up / forgot password | ✅ | ✅ | ✅ |
| Reset password from email link | `/reset-password?token` | `/reset-password?token` (universal link) | ✅ |
| Google / Apple sign-in | disabled when unconfigured | disabled ("Not available yet"); the server reports `pending_configuration` | ✅ (same state) |
| Overview counts | `/account` | Account tab rows with counts | ✅ |
| Favorites | `/account/saved` | Saved tab → Favorites | ✅ |
| Price alerts: pause/resume, delete, condition label | `/account/alerts` | `/account/alerts` | ✅ |
| Shopping lists (+ add to list) | `/account/lists` (no add) | Saved → Lists, PDP "Add to list" | ➕ |
| Recently viewed | overview rail | Saved → Recent, Home rail | ✅ |
| Profile, ZIP, theme, notifications | `/account/settings` | Profile & ZIP, Notifications, Appearance | ✅ |
| ZIP auto-detect ("Use my location", confidence) | ZIP dialog | ZIP sheet (Account, PDP, Basket) and Profile | ✅ |
| ZIP for signed-out users | cookie | device storage | ✅ |
| Edge/IP ZIP estimate | header | ⏳ needs the CDN/edge header; native requests have none |
| Push notifications for alerts / coupon follows | — | registers the device, routes taps | ➕ |
| Biometric lock | — | ✅ | ➕ |

## Privacy

| Feature | Web | Mobile | Status |
|---|---|---|---|
| Do Not Sell or Share (GPC) | `/privacy-choices` | Privacy choices: `Sec-GPC: 1` + `PUT /me/consent` when signed in | ✅ |
| Cookie consent banner / categories | banner + dialog | n/a (no cookies); analytics opt-out switch | n/a |
| Data export / delete account | `/account/privacy` | Privacy choices | ✅ |
| Data rights request (DSAR), signed out | `/privacy-choices` form | Privacy choices form (`POST /privacy/requests`) | ✅ |
| Clear on-device data | — | ✅ | ➕ |

## Info, legal, SEO

| Feature | Web | Mobile | Status |
|---|---|---|---|
| About, How we compare, Editorial policy, Contact | static pages | Account → About | 🌐 |
| Legal (privacy, terms, affiliate, accessibility, cookies) | static pages | Account → About | 🌐 |
| Credits (Unsplash + data sources) | `/credits` | `/credits` | ✅ |
| Sitemap, llms.txt, Markdown alternates, OG images, robots | machine routes | n/a | n/a |

## Known follow-ups
- Web footer "Mobile apps coming soon", and `/.well-known` app-links still have TODO Team ID / SHA-256, so universal links need those values before release.
- Edge ZIP estimate (see above).
- Assistant and OAuth become available automatically once their server adapters are configured.
