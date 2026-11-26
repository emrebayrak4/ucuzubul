# Deployment & local operations

## Ports (this machine)
| Service | Port | Notes |
|---|---|---|
| API (`apps/api`) | **4400** | `API_PORT`; 4000/4010 belong to other projects on this machine |
| Web (`apps/web`) | 3100 | `WEB_ORIGIN` (CORS) |
| Admin (`apps/admin`) | 3001 | `ADMIN_ORIGIN` (CORS) |
| Postgres | 5434 | docker `pricora-postgres` |
| Redis | 6380 | docker `pricora-redis` |
| Meilisearch | 7700 | docker `pricora-meilisearch` |

## Local run
```bash
docker compose up -d                 # postgres, redis, meilisearch (healthchecks)
pnpm install
pnpm db:migrate && pnpm db:seed      # schema + demo data (seed resets catalog tables)
pnpm exec turbo run build --filter=@pricora/api...   # builds shared packages the API depends on
pnpm -C apps/api dev                 # tsx watch → http://localhost:4400/v1, docs at /docs
pnpm -C apps/worker dev              # BullMQ worker (price refresh, alerts, search index)
```
Do not use `pnpm --filter …` from the repo root on this machine (pnpm 12 long-path bug); use `pnpm -C <dir>` or turbo.

Production-style: `pnpm -C apps/api build && pnpm -C apps/api start` (`node dist/main.js`), same for the worker.

## Tests
`pnpm -C apps/api test` — vitest + supertest integration tests against the docker DB/Redis/Meilisearch (run `pnpm db:seed` first).

## Search index
The API rebuilds the Meilisearch `products` index on boot and when it detects stale hits; the worker reindexes every 6 h and after
live price changes. If Meilisearch is down, search uses the Postgres trigram fallback and responses carry `degraded: true`.

## Worker schedules
- `price-refresh` every 30 min — adapters whose credentials are missing are skipped (logged in `data_ingestion_jobs.stats`).
- `search-index` every 6 h (+ once at startup).
- `price-events` consumed continuously (enqueued by merchant uploads/edits and live refreshes) → `notifications`.

## Production checklist (TODO before launch)
- Managed Postgres 17 + PgBouncer; apply `PriceHistory` partitioning (docs/DATABASE_SCHEMA.md) before ingestion volume grows.
- Managed Redis with persistence; Meilisearch with a non-default master key and a search-only key for the API.
- `NODE_ENV=production` (Secure cookies), strong `SESSION_SECRET`, real `WEB_ORIGIN`/`ADMIN_ORIGIN`, TLS-terminating proxy (trust proxy = 1).
- Run `prisma migrate deploy` in CI; never run the demo seed in production (it refuses when `NODE_ENV=production`).
- Sentry (`SENTRY_DSN`) wiring is not implemented yet.
