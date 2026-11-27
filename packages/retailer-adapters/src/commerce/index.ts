/** Merchant store-platform connectors: factory + provider metadata. */
import type { CommerceConnectorOptions } from "./base";
import { CloverConnector } from "./clover";
import { GoogleMerchantFeedConnector, type GoogleMerchantFeedOptions } from "./googleMerchantFeed";
import { ShopifyConnector } from "./shopify";
import { SquareConnector } from "./square";
import type { CommerceConfig, CommerceConnector, CommerceProvider } from "./types";
import { WooCommerceConnector, type WooCommerceConnectorOptions } from "./woocommerce";

export interface CommerceProviderMetadata {
  id: CommerceProvider;
  name: string;
  /** Config fields that must be non-empty for sync(). */
  requiredConfig: readonly string[];
  /** Optional config fields understood by the connector. */
  optionalConfig: readonly string[];
  docsUrl: string;
  supportsLocations: boolean;
}

export const COMMERCE_PROVIDERS: readonly CommerceProviderMetadata[] = [
  {
    id: "shopify",
    name: "Shopify",
    requiredConfig: ["shopDomain", "accessToken"],
    optionalConfig: ["apiKey", "apiSecret", "currency", "defaultCondition"],
    docsUrl: "https://shopify.dev/docs/api/admin-graphql/2025-10",
    supportsLocations: true,
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    requiredConfig: ["storeUrl", "consumerKey", "consumerSecret"],
    optionalConfig: ["defaultCondition"],
    docsUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs/",
    supportsLocations: false,
  },
  {
    id: "square",
    name: "Square",
    requiredConfig: ["accessToken"],
    optionalConfig: ["environment", "squareVersion", "defaultCondition"],
    docsUrl: "https://developer.squareup.com/reference/square/catalog-api/list-catalog",
    supportsLocations: true,
  },
  {
    id: "clover",
    name: "Clover",
    requiredConfig: ["merchantId", "accessToken"],
    optionalConfig: ["region", "defaultCondition"],
    docsUrl: "https://docs.clover.com/dev/reference/inventorygetitems",
    supportsLocations: true,
  },
  {
    id: "google_merchant",
    name: "Google Merchant Center feed",
    requiredConfig: ["feedUrl"],
    optionalConfig: [],
    docsUrl: "https://support.google.com/merchants/answer/7052112",
    supportsLocations: false,
  },
];

export type CommerceFactoryOptions = CommerceConnectorOptions & WooCommerceConnectorOptions & GoogleMerchantFeedOptions;

export function isCommerceProvider(value: string): value is CommerceProvider {
  return COMMERCE_PROVIDERS.some((p) => p.id === value);
}

/** Create a connector for one merchant. Config holds that merchant's (decrypted) credentials. */
export function createCommerceConnector(provider: CommerceProvider, config: CommerceConfig, options: CommerceFactoryOptions = {}): CommerceConnector {
  switch (provider) {
    case "shopify":
      return new ShopifyConnector(config, options);
    case "woocommerce":
      return new WooCommerceConnector(config, options);
    case "square":
      return new SquareConnector(config, options);
    case "clover":
      return new CloverConnector(config, options);
    case "google_merchant":
      return new GoogleMerchantFeedConnector(config, options);
    default: {
      const never: never = provider;
      throw new Error(`Unknown commerce provider: ${String(never)}`);
    }
  }
}

export * from "./types";
export { BaseCommerceConnector, stockFromQuantity, declaredCondition, type CommerceConnectorOptions } from "./base";
export * from "./urlGuard";
export * from "./shopify";
export * from "./woocommerce";
export * from "./square";
export * from "./clover";
export * from "./googleMerchantFeed";
