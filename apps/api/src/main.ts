import { Logger } from "@nestjs/common";
import { createApp } from "./app";
import { loadEnv } from "./common/env";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.API_PORT, "0.0.0.0");
  new Logger("Bootstrap").log(`Pricora API on http://localhost:${env.API_PORT}/v1 (docs: /docs)`);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
