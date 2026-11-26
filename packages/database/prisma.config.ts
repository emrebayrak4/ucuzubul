import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Load the monorepo root .env (Prisma 7 no longer auto-loads env files).
for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
