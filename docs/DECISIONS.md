# Decision log (append-only)

- 2026-11-26 — Claude Code "Agent Teams" (TeamCreate) is not available in this environment; orchestration uses background subagents with strict folder ownership (docs/TASKS.md).
- 2026-11-26 — Scope extended by founder: travel vertical (flights + hotels) and full login/signup flows are first-class.
- 2026-11-26 — Placeholder brand "Pricora"; configurable in packages/config/src/brand.ts.
- 2026-11-26 — Prisma 7.10.1 stable (8.x is RC). TypeScript pinned 5.9.3 for NestJS decorator compatibility.
- 2026-11-26 — Meilisearch chosen over Typesense (single binary, simpler ops); Postgres fallback when unavailable.
- 2026-11-26 — Admin panel and merchant portal share one Next.js app (apps/admin) separated by route groups + RBAC.
- 2026-11-26 — Sessions: opaque random token in httpOnly cookie, SHA-256 hash stored in UserSession (revocable), instead of JWT.
- 2026-11-26 — No live retailer/travel credentials yet: demo catalog seeded with `source = "demo"` and labeled in every UI.
- 2026-11-26 — Reference sites (Akakçe, Cimri) used only for information architecture ideas (dense price grid, category rails, "lowest price at N stores" pattern); visual identity is original.
- 2026-11-26 — Amazon PA-API 5 is deprecated; Amazon adapter targets the Creators API (needs 10 qualifying sales / 30 days).
- 2026-11-26 — Amadeus Self-Service shut down 2026-07-17 → Enterprise only. Travelpayouts Hotellook closed 2025-10-20. Primary flight candidate: Duffel; hotels: Hotelbeds (eval key) then Expedia Rapid / Booking Demand (partner contracts).
- 2026-11-26 — Best Buy Products API ToS restricts competitive price analysis for third parties → legal review before enabling.
- 2026-11-26 — pnpm nodeLinker=hoisted (Windows long-path + Expo). Use `pnpm -C <dir>` or turbo; `pnpm --filter` breaks at current long path. Move repo to a short path when agents are idle.
- 2026-11-26 — Demo UPCs use GS1 internal-use "4" prefix (cannot collide with real products); demo hotels are named "Demo …".
- 2026-11-26 — Ports changed: user's other projects occupy 3000 and 4000/4010 → web :3100, API :4400 (admin stays :3001). Never kill other projects' processes.
- 2026-11-26 — Mobile styling: React Native StyleSheet + @pricora/design-tokens instead of NativeWind (NativeWind 4 requires Tailwind v3; repo uses Tailwind 4.3).
- 2026-11-26 — Mobile pins react 19.3.1 (same as web) to keep a single React copy in the hoisted monorepo; excluded from `expo install` checks.
- 2026-11-26 — Native auth: `x-pricora-client: native` → bearer sessionToken in SecureStore (no CSRF); web keeps httpOnly cookie + CSRF.
