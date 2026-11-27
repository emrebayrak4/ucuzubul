/**
 * Infrastructure providers (Prisma, Redis, Meilisearch, BullMQ queues, env) as injection tokens.
 * Constructor injection always uses explicit @Inject(token) — the API runs under tsx/esbuild, which does not
 * emit decorator metadata.
 */
import { Logger, type Provider } from "@nestjs/common";
import type { ServerEnv } from "@pricora/config/env";
import { getPrisma, type PrismaClient } from "@pricora/database";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { Meilisearch } from "meilisearch";
import { PRICE_EVENTS_QUEUE, PRICE_REFRESH_QUEUE, SEARCH_INDEX_QUEUE } from "../core/alerts";
import { MERCHANT_FEEDS_QUEUE } from "../core/feeds";
import { NETWORK_INGEST_QUEUE } from "../core/integrations-ingest";
import { CATALOG_SOURCES_QUEUE } from "../core/catalog-sources";
import { parseKey } from "../core/crypto";
import { IntegrationConfig } from "../core/integration-config";
import { defaultStorageDir, LocalDiskStorage, type ObjectStorage } from "../core/storage";
import { loadEnv } from "./env";

export const ENV = Symbol("ENV");
export const PRISMA = Symbol("PRISMA");
export const REDIS = Symbol("REDIS");
export const MEILI = Symbol("MEILI");
export const QUEUES = Symbol("QUEUES");
export const INTEGRATIONS = Symbol("INTEGRATIONS");
export const STORAGE = Symbol("STORAGE");

export interface Queues {
  priceEvents: Queue;
  searchIndex: Queue;
  priceRefresh: Queue;
  merchantFeeds: Queue;
  networkIngest: Queue;
  catalogSources: Queue;
}

export type { PrismaClient };

const log = new Logger("Infra");

export const infraProviders: Provider[] = [
  { provide: ENV, useFactory: (): ServerEnv => loadEnv() },
  { provide: PRISMA, useFactory: (): PrismaClient => getPrisma() },
  {
    provide: REDIS,
    inject: [ENV],
    useFactory: (env: ServerEnv): Redis => {
      const redis = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2, enableOfflineQueue: true });
      redis.on("error", (e: Error) => log.warn(`Redis: ${e.message}`));
      return redis;
    },
  },
  {
    provide: MEILI,
    inject: [ENV],
    useFactory: (env: ServerEnv): Meilisearch =>
      new Meilisearch({ host: env.MEILI_HOST, ...(env.MEILI_MASTER_KEY ? { apiKey: env.MEILI_MASTER_KEY } : {}), timeout: 3000 }),
  },
  {
    provide: STORAGE,
    inject: [ENV],
    useFactory: (env: ServerEnv): ObjectStorage => new LocalDiskStorage(env.STORAGE_DIR ?? defaultStorageDir(), `${env.API_URL.replace(/\/+$/, "")}/static`),
  },
  {
    provide: INTEGRATIONS,
    inject: [ENV, PRISMA],
    useFactory: (env: ServerEnv, prisma: PrismaClient): IntegrationConfig => {
      const cfg = new IntegrationConfig(prisma, parseKey(env.CREDENTIALS_ENCRYPTION_KEY));
      cfg.subscribe(env.REDIS_URL);
      return cfg;
    },
  },
  {
    provide: QUEUES,
    inject: [ENV],
    useFactory: (env: ServerEnv): Queues => {
      const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };
      const priceEvents = new Queue(PRICE_EVENTS_QUEUE, { connection });
      const searchIndex = new Queue(SEARCH_INDEX_QUEUE, { connection });
      const priceRefresh = new Queue(PRICE_REFRESH_QUEUE, { connection });
      const merchantFeeds = new Queue(MERCHANT_FEEDS_QUEUE, { connection });
      const networkIngest = new Queue(NETWORK_INGEST_QUEUE, { connection });
      const catalogSources = new Queue(CATALOG_SOURCES_QUEUE, { connection });
      for (const q of [priceEvents, searchIndex, priceRefresh, merchantFeeds, networkIngest, catalogSources]) q.on("error", (e: Error) => log.warn(`Queue ${q.name}: ${e.message}`));
      return { priceEvents, searchIndex, priceRefresh, merchantFeeds, networkIngest, catalogSources };
    },
  },
];
