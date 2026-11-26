# CLAUDE.md — Pricora monorepo

US price comparison + travel (flights, hotels) platform by Afterwish Inc.
Brand name "Pricora" is a placeholder: change it ONLY in `packages/config/src/brand.ts`.

## Read first (in this order)
1. `docs/ARCHITECTURE.md` — stack, ports, module boundaries, API surface (source of truth)
2. `docs/TASKS.md` — who owns which folder; never edit a folder you don't own
3. `docs/PROGRESS.md` — what is done / verified / pending
4. `docs/DECISIONS.md` — append-only decision log

## Commands
- `pnpm install` — install
- `docker compose up -d` — Postgres (5434), Redis (6380), Meilisearch (7700)
- `pnpm db:migrate` / `pnpm db:seed` — Prisma migrate + demo seed
- `pnpm dev` — all apps via Turborepo (web 3100, admin 3001, api 4400)
- `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build`

## Hard rules
- TypeScript strict. No `any` escapes, no `@ts-ignore` to hide errors.
- Money = integer minor units (`priceCents: Int`), never floats. Currency field always present (default `USD`).
- Never present demo/seed data as live. Every offer/fare/rate carries `source`; `source = "demo"` must render a visible "Demo data" label.
- No fake reviews, ratings, user counts, trust badges. No fake API responses in adapters: missing credentials => adapter reports `status: "pending_configuration"`.
- No scraping that bypasses CAPTCHA/auth/ToS.
- Secrets only via env; `.env.example` has keys with empty values.
- Shared types live in `packages/contracts` (Zod). API and clients both import from there.
- Sponsored content must be labeled and must never alter organic ranking or Deal Score.
