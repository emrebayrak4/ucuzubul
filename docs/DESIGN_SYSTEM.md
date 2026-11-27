# Pricora Design System

Owner: A01 (Product Design). Source of truth for tokens: `packages/design-tokens/src`. Components: `packages/ui`.
If code and this doc disagree, fix one of them in the same PR.

---

## 1. Principles

1. **Product first.** The product image, its name and its price are the page. Chrome (nav, panels, decoration) recedes.
2. **Dense, not cramped.** Price grids show many items per screen (up to 6 columns) with a strict 4px rhythm, consistent alignment and tabular numbers. Density comes from order, not from smaller type.
3. **Honest by construction.** Every price says where it came from and when. Demo data is labeled. Sponsored is labeled. No invented ratings, counts, "trusted by" claims or urgency timers. If we do not know (tax, shipping, stock), we say "estimated" or "unknown".
4. **Calm color.** One deep green brand color, one lime accent used sparingly, neutrals for everything else. Color carries meaning (deal tier, price drop, error), never decoration.
5. **Restraint.** Small radii (4/6/10), faint shadows, no gradients, no glass, no purple, no emoji icons, no cards inside cards.
6. **Fast, lively motion on real data.** 120–260ms for feedback; small looping accents (deal badges, live dots) are allowed (4.1). Composite-only, no layout shift, everything collapses under `prefers-reduced-motion`.
7. **Accessible by default.** WCAG 2.2 AA in light and dark, visible focus rings, keyboard paths for every interaction, 44px touch targets on mobile.

---

## 2. Color

All colors are semantic tokens. Components and apps never use hex values or Tailwind's default palette — the default palette is **removed** in `tailwind.css` (`--color-*: initial`), so `bg-gray-100` or `text-purple-600` simply do not exist. Only `white`/`black` survive for edge cases (image overlays).

### 2.1 Palette (blue theme, 2026-11-26)

White base, confident blue brand, orange/amber accent for deal highlights, green only for success / lowest price, red for drop % chips, teal for the travel area. Each `*-fg` / `*-soft-fg` token is the AA text colour for its fill (see 2.2).

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#0B1120` | Page background (pure white / deep navy) |
| `surface` | `#FFFFFF` | `#111827` | Cards, panels, inputs, menus |
| `surface-2` | `#F5F6F7` | `#1A2233` | Light grey bands, image wells, hover rows |
| `surface-3` | `#E9EBEE` | `#243044` | Pressed states, skeletons |
| `text` | `#111827` | `#E5E7EB` | Primary text |
| `text-muted` | `#4B5563` | `#9CA3AF` | Secondary text, meta |
| `border` | `#E5E7EB` | `#273244` | Dividers, card outlines |
| `border-strong` | `#858C97` | `#6B7686` | Form control borders (≥3:1) |
| `ring` | `#1A56DB` | `#7AA7FF` | Focus ring |
| `primary` | `#1A56DB` | `#5B8DEF` | Brand blue: primary buttons, links, active states, search button |
| `primary-hover` | `#1648BE` | `#7AA2F5` | Hover of primary fills |
| `primary-fg` | `#FFFFFF` | `#050B18` | Text on primary |
| `primary-soft` | `#EEF4FF` | `#172645` | Light blue tint bands, selected chips |
| `accent` | `#FF9F1C` | `#FFA53D` | Orange/amber highlight fill (deal CTAs, discount tiles, badges) — fill only, dark text |
| `accent-hover` | `#F58E00` | `#FFB75E` | Accent hover |
| `accent-fg` | `#111827` | `#111827` | Text on accent |
| `success` | `#047857` | `#34D399` | Success, in stock, lowest price |
| `success-soft` | `#E7F6EF` | `#0F2A22` | Success tint |
| `warning` | `#B45309` | `#F5A524` | Warning text, warm promo tint |
| `warning-soft` | `#FFF4E5` | `#33250F` | Warm orange tint bands |
| `error` | `#C81E1E` | `#F87171` | Errors, destructive |
| `error-soft` | `#FDECEC` | `#3A1A1A` | Error tint |
| `info` | `#1E5AA8` | `#7AB0F5` | Neutral notices |
| `info-soft` | `#E8F0FB` | `#152739` | Info tint |
| `travel` | `#0F766E` | `#2DD4BF` | Travel area accent (teal) |
| `travel-soft` | `#E6F6F4` | `#0E2A2A` | Travel search band |
| `price-drop` | `#C81E1E` | `#F87171` | Red drop % chips / text |
| `price-drop-soft` | `#FDECEC` | `#3A1A1A` | Drop badge tint |
| `deal-exceptional` | `#1A56DB` | `#5B8DEF` | Deal Score 90–100 |
| `deal-great` | `#047857` | `#34D399` | 75–89 |
| `deal-good` | `#E0EDFF` | `#172645` | 60–74 |
| `deal-average` | `#FFF4E5` | `#33250F` | 40–59 |
| `deal-poor` | `#EEF0F2` | `#243044` | 0–39 |
| `sponsored` | `#F3EFE2` | `#2D2A1E` | Sponsored label |
| `demo` | `#FFF1C7` | `#3A2E0A` | Demo data label |
| `demo-border` | `#E8C766` | `#6B5414` |  |
| `overlay` | `rgba(17, 24, 39, 0.48)` | `rgba(0, 0, 0, 0.6)` | Scrim |

### 2.2 Contrast (WCAG 2.x, computed — the build fails if any pair regresses)

`node packages/design-tokens/scripts/build-css.mjs --report` prints this table. Requirement: 4.5:1 for text, 3:1 for UI boundaries/focus.

| Pair | Use | Min | Light | Dark |
|---|---|---|---|---|
| `text` on `bg` | Body text on page | 4.5:1 | 17.74 (#111827 / #FFFFFF) | 15.21 (#E5E7EB / #0B1120) |
| `text` on `surface` | Body text on card | 4.5:1 | 17.74 (#111827 / #FFFFFF) | 14.33 (#E5E7EB / #111827) |
| `text` on `surface-2` | Body text on well | 4.5:1 | 16.39 (#111827 / #F5F6F7) | 12.84 (#E5E7EB / #1A2233) |
| `text-muted` on `bg` | Secondary text on page | 4.5:1 | 7.56 (#4B5563 / #FFFFFF) | 7.42 (#9CA3AF / #0B1120) |
| `text-muted` on `surface` | Secondary text on card | 4.5:1 | 7.56 (#4B5563 / #FFFFFF) | 6.99 (#9CA3AF / #111827) |
| `text-muted` on `surface-2` | Secondary text on well | 4.5:1 | 6.98 (#4B5563 / #F5F6F7) | 6.26 (#9CA3AF / #1A2233) |
| `border-strong` on `surface` | Form control border | 3:1 | 3.39 (#858C97 / #FFFFFF) | 3.85 (#6B7686 / #111827) |
| `border-strong` on `bg` | Form control border on page | 3:1 | 3.39 (#858C97 / #FFFFFF) | 4.09 (#6B7686 / #0B1120) |
| `ring` on `bg` | Focus ring | 3:1 | 6.18 (#1A56DB / #FFFFFF) | 7.89 (#7AA7FF / #0B1120) |
| `ring` on `surface` | Focus ring on card | 3:1 | 6.18 (#1A56DB / #FFFFFF) | 7.43 (#7AA7FF / #111827) |
| `primary` on `surface` | Primary as link/text | 4.5:1 | 6.18 (#1A56DB / #FFFFFF) | 5.49 (#5B8DEF / #111827) |
| `primary` on `bg` | Primary link on page | 4.5:1 | 6.18 (#1A56DB / #FFFFFF) | 5.83 (#5B8DEF / #0B1120) |
| `primary-fg` on `primary` | Primary button label | 4.5:1 | 6.18 (#FFFFFF / #1A56DB) | 6.09 (#050B18 / #5B8DEF) |
| `primary-fg` on `primary-hover` | Primary button hover | 4.5:1 | 7.76 (#FFFFFF / #1648BE) | 7.79 (#050B18 / #7AA2F5) |
| `primary-soft-fg` on `primary-soft` | Soft primary chip | 4.5:1 | 9.38 (#1E3A8A / #EEF4FF) | 9.99 (#BFD3FF / #172645) |
| `accent-fg` on `accent` | Accent button/label | 4.5:1 | 8.64 (#111827 / #FF9F1C) | 9.04 (#111827 / #FFA53D) |
| `accent-fg` on `accent-hover` | Accent hover | 4.5:1 | 7.39 (#111827 / #F58E00) | 10.29 (#111827 / #FFB75E) |
| `success` on `surface` | Success text | 4.5:1 | 5.48 (#047857 / #FFFFFF) | 9.23 (#34D399 / #111827) |
| `success` on `success-soft` | Success on tint | 4.5:1 | 4.92 (#047857 / #E7F6EF) | 7.95 (#34D399 / #0F2A22) |
| `success-fg` on `success` | Solid success | 4.5:1 | 5.48 (#FFFFFF / #047857) | 9.76 (#04150E / #34D399) |
| `warning` on `surface` | Warning text | 4.5:1 | 5.02 (#B45309 / #FFFFFF) | 8.69 (#F5A524 / #111827) |
| `warning` on `warning-soft` | Warning on tint | 4.5:1 | 4.62 (#B45309 / #FFF4E5) | 7.29 (#F5A524 / #33250F) |
| `warning-fg` on `warning` | Solid warning | 4.5:1 | 5.02 (#FFFFFF / #B45309) | 9.19 (#1A1004 / #F5A524) |
| `error` on `surface` | Error text | 4.5:1 | 5.74 (#C81E1E / #FFFFFF) | 6.41 (#F87171 / #111827) |
| `error` on `bg` | Error text on page | 4.5:1 | 5.74 (#C81E1E / #FFFFFF) | 6.81 (#F87171 / #0B1120) |
| `error` on `error-soft` | Error on tint | 4.5:1 | 5.02 (#C81E1E / #FDECEC) | 5.65 (#F87171 / #3A1A1A) |
| `error-fg` on `error` | Destructive button | 4.5:1 | 5.74 (#FFFFFF / #C81E1E) | 6.95 (#1F0707 / #F87171) |
| `info` on `surface` | Info text | 4.5:1 | 6.81 (#1E5AA8 / #FFFFFF) | 7.90 (#7AB0F5 / #111827) |
| `info` on `info-soft` | Info on tint | 4.5:1 | 5.93 (#1E5AA8 / #E8F0FB) | 6.77 (#7AB0F5 / #152739) |
| `info-fg` on `info` | Solid info | 4.5:1 | 6.81 (#FFFFFF / #1E5AA8) | 8.45 (#06111F / #7AB0F5) |
| `travel` on `surface` | Travel accent text | 4.5:1 | 5.47 (#0F766E / #FFFFFF) | 9.53 (#2DD4BF / #111827) |
| `travel-fg` on `travel` | Travel solid (buttons, active tab) | 4.5:1 | 5.47 (#FFFFFF / #0F766E) | 7.79 (#042F2C / #2DD4BF) |
| `travel-soft-fg` on `travel-soft` | Travel band text | 4.5:1 | 6.81 (#115E59 / #E6F6F4) | 12.04 (#99F6E4 / #0E2A2A) |
| `text` on `travel-soft` | Body text on travel band | 4.5:1 | 15.93 (#111827 / #E6F6F4) | 12.26 (#E5E7EB / #0E2A2A) |
| `price-drop` on `surface` | Price-drop text | 4.5:1 | 5.74 (#C81E1E / #FFFFFF) | 6.41 (#F87171 / #111827) |
| `price-drop` on `price-drop-soft` | Price-drop badge | 4.5:1 | 5.02 (#C81E1E / #FDECEC) | 5.65 (#F87171 / #3A1A1A) |
| `deal-exceptional-fg` on `deal-exceptional` | Deal: Exceptional | 4.5:1 | 6.18 (#FFFFFF / #1A56DB) | 6.09 (#050B18 / #5B8DEF) |
| `deal-great-fg` on `deal-great` | Deal: Great | 4.5:1 | 5.48 (#FFFFFF / #047857) | 9.76 (#04150E / #34D399) |
| `deal-good-fg` on `deal-good` | Deal: Good | 4.5:1 | 8.74 (#1E3A8A / #E0EDFF) | 9.99 (#BFD3FF / #172645) |
| `deal-average-fg` on `deal-average` | Deal: Average | 4.5:1 | 6.26 (#8A4B00 / #FFF4E5) | 9.12 (#F5C27A / #33250F) |
| `deal-poor-fg` on `deal-poor` | Deal: Poor | 4.5:1 | 6.62 (#4B5563 / #EEF0F2) | 8.04 (#C3CAD4 / #243044) |
| `sponsored-fg` on `sponsored` | Sponsored label | 4.5:1 | 7.01 (#5E4F16 / #F3EFE2) | 9.04 (#DCCD95 / #2D2A1E) |
| `demo-fg` on `demo` | Demo data label | 4.5:1 | 7.06 (#6E4A00 / #FFF1C7) | 9.12 (#F5D277 / #3A2E0A) |
| `demo-border` on `surface` | Demo label outline (decorative) | 1.5:1 | 1.64 (#E8C766 / #FFFFFF) | 2.45 (#6B5414 / #111827) |

### 2.3 Color rules
- Orange `accent` is a fill with dark `accent-fg` text; for orange-ish text use `warning`.
- Green means success / in stock / lowest price. Red is used for drop % chips (founder decision 2026-11-26) and errors; never for the sale price itself.
- Never encode meaning with color alone: deal badges carry the number + tier word, drops carry an arrow + "%".

---

## 3. Typography

Fonts: **Plus Jakarta Sans** (all UI text — headings, body, buttons, prices; variable 200–800; founder decision 2026-11-27, replacing Nunito Sans) and **Geist Mono** (literal codes only: UPC/GTIN, model numbers). Web/admin load Plus Jakarta Sans with `next/font/google` (`Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-plus-jakarta-sans" })`) and put the variable class on `<html>`; the token stack `--pc-font-sans` starts with `var(--font-plus-jakarta-sans)`. Mobile registers it per weight as `PlusJakartaSans-Regular`, `PlusJakartaSans-SemiBold`, `PlusJakartaSans-Bold`, `PlusJakartaSans-ExtraBold` (`tokens.nativeFontFamily`, `FONTS` in `apps/mobile/src/lib/theme.tsx`). Plus Jakarta Sans has tabular figures (`tnum`), used by the `price` utility.

| Step | Size / line-height | Tracking | Typical use |
|---|---|---|---|
| `text-2xs` | 11 / 14 | +0.01em | Badges, overlines |
| `text-xs` | 12 / 16 | +0.005em | Meta ("at 7 stores", "updated 2h ago"), captions |
| `text-sm` | 13 / 18 | 0 | Tile titles, table cells, labels |
| `text-base` | 14.5 / 20.3 (1.4) | 0 | **Default UI text** (founder 2026-11-27: a hair above the original 14) |
| `text-md` | 15.5 / 22 | −0.005em | Reading text, inputs on mobile, tile price |
| `text-lg` | 17 / 24 | −0.01em | Card titles, h4 |
| `text-xl` | 20 / 28 | −0.012em | Section titles (rails), h3, offer-table hero price |
| `text-2xl` | 24 / 30 | −0.015em | Page h2 |
| `text-3xl` | 30 / 36 | −0.02em | Product page price, h1 |
| `text-4xl` | 38 / 44 | −0.022em | Display (homepage headline) |
| `text-5xl` | 48 / 52 | −0.025em | Reserved (marketing) |

Weights: 400 body, 600 buttons/nav/labels, 700 headings and prices, 800 for tile prices and hero headlines (Walmart-style bold prices).

**Numbers:** every money value, percentage, count and score uses the `price` utility (tabular + lining figures, −0.01em). Tailwind's `tabular-nums` alone is acceptable for counts in tables.

---

## 4. Space, radius, elevation, z-index, motion

- **Spacing:** 4px grid (`--spacing: 0.25rem`). Common: 2 (8), 3 (12), 4 (16), 6 (24), 8 (32), 12 (48). Section gaps on home: 40–48px desktop, 32px mobile.
- **Radius:** `rounded-xs` 2 (kbd, checkbox), `rounded-sm` 4 (badges, image wells), `rounded-md` 6 (buttons, inputs, tiles), `rounded-lg` 10 (dialogs, panels, popovers). `rounded-full` only for chips, avatars, switches, circular arrow buttons. Larger radii are removed from the theme.
- **Shadows:** `shadow-xs` (buttons), `shadow-sm` (tile hover), `shadow-md` (menus, popovers), `shadow-lg` (dialogs, sheets, toasts). Prefer borders over shadows for resting state.
- **Z-index utilities:** `z-raised` 10, `z-sticky` 100 (header), `z-dropdown` 1000, `z-overlay` 1100, `z-modal` 1200, `z-popover` 1300, `z-toast` 1400, `z-tooltip` 1500. Popover/tooltip > modal so they work inside dialogs.
- **Motion:** `duration-fast` 120ms (hover, press, toggles), `duration-base` 180ms (popover, fade), `duration-slow` 260ms (sheet slide). Easing `ease-standard` (state changes), `ease-out` (enter), `ease-in` (exit). Animations: `animate-fade-in/out`, `animate-pop-in/out`, `animate-slide-in/out-{right,left,bottom}`, `animate-skeleton`. See 4.1 for the motion layer. Under `prefers-reduced-motion` all token durations become ~0 and a base rule neutralizes transitions/animations. Never animate the layout of result lists.
- **Controls:** heights sm 32 / md 38 / lg 44px (`--pc-control-h-{sm,md,lg}`; Button, IconButton, Input, Select, SearchInput).
- **Breakpoints:** `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536, `3xl` 1920.

### 4.1 Motion layer (founder decision 2026-11-27: "lively — discounts change color, things move")

Lively, but still honest and cheap. Rules: **composite-only** (`transform`/`opacity`; `background-position` only on small badges), **no layout shift** (numbers animate inside a box sized by the final value), **no infinite motion on large areas** (only badges/dots loop), **everything off under `prefers-reduced-motion`** (utilities are gated on `no-preference`; components render the final state), and **server HTML always shows the final state** (no-JS, SEO, screenshots). Motion only ever decorates real data: never animate an invented "previous price", never show a live dot without a real `updatedAt`.

**CSS utilities** (`@pricora/design-tokens/tailwind.css`):

| Utility | What it does | Use on |
|---|---|---|
| `animate-shimmer` | Diagonal light sweep every ~4s (pseudo-element `translateX`) | Small badges only (drop %, Exceptional/Great) |
| `animate-hot` | Red → deep-orange fill that slowly drifts (text = `price-drop-soft`, AA on both ends) | Drop badges ≥ 20% (PriceDropBadge does this) |
| `animate-pulse-dot` | 8px dot + expanding ring, `currentColor` | "Live" indicators (use `<LiveDot>`) |
| `skeleton-shimmer` | Soft light band sweeping across a skeleton | `Skeleton` already uses it |
| `animate-flash-success` | One-shot green flash behind an element | Drop amount; add the class when the element is in view |
| `hover-lift` | `translateY(-3px)` on hover | Cards that are links |
| `hover-tilt` | `rotate(-1.25deg) scale(1.03)` on hover | Promo tiles, category circles |
| `group-hover-zoom` | Child scales 1.06 when the `.group` ancestor is hovered (parent must be `overflow-hidden`) | Tile/promo images |
| `hover-bounce-icon` | SVG icons inside bounce once on hover/focus | Header icons, category circles, CTA icons |
| `press-scale` | `scale(0.97)` while pressed | Custom buttons/tiles (Button/IconButton already press) |
| `reveal-on-scroll` | Fade/slide-up when `data-reveal` goes `pending → in` | Set by `<Reveal>` / `useReveal()` |
| `animate-check`, `animate-pop` | Check mark draws itself / pops in | Copied, Alert set (`<AnimatedCheck>`) |

**React primitives** (`@pricora/ui`):

- `<Reveal as="section" index={i}>` / `useReveal()`: fade-up on first scroll into view; `index` staggers 50ms per item (max 400ms). Elements already on screen at hydration never hide.
- `<CountUp value={storeCount} />`: counts up from 0 on first view (stats like "22 stores", "N coupons"). Width is reserved; screen readers get the final number.
- `<PriceRoll cents={c} previousCents={real} />` and `PriceTag previousCents={real}`: the price rolls down from the real previous price on first view; PriceTag also shows "−$X" with a one-time green flash.
- `<LiveDot updatedAt={offer.updatedAt} />`: pulsing dot + "Updated Xm ago", rendered only when the real timestamp is under 60 min old (computed after hydration).
- `<CouponCodeReveal code={c.code} onReveal={trackClick} />`: the "Show code" cover slides aside, then Copy with an animated check and an `aria-live` confirmation.
- `<AnimatedCheck />`, `usePrefersReducedMotion()`, `useInViewOnce(ref)`.

**Built into shared components:** `PriceDropBadge` (shimmer; ≥ 20% → `animate-hot`; `animated={false}` to opt out), `DealScoreBadge` (shimmer on Exceptional/Great), `Button`/`IconButton` (press scale 0.97/0.94), `Skeleton` (sweep), `ProductTile` (hover lift, image zoom, new `quickActions` slot that slides up on hover/focus and is always visible on touch), `ProductRail` (staggered reveal by default, `reveal={false}` to opt out; `autoAdvance` for "Today's deals": advances one tile every 4.5s, pauses on hover/focus/touch/hidden tab/off-screen, has a pause/play button), web header (store count `CountUp`, icon bounce).

**Adoption checklist for feature sessions:** use `PriceDropBadge`/`DealScoreBadge` instead of hand-rolled badges; `grid-products` + `<Reveal index>` for grids; `hover-tilt` + `hover-bounce-icon` on promo tiles and category circles; `CouponCodeReveal` in coupon cards; `CountUp` for stat numbers; `LiveDot` where a real `updatedAt` exists; `PriceTag previousCents` only with a real tracked previous price.

---

## 5. Layout

- **Content width:** `container-content` = 100% with gutters 16 / 24 (md) / 32 (xl), max 1280px, 1360px at ≥1920 (`--pc-content-max`). Root font-size stays 100% (no root scaling or zoom). Full-bleed only for the header bar background and footer.
- **Grid:** 12 columns, 24px gap on desktop, 16px on mobile.
- **Dense product grid:** use the `grid-products` utility: 2 cols (base) → 3 (`sm`) → 4 (`lg`) → 5 (`xl`) → 6 (`2xl`, ≥1536), gap 12px (14px from `lg`), tiles never narrower than 150px.
  Search/category pages with a filter sidebar (240–264px, `lg+`) drop one column (max 5).
- **Rails:** `ProductRail` shows ≈2.3 / 3.2 (`sm`) / 4 (`lg`) / 5 (`xl`) / 6 (`2xl`) tiles per view; the partial tile on mobile signals scrollability.
- **Header height:** 64px mobile, 66px desktop main bar (`--pc-header-h`), logo 38px. Sticky. The category nav row is priority+: items that do not fit collapse into "More".

---

## 6. Components (`@pricora/ui`)

| Component | Notes / rules |
|---|---|
| `Button` | Variants `primary` (one per view region), `accent` (rare highlight CTA), `secondary`, `soft`, `ghost`, `link`, `destructive`. Sizes sm 32 / md 40 / lg 48. `loading` sets `aria-busy` + spinner. `asChild` to style a Link. |
| `IconButton` | `label` is **required** (becomes `aria-label` + `title`). |
| `Input`, `SearchInput`, `Select` (native), `Checkbox`, `RadioGroup`/`RadioGroupItem`, `Switch`, `Label`, `FieldMessage` | Inputs are 16px below `sm` (no iOS zoom). `SearchInput` with autocomplete: pass `combobox={{ expanded, listboxId, activeOptionId }}` (renders ARIA 1.2 combobox); never pass raw `aria-expanded` to a plain search input. Invalid → `invalid` prop (`aria-invalid`) + `FieldMessage tone="error"` linked via `aria-describedby`. Use native `Select` for forms; `DropdownMenu` only for actions. |
| `Badge` | Neutral metadata. `pill` only for filter chips. |
| `DealScoreBadge` | Number + tier word, colored by tier. Tooltip-free: the word is visible. |
| `PriceTag` | Cents in. Tabular. Optional `from`, `estimated` ("est."), `suffix` ("/night", "total"), strike-through `listPriceCents` (only if higher than current). `tone="primary"` only for the single hero price. |
| `PriceDropBadge` | Positive integer %, optional `context` ("vs 30-day avg"). Renders nothing under 1%. |
| `DemoDataBadge` | **Mandatory** on any demo-sourced offer/fare/rate/tile. |
| `SponsoredLabel` | **Mandatory** on any paid placement. |
| `Card` (+Header/Title/Description/Content/Footer) | Sparingly. Never nested. Not for product tiles. |
| `ProductTile` | Dense tile: image on `surface-2` well (or category icon fallback — never a placeholder photo), brand, 2-line title, lowest price, "at N stores", drop %, Deal Score corner badge, Sponsored/Demo labels. Whole tile is one link; `action` (favorite) sits on top. Accepts `linkComponent` (next/link) and `renderImage` (next/image). |
| `ProductRail` | Snap-scrolling list with prev/next buttons (md+), "See all" link, `headerExtra` slot. |
| `Tabs` (`underline` / `segmented`) | **Only when each trigger has a `TabsContent` panel** (e.g. Under $25/$50/$100 rail, product page sections). Never as a value toggle — triggers point `aria-controls` at panels. |
| `SegmentedControl` | Single-choice value picker with radio semantics (`role=radiogroup`, arrow keys, one tab stop, required `label`). Use for one-way/round-trip, price-history range, flight sort, grid/list. |
| `Dialog`, `Sheet` (`right`/`left`/`bottom`), `Popover`, `Tooltip` (+`TooltipProvider`), `DropdownMenu` | Radix-based (focus trap, Esc, aria). Bottom sheet for mobile filters. Tooltips are supplementary only — never hide required info (e.g. demo/sponsored disclosure) in a tooltip. |
| `Skeleton`, `ProductTileSkeleton` | Match final geometry to avoid layout shift. |
| `EmptyState`, `ErrorState` | Always offer a next step (clear filters, retry). |
| `Pagination` | Link mode (`getHref`, SEO) preferred; button mode for client state. |
| `Breadcrumbs` | Last item = current page. Pair with BreadcrumbList JSON-LD. |
| `RatingDisplay` | Renders **nothing** unless a real rating (and non-zero count) is passed. Always pass `source`. |
| `Avatar`, `StoreLogo` | StoreLogo: real logo, else monogram on the retailer brand color. Foreground is picked by contrast and the background is nudged darker/lighter until text is ≥4.5:1 (`monogramColors()`), e.g. eBay #E53238 → #DA3035 with white (4.71:1). |
| `Toaster` / `toast` | Sonner, styled with tokens. Bottom-right desktop. Short confirmations only ("Alert created"). |
| `Stat` | Real numbers only (price stats, admin KPIs). |
| `Table` primitives | `numeric` on `TableHead`/`TableCell` right-aligns with tabular figures. Offer tables use these. |
| `Separator`, `CategoryIcon` | |

Helpers: `cn`, `focusRing`, `formatPrice(cents, {currency})`, `percentDrop`, `formatCount` (also server-safe via `@pricora/ui/utils`), `dealTierFromScore`.

---

## 7. Price display rules

1. **Always tabular** (`price` utility / `PriceTag`). Always from integer cents. Always with currency symbol; show cents (`$189.99`, `$5.00`) except in compact chips where `trimZeroCents` is allowed.
2. **Item price vs total.** Offer rows show item price, shipping, estimated tax and **estimated total**. Default sort on product pages = lowest *total*. Label the column "Est. total".
3. **Unknowns are explicit.** No ZIP → tax column reads "Set ZIP" (link to ZIP selector); total is marked `estimated`. Unknown shipping → "Shipping: check store", never `$0.00`.
4. **"from" prefix** whenever one number summarizes several offers or fares (tiles, rails, hotel cards: "from $129 /night").
5. **Strike-through only if real**: a verified list/previous price that is higher. Never fabricate "was" prices. If the fake-discount engine flags a claim, show its neutral message ("Advertised 40% off · 8% below 90-day median") instead of a big red percentage.
6. **Freshness:** every offer row and product price shows "Checked 2h ago" (relative, with absolute time in `title`). Prices older than 24h get a `warning` "Price may have changed" note.
7. Drops use green + down arrow; increases use `text-muted` + up arrow (not alarming red) except in alerts.
8. Travel: fares show **total for all passengers incl. taxes/fees** when the provider gives it; otherwise "per person, excl. fees". Hotels show "/night" and total stay in secondary text.

## 8. Deal Score

Tiers (mirrors `packages/algorithms`): **90+ Exceptional**, **75 Great**, **60 Good**, **40 Average**, **<40 Poor**. Colors in §2.1. Display as `DealScoreBadge` (number + word). On product pages, pair the badge with a short "Why" list (reasons from the engine, e.g. "12% below 90-day median", "Lowest of 7 stores"). Low-confidence scores show "Limited price history" in `text-muted`. Sponsored status never affects the score or its color.

## 9. Sponsored & demo labeling (non-negotiable)

- **Sponsored:** every paid placement carries `SponsoredLabel` at the top-left of the unit, visible without hover. Sponsored units never interleave inside organic ranked results without the label and never take the "Best price" slot. Separate sponsored rails are titled e.g. "Sponsored picks".
- **Demo data:** any entity with `source = "demo"` renders `DemoDataBadge` *at the place the price appears* (tile, offer row, fare card, hotel rate). Pages composed entirely of demo data additionally show a slim `info` notice at the top: "Showing demo data — live store connections are not configured yet." Never remove the label via CSS, never shrink below `text-2xs`.
- Pending providers (travel/retail adapters with `pending_configuration`) appear in provider lists with status "Not connected" in `text-muted` — never as if they returned no results.

## 10. Dark mode

- Class strategy: `.dark` or `[data-theme="dark"]` on `<html>` (next-themes `attribute="class"`, `enableSystem`). Tailwind `dark:` variant is wired to the same selectors.
- All semantic tokens switch automatically; components rarely need `dark:`. Product images on white backgrounds use `mix-blend-multiply` in light and normal in dark (inside a `surface-2` well).
- Brand green lightens (`#5CC49A`) so text/links keep ≥8:1. Lime stays lime.

## 11. Mobile (React Native) token mapping

`import { tokens, lightColors, darkColors } from "@pricora/design-tokens"` (ESM + CJS builds).

| Web | React Native |
|---|---|
| CSS vars / Tailwind classes | `tokens.colors[scheme][name]` with `useColorScheme()` |
| `text-*` steps | `tokens.fontSize[step]` → `{ fontSize: size, lineHeight, letterSpacing: size * letterSpacing }` |
| Geist via next/font | `tokens.nativeFontFamily` (expo-font) |
| `price` utility | `fontVariant: ["tabular-nums"]` |
| spacing scale | `tokens.spacing` (px numbers) |
| radius | `tokens.radius` (`full` = 9999) |
| shadows | `tokens.nativeShadow.{sm,md,lg}` (iOS shadow* + Android elevation) |
| motion | `tokens.motion.duration` + `tokens.motion.nativeEasing` → `Easing.bezier(...)`; check `AccessibilityInfo.isReduceMotionEnabled()` |
| Sheet (bottom) | native bottom sheet; Tabs → bottom tab bar (Home, Search, Scan, Saved, Account) |

Touch targets ≥ 44pt (`tokens.layout.minTouchTarget`). Haptics: light impact on favorite/alert toggle only.

## 12. Do / Don't

| Do | Don't |
|---|---|
| Semantic tokens (`bg-surface`, `text-text-muted`) | Hex values, default Tailwind palette, purple/magenta campaign bands |
| One primary button per region | Rows of competing colored CTAs |
| Real product images on neutral wells; category icon if missing | Placeholder/stock photos, emoji icons |
| Borders + whitespace to group | Cards inside cards, heavy shadows, glassmorphism, gradients |
| "Estimated", "Unknown", "Demo data" when true | Fake ratings, "10,000+ happy shoppers", countdown timers |
| `price` utility on every number | Proportional figures in price columns |
| 4/6/10 radii | 16–24px "bubbly" radii everywhere |
| Short motion on real data (4.1), small looping badge accents | Parallax, bouncy springs on web, looping motion on large areas, counters on invented numbers |
| Visible focus ring | `outline: none` without replacement |

---

## 13. Page specs

### 13.1 Header (web)
Sticky, `surface` background, bottom `border`, main bar 66 (lg) / 64 (mobile).
- **Row 1 (lg+):** Logo (left, links home) · **wide search** (flex-1, max ~720px, `SearchInput size="lg"`, placeholder "Search products, brands, or paste a product URL", `/` shortcut, autocomplete popover with suggestions / recent / trending) · ZIP selector (`MapPin` + "ZIP 10001" or "Set ZIP", opens popover) · Alerts icon (bell, badge count from real data) · Compare (count) · **Log in** (ghost) / **Sign up** (primary, sm). Logged in → Avatar dropdown (Account, Saved, Alerts, Lists, Settings, Log out).
- **Row 2 (lg+, 40px, `border-t`):** "All categories" menu button (mega menu: 16 categories in 4 columns with subcategories) · Deals · Price Drops · Flights · Hotels · Price Alerts · Compare. Active item: `text` + 2px `primary` underline.
- **Mobile:** Row 1 = menu button (left Sheet with categories + links), logo, account icon. Row 2 = full-width search. Flights/Hotels reachable from the sheet and home quick-search module.

### 13.2 Homepage section order
1. Header
2. Compact intro strip (not a giant hero): one line value prop + search is already in header; right side: Flight/Hotel quick-search module (Tabs segmented: Flights | Hotels).
3. Category strip (horizontal icon+label chips, 16 categories, scrollable)
4. Trending (rail)
5. Today's best deals (rail, sorted by Deal Score)
6. Biggest price drops (rail, PriceDropBadge prominent)
7. Popular categories (grid of category tiles with 3 product thumbnails each)
8. Under $25 / $50 / $100 (one rail with segmented Tabs)
9. Recently viewed (only if any; local/user data)
10. Recommendations (only if signed in / enough signals)
11. Popular retailers (StoreLogo grid with real offer counts)
12. Seasonal collections & Editor's picks (curated rails, labeled)
13. Price alert CTA band (`primary-soft` background, not a purple banner): "Get notified when prices drop" + Set alert
14. Footer: 5 link columns (Shop, Travel, Tools, Company, Legal) + affiliate disclosure text + ZIP/theme toggles. Mark legal pages DRAFT.

Demo-data notice appears under the header when the home payload is demo-sourced.

### 13.3 Product page
- Breadcrumbs.
- **Above the fold (lg: 12-col):** Gallery (cols 1–5; thumbnails vertical, main image on `surface-2`), Summary (cols 6–12): brand, title (h1 `text-2xl`), model / UPC (mono), variant selectors (storage, color, condition as chips), **lowest price** `PriceTag size="xl"` + "at N stores" + DealScoreBadge + "Why this score" (popover or inline list), freshness line, actions: **Visit store** (primary, goes to `/go/:offerId`), Set price alert (accent), Favorite, Compare, Share (icon buttons).
- **Offer table** (full width, `Table`): Store (StoreLogo + name + DemoDataBadge if demo) · Price · Shipping · Est. tax ("Set ZIP") · **Est. total** (bold, sorted asc) · Condition · Stock · Delivery · Checked · Coupon · Visit store. Affiliate disclosure line under the table. Mobile: each offer becomes a stacked row (store + total + Visit button; details expandable).
- **Price history:** segmented Tabs 7d/30d/90d/180d/1y/All; line chart of real points only (no smoothing between gaps); stats row (`Stat`): Lowest ever, 90-day median, Average, Current vs median.
- Specs (two-column definition table), Description, Similar products rail, "Compare with" rail.

### 13.4 Flights result card
Row layout (`surface`, `border`, `rounded-md`, p-4), one card per itinerary:
- Left: airline logo/monogram (StoreLogo), airline name(s) `text-xs muted`.
- Middle: per leg — depart time `text-lg 600 price` · origin IATA · line with stops dots and duration (`text-xs`) · arrive time (+1 day marker) · destination IATA. Stops text: "Nonstop" (success) / "1 stop · ORD 1h 20m".
- Right: `PriceTag from? size="lg"` total for N passengers + "total incl. taxes" or "per person" per §7, provider name + status, DemoDataBadge if demo, **View deal** (primary) → `/v1/travel/go/flight/:id`.
- Top-left tags (optional): "Cheapest", "Fastest", "Best" (neutral Badge, computed honestly from the current result set).
- Sort tabs above results: Best · Cheapest · Fastest. Provider strip shows each provider with status (connected / Not connected).

### 13.5 Hotels result card
Horizontal on md+ (image 4:3 left 240px, content right), stacked on mobile.
- Name (`text-md 600`, 2-line clamp), star class (icons, decorative + "4-star hotel" sr text; star class is not a guest rating), area / distance, key amenities (max 4 small icons+labels).
- RatingDisplay **only** if a provider supplied a real guest rating (show source).
- Right/bottom: `PriceTag from suffix="/night"` + total stay ("$612 total, 4 nights, est. taxes"), cheapest provider name, DemoDataBadge if demo, **View deal** (primary). "Compare N providers" link expands rates.

### 13.6 Login / Sign up
Split layout on lg+: **form panel** (left, 5/12, `surface`, vertically centered, max-w 400) + **brand panel** (right, 7/12, `primary` background, `primary-fg` text). Mobile: form only, brand panel collapses to a 3-line value-prop list above the form.
- Form: Logo, h1 ("Log in" / "Create your account"), Google and Apple buttons (`secondary`, full width; show "Not available yet" disabled state when OAuth is `pending_configuration`), divider "or", email, password (show/hide IconButton, strength hint on sign-up), primary submit (full width, `loading`), links: Forgot password, switch Log in/Sign up. Terms + Privacy consent sentence on sign-up. Errors inline (`FieldMessage`) and a form-level `role="alert"` message.
- Brand panel: three real value props, each with a line icon — "Compare prices across stores, including shipping and estimated tax", "Price history and alerts so you buy at the right time", "Flights and hotels from multiple providers in one search". Optional: a static, clearly illustrative price-history sparkline graphic (no numbers claiming real users). **No fake stats, testimonials, user counts or logos of partners we do not have.**
- Browse-without-account link: "Continue without an account".

---

## 14. Using the packages

### Web (Next.js, Tailwind v4)
```css
/* apps/web/app/globals.css */
@import "tailwindcss";
@import "@pricora/design-tokens/tailwind.css";   /* tokens (CSS vars) + @theme + dark variant + base */
@source "../../../packages/ui/dist";              /* let Tailwind see classes used inside @pricora/ui */
```
- `@source` paths are relative to the CSS file. From `apps/web/app/globals.css` the monorepo path above works with any pnpm linker. Equivalent alternative: `@source "../node_modules/@pricora/ui/dist";` (adjust depth to where `node_modules/@pricora/ui` resolves).
- Scan **`dist`** (built output, what the app imports), not `src`.
- Fonts: `import { Plus_Jakarta_Sans } from "next/font/google"; import { GeistMono } from "geist/font/mono";` → `const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-plus-jakarta-sans" })`, and put `${plusJakartaSans.variable} ${GeistMono.variable}` on `<html>`.
- Components: `import { Button, ProductTile, PriceTag } from "@pricora/ui";` — the entry is a single `"use client"` module (works from Server Components as client islands; you cannot pass functions such as `onClick` from a Server Component). Server-only code that needs `cn`/`formatPrice` imports `@pricora/ui/utils` (no directive).
- Mount once: `<TooltipProvider>` and `<Toaster />` in the root layout.
- `@pricora/ui` must be built first (`turbo` handles `^build`). No `transpilePackages` needed.

### CSS variables only (non-Tailwind)
`@import "@pricora/design-tokens/tokens.css";` → `var(--pc-color-primary)`, `var(--pc-radius-md)`, `var(--pc-duration-fast)` …

### React Native
`import { tokens } from "@pricora/design-tokens";` — see §11.
