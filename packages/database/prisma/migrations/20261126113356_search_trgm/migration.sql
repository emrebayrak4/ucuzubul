-- Enable trigram similarity for the Postgres search fallback (used when Meilisearch is unreachable).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "products_title_trgm_idx" ON "products" USING GIN ("title" gin_trgm_ops);
