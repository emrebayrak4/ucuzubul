import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { computeOfferTotal, optimizeBasket, type BasketScenario as AlgoScenario, type RetailerPolicy } from "@pricora/algorithms";
import type { AssistantResponse, BasketOptimizeResponse, BasketScenario, ScanResponse } from "@pricora/contracts";
import { Auth, type AuthedRequest } from "../common/auth";
import { ApiException } from "../common/errors";
import { INTEGRATIONS, PRISMA, type PrismaClient } from "../common/infra";
import type { IntegrationConfig } from "../core/integration-config";
import { input } from "../common/validate";
import { CatalogService, offerInclude } from "../services/catalog.service";
import { gtinVariants } from "../services/search.service";
import { ProductService } from "../services/product.service";

const KIND_LABEL: Record<BasketScenario["kind"], string> = {
  single_store: "Everything from one store",
  multi_store_cheapest: "Cheapest overall (any number of stores)",
  min_stores: "Best price with fewer stores",
};

@Controller()
export class MiscController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(ProductService) private readonly products: ProductService,
    @Inject(INTEGRATIONS) private readonly integrations: IntegrationConfig,
  ) {}

  @Get("scan/:code")
  @Auth("optional")
  async scan(@Param() params: unknown, @Req() req: AuthedRequest): Promise<ScanResponse> {
    const { code } = input("scan.lookup", "params", params);
    const codeType = code.length === 12 ? "UPC" : code.length === 13 ? "EAN" : code.length === 14 ? "GTIN" : null;
    const ident = await this.prisma.productIdentifier.findFirst({
      where: { type: { in: ["UPC", "EAN", "GTIN"] }, value: { in: gtinVariants(code) }, product: { status: "active", condition: "new" } },
      include: { product: { select: { slug: true, id: true } } },
    });
    if (!ident) {
      return { status: "not_found", code, codeType, message: "We couldn't find this barcode in our catalog yet." };
    }
    const detail = await this.products.detail(ident.product.slug, null, req.user);
    const [card] = await this.catalog.cards([ident.product.id]);
    if (!card) return { status: "not_found", code, codeType, message: "We couldn't find this barcode in our catalog yet." };
    return { status: "found", code, codeType: codeType ?? "GTIN", product: detail.product, card, offers: detail.offers };
  }

  @Post("basket/optimize")
  @HttpCode(200)
  @Auth("optional")
  async basket(@Body() body: unknown, @Req() req: AuthedRequest): Promise<BasketOptimizeResponse> {
    const b = input("basket.optimize", "body", body);
    const productIds = [...new Set(b.items.map((i) => i.productId))];
    const pref = req.user ? await this.prisma.userPreference.findUnique({ where: { userId: req.user.id } }) : null;
    const zip = b.zip ?? pref?.zip ?? null;
    const memberships = b.memberships ?? pref?.memberships ?? [];

    const offers = await this.prisma.offer.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        stock: { not: "out_of_stock" },
        ...(b.allowConditions ? { product: { condition: { in: b.allowConditions } } } : {}),
      },
      include: { ...offerInclude, retailer: true, product: { select: { slug: true, title: true } } },
    });
    const policies = new Map<string, RetailerPolicy>();
    for (const o of offers) {
      const known = offers.filter((x) => x.retailerId === o.retailerId && x.shippingCents !== null).map((x) => x.shippingCents ?? 0);
      policies.set(o.retailerId, {
        retailerId: o.retailerId,
        shippingCents: known.length ? Math.max(...known) : null,
        freeShippingThresholdCents: o.retailer.freeShippingThresholdCents,
        freeShippingMemberships: o.retailer.membershipKey ? [o.retailer.membershipKey] : [],
        pickupAvailable: offers.some((x) => x.retailerId === o.retailerId && x.pickupAvailable),
      });
    }
    const result = optimizeBasket(
      b.items.map((i) => ({ itemId: i.productId, quantity: i.qty })),
      offers.map((o) => ({ itemId: o.productId, retailerId: o.retailerId, priceCents: o.priceCents, inStock: true, pickupAvailable: o.pickupAvailable })),
      [...policies.values()],
      { memberships, allowPickup: b.preferPickup ?? false, ...(b.maxStores ? { maxStores: b.maxStores } : {}) },
    );

    const toScenario = (kind: BasketScenario["kind"], s: AlgoScenario): Omit<BasketScenario, "savingsCents"> => {
      const stores = s.stores.map((st) => {
        const retailer = offers.find((o) => o.retailerId === st.retailerId)?.retailer;
        const tax = zip ? computeOfferTotal({ priceCents: st.subtotalCents, quantity: 1, shippingCents: st.shippingCents, zip }).taxCents : null;
        const threshold = retailer?.freeShippingThresholdCents ?? null;
        return {
          retailer: { slug: retailer?.slug ?? "unknown", name: retailer?.name ?? "Unknown" },
          lines: st.lines.flatMap((l) => {
            const o =
              offers.find((x) => x.productId === l.itemId && x.retailerId === st.retailerId && x.priceCents === l.unitPriceCents) ??
              offers.find((x) => x.productId === l.itemId && x.retailerId === st.retailerId);
            if (!o) return [];
            return [{ productId: o.productId, productSlug: o.product.slug, title: o.product.title, qty: l.quantity, offerId: o.id, unitPriceCents: l.unitPriceCents, lineTotalCents: l.lineTotalCents, condition: o.condition, source: o.source }];
          }),
          subtotalCents: st.subtotalCents,
          shippingCents: st.shippingCents,
          estimatedTaxCents: tax,
          totalCents: st.totalCents + (tax ?? 0),
          freeShippingApplied: st.freeShippingReason !== null,
          freeShippingGapCents: threshold !== null && st.subtotalCents < threshold && threshold - st.subtotalCents <= 2500 ? threshold - st.subtotalCents : null,
        };
      });
      const taxes = stores.map((x) => x.estimatedTaxCents);
      const estimatedTaxCents = zip && taxes.every((t) => t !== null) ? taxes.reduce<number>((n, t) => n + (t ?? 0), 0) : null;
      return {
        kind,
        label: KIND_LABEL[kind],
        stores,
        storeCount: s.storeCount,
        subtotalCents: s.itemsCents,
        shippingCents: s.shippingCents,
        estimatedTaxCents,
        totalCents: s.totalCents + (estimatedTaxCents ?? 0),
        unavailableProductIds: result.unfulfilledItemIds,
        assumptions: [...result.assumptions, zip ? `Sales tax estimated for ZIP ${zip} (state base rate).` : "Sales tax not included — set a ZIP for an estimate."],
        method: s.method,
      };
    };
    const raw: Omit<BasketScenario, "savingsCents">[] = [];
    if (result.cheapestSingleStore) raw.push(toScenario("single_store", result.cheapestSingleStore));
    if (result.cheapestOverall) raw.push(toScenario("multi_store_cheapest", result.cheapestOverall));
    if (result.bestWithinMaxStores) raw.push(toScenario("min_stores", result.bestWithinMaxStores));
    const max = raw.reduce((m, s) => Math.max(m, s.totalCents), 0);
    const scenarios: BasketScenario[] = raw.map((s) => ({ ...s, savingsCents: max - s.totalCents }));
    const best = [...scenarios].sort((a, z) => a.totalCents - z.totalCents || a.storeCount - z.storeCount)[0];
    return {
      scenarios,
      recommended: best?.kind ?? null,
      hasDemoData: offers.some((o) => o.source === "demo"),
      computedAt: new Date().toISOString(),
    };
  }

  @Post("assistant")
  @HttpCode(200)
  @Auth("optional")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async assistant(@Body() body: unknown): Promise<AssistantResponse> {
    input("assistant.ask", "body", body);
    if (!(await this.integrations.get("ANTHROPIC_API_KEY"))) {
      throw new ApiException(503, "pending_configuration", "The shopping assistant is not configured", {
        status: "pending_configuration",
        reason: "ANTHROPIC_API_KEY is not set",
      });
    }
    const flag = await this.prisma.featureFlag.findUnique({ where: { key: "assistant.enabled" } });
    throw new ApiException(503, "service_unavailable", "The shopping assistant is currently disabled", {
      status: "disabled",
      reason: flag?.enabled ? "Provider adapter not implemented yet" : "Feature flag assistant.enabled is off",
    });
  }
}
