import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { disconnectPrisma } from "@pricora/database";
import { Redis } from "ioredis";
import { AuthGuard, SessionService } from "./common/auth";
import { loadEnv } from "./common/env";
import { ApiExceptionFilter } from "./common/errors";
import { LoginLockoutService } from "./common/lockout";
import { infraProviders, INTEGRATIONS, QUEUES, REDIS, type Queues } from "./common/infra";
import type { IntegrationConfig } from "./core/integration-config";
import { AppThrottlerGuard, RedisThrottlerStorage } from "./common/throttle";
import { AdminController } from "./controllers/admin.controller";
import { AuthController } from "./controllers/auth.controller";
import { CatalogController } from "./controllers/catalog.controller";
import { GoController } from "./controllers/go.controller";
import { HealthController } from "./controllers/health.controller";
import { IntegrationsController } from "./controllers/integrations.controller";
import { AffiliateProgramsController } from "./controllers/integrations-affiliate.controller";
import { LogosController } from "./controllers/logos.controller";
import { CouponsController } from "./controllers/coupons.controller";
import { GuidesController } from "./controllers/guides.controller";
import { MeController } from "./controllers/me.controller";
import { MerchantController } from "./controllers/merchant.controller";
import { MiscController } from "./controllers/misc.controller";
import { PrivacyController } from "./controllers/privacy.controller";
import { AdminLocalController, LocalController, MerchantLocalController } from "./controllers/local.controller";
import { MerchantConnectionsController } from "./controllers/merchant-connections.controller";
import { CoverageController } from "./controllers/coverage.controller";
import { LocalService } from "./services/local.service";
import { SearchController } from "./controllers/search.controller";
import { TravelController } from "./controllers/travel.controller";
import { TravelHotelsController } from "./controllers/travel-hotels.controller";
import { TravelFlightsController } from "./controllers/travel-flights.controller";
import { CatalogService, MetricsService } from "./services/catalog.service";
import { ProductService } from "./services/product.service";
import { SearchService } from "./services/search.service";

const env = loadEnv();
const throttleRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true });
throttleRedis.on("error", () => undefined);
void throttleRedis.connect().catch(() => undefined);

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60_000, limit: env.NODE_ENV === "test" ? 10_000 : env.RATE_LIMIT_PER_MIN }],
      storage: new RedisThrottlerStorage(throttleRedis),
      skipIf: () => env.NODE_ENV === "test",
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    CatalogController,
    SearchController,
    GoController,
    TravelController,
    TravelHotelsController,
    TravelFlightsController,
    MiscController,
    MeController,
    AdminController,
    MerchantController,
    IntegrationsController,
    AffiliateProgramsController,
    LogosController,
    CouponsController,
    GuidesController,
    PrivacyController,
    LocalController,
    MerchantLocalController,
    MerchantConnectionsController,
    AdminLocalController,
    CoverageController,
  ],
  providers: [
    ...infraProviders,
    SessionService,
    LoginLockoutService,
    MetricsService,
    CatalogService,
    ProductService,
    SearchService,
    LocalService,
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(QUEUES) private readonly queues: Queues,
    @Inject(INTEGRATIONS) private readonly integrations: IntegrationConfig,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.queues.priceEvents.close(), this.queues.searchIndex.close(), this.queues.priceRefresh.close(), this.queues.merchantFeeds.close(), this.queues.networkIngest.close(), this.queues.catalogSources.close()]);
    await this.integrations.close();
    this.redis.disconnect();
    throttleRedis.disconnect();
    await disconnectPrisma();
  }
}
