import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

export interface CreatePrismaClientOptions {
  /** Defaults to process.env.DATABASE_URL. */
  connectionString?: string;
  /** Log queries (dev debugging). */
  logQueries?: boolean;
  /** pg pool max connections. Default 10. */
  maxConnections?: number;
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const connectionString = options.connectionString ?? process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot create Prisma client");
  }
  const adapter = new PrismaPg({ connectionString, max: options.maxConnections ?? 10 });
  return new PrismaClient({
    adapter,
    log: options.logQueries ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

const globalForPrisma = globalThis as unknown as { __pricoraPrisma?: PrismaClient };

/** Typed singleton (survives hot reload in dev). Created lazily on first use. */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__pricoraPrisma) {
    globalForPrisma.__pricoraPrisma = createPrismaClient();
  }
  return globalForPrisma.__pricoraPrisma;
}

/**
 * Lazy singleton proxy: importing this module never opens a connection or requires DATABASE_URL;
 * the client is created on first property access.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value: unknown = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.__pricoraPrisma) {
    await globalForPrisma.__pricoraPrisma.$disconnect();
    globalForPrisma.__pricoraPrisma = undefined;
  }
}
export { BRAND_SITES } from "./brand-sites";
