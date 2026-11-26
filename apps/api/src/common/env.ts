import { existsSync } from "node:fs";
import path from "node:path";
import { parseServerEnv, type ServerEnv } from "@pricora/config/env";

let cached: ServerEnv | undefined;

/** Loads the monorepo root .env (if present; real env vars win) and validates it once. */
export function loadEnv(): ServerEnv {
  if (cached) return cached;
  for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
  }
  cached = parseServerEnv(process.env);
  return cached;
}

export const isProd = (env: ServerEnv) => env.NODE_ENV === "production";
