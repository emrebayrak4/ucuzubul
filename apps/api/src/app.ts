import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { AppModule } from "./app.module";
import { loadEnv } from "./common/env";
import { buildOpenApi } from "./openapi";
import { defaultStorageDir } from "./core/storage";
import express from "express";

/** Builds the configured Nest app (used by main.ts and integration tests). */
export async function createApp(options: { logger?: boolean } = {}): Promise<INestApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: options.logger === false ? false : ["log", "warn", "error"],
    bodyParser: true,
  });
  // X-Forwarded-For is ignored unless TRUST_PROXY names the proxy hops/addresses (SEC-M1).
  app.set("trust proxy", parseTrustProxy(env.TRUST_PROXY));
  app.disable("x-powered-by");
  app.use(cookieParser());

  // Public object storage (logos). Long-lived immutable caching (content-hashed names), strict types, no scripts.
  const STATIC_TYPES: Record<string, string> = { ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
  app.use(
    "/static/logos",
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ext = req.path.slice(req.path.lastIndexOf(".")).toLowerCase();
      if (!STATIC_TYPES[ext]) {
        res.status(404).end();
        return;
      }
      next();
    },
    express.static(`${env.STORAGE_DIR ?? defaultStorageDir()}/logos`, {
      index: false,
      dotfiles: "deny",
      fallthrough: false,
      immutable: true,
      maxAge: "365d",
      setHeaders: (res, filePath) => {
        const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
        const type = STATIC_TYPES[ext];
        if (type) res.setHeader("Content-Type", type);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );

  if (env.NODE_ENV !== "production") {
    const openapi = buildOpenApi(env.API_URL);
    app.use("/openapi.json", (_req: unknown, res: { json: (b: unknown) => void }) => res.json(openapi));
    // Swagger UI needs inline scripts/styles: relax CSP for /docs only. Disabled in production (SEC-L6).
    app.use("/docs", helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: "Pricora API" }));
  }
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));

  const allowed = new Set([env.WEB_ORIGIN, env.ADMIN_ORIGIN]);
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, !origin || allowed.has(origin)),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-csrf-token", "accept", "authorization", "x-pricora-client"],
    maxAge: 600,
  });
  app.useBodyParser("json", { limit: "1mb" });
  app.setGlobalPrefix("v1");
  app.enableShutdownHooks();
  return app;
}

/** "" → false (trust nothing); digits → hop count; otherwise a comma-separated list of names/IPs/CIDRs. "true" is rejected. */
export function parseTrustProxy(v: string | undefined): boolean | number | string[] {
  if (!v || v.trim() === "" || v.trim() === "false") return false;
  if (/^d+$/.test(v.trim())) return Number(v.trim());
  if (v.trim() === "true") throw new Error("TRUST_PROXY=true would trust any client-supplied X-Forwarded-For; list proxy addresses instead");
  return v.split(",").map((x) => x.trim()).filter(Boolean);
}
