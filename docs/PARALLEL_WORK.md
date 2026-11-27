# Parallel work protocol (3 sessions in ONE shared checkout)

Sessions: **shopping**, **hotels**, **flights**. Orchestrator (ORCH) merges/commits. Nobody commits or pushes except ORCH.

## Running services (shared — do NOT start duplicates, do NOT kill)
API :4400 (`tsx watch`, auto-reloads on file change) · worker · web :3100 (`next dev`) · admin :3001 · Postgres :5434 · Redis :6380 · Meilisearch :7700.
Ports 3000/4000/4010 belong to the user's OTHER projects — never touch.
If the API crashes because of YOUR change, fix your change; if it is down for >2 min and not yours, restart it once with `pnpm -C apps/api dev` in the background and note it in docs/PROGRESS.md.

## Ownership
| Area | shopping | hotels | flights |
|---|---|---|---|
| apps/web | `src/app/(site)/**`, `src/components/{product,search,catalog,home,compare}/**` | `src/app/(travel)/travel/hotels/**`, `src/components/travel/hotels/**` | `src/app/(travel)/travel/flights/**`, `src/components/travel/flights/**` |
| apps/api | `src/controllers/{catalog,search,products,home,deals}*`, `src/core/search*` | `src/controllers/travel-hotels*`, `src/core/hotels/**` | `src/controllers/travel-flights*`, `src/core/flights/**` |
| contracts | `src/catalog.ts`, `src/search.ts`, `src/home.ts` | `src/travel-hotels.ts` (split from travel.ts) | `src/travel-flights.ts` (split from travel.ts) |
| seed | `prisma/seed/catalog-*` | `prisma/seed/hotels-*` | `prisma/seed/flights-*` |

Shared files (anyone may edit, but small surgical edits only, re-read right before editing):
`packages/contracts/src/index.ts`, `endpoints.ts`, `travel.ts`, `apps/api/src/app.module.ts`, `packages/design-tokens/**`, `apps/web/src/app/(travel)/layout.tsx`, header/footer components.

## Prisma lock (schema + migrations)
Only one session may change `schema.prisma` / create a migration at a time:
1. `mkdir .locks/prisma` — if it fails (exists), wait 60s and retry. (`.locks/` is gitignored.)
2. Re-read schema.prisma, make your edit, run `pnpm -C packages/database exec prisma migrate dev --name <session>_<what>` (NEVER `migrate reset`, never accept a reset prompt — if Prisma asks to reset, abort and tell ORCH), then `pnpm -C packages/database build`.
3. `rmdir .locks/prisma`.
Same for `pnpm install`: use `.locks/pnpm`.

## Data honesty (non-negotiable)
Demo data allowed ONLY with `source = "demo"`, visible "Demo data" labels, fictional hotel names prefixed "Demo", and it must never be presented as live. No fake reviews/ratings/review counts, no fake "X people viewing", no fake countdowns. Live providers via Admin → Integrations override demo automatically.

## Finish
Typecheck + lint for the packages you touched (`npx turbo run typecheck lint --filter=<pkg>`), API tests (`pnpm -C apps/api test`), and append a section to docs/PROGRESS.md. Do NOT commit.
