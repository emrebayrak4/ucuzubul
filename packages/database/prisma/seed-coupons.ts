/** Adds/refreshes demo coupons + empty checkout configs without resetting the catalog: pnpm -C packages/database seed:coupons */
import { existsSync } from "node:fs";
import path from "node:path";
import { createPrismaClient } from "../src/index";
import { seedCoupons } from "./seed/coupons";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}
if (process.env["NODE_ENV"] === "production") {
  console.error("Refusing to seed demo coupons with NODE_ENV=production.");
  process.exit(1);
}
const prisma = createPrismaClient();
seedCoupons(prisma)
  .then((r) => console.log(`demo coupons: ${r.coupons}, checkout configs (disabled, empty): ${r.checkoutConfigs}`))
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
