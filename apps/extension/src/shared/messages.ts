import type { ExtensionSettings } from "./settings";
import type { ExtensionCoupon, ExtensionRetailer, ProductOffer, RetailerCheckoutConfig, SessionUser } from "./types";

/** Messages handled by the background service worker. Content scripts never talk to the API directly. */
export type ExtensionMessage =
  | { type: "popup:state"; url: string | null }
  | { type: "popup:follow"; retailerSlug: string }
  | { type: "product:lookup"; url: string }
  | { type: "checkout:match"; url: string }
  | { type: "coupon:result"; couponId: string; worked: boolean; orderTotalCents?: number; savingsCents?: number }
  | { type: "settings:get" }
  | { type: "settings:set"; patch: Partial<ExtensionSettings> }
  | { type: "cache:clear" };

export interface StoreInfo {
  slug: string;
  name: string;
  /** API retailer; null when the API did not return one. */
  retailer: ExtensionRetailer | null;
}

export type PopupState =
  | { kind: "unsupported"; settings: ExtensionSettings }
  | {
      kind: "store";
      settings: ExtensionSettings;
      store: StoreInfo;
      coupons: ExtensionCoupon[];
      /** null = coupons could not be loaded (API down) — distinct from an empty list. */
      couponsError: string | null;
      user: SessionUser | null;
      checkoutSupported: boolean;
    };

export type ProductLookupResult =
  | { kind: "none" }
  | {
      kind: "cheaper";
      productTitle: string | null;
      productSlug: string | null;
      current: ProductOffer | null;
      cheapest: ProductOffer;
      /** Any offer of this product is demo data → banner shows "Demo data". */
      hasDemoData: boolean;
      /** Absolute API go-URL for the cheapest offer. */
      goUrl: string;
    };

export type CheckoutMatch =
  | { kind: "none" }
  | {
      kind: "available";
      storeName: string;
      config: RetailerCheckoutConfig;
      /** Ordered best-first and already capped. */
      coupons: Pick<ExtensionCoupon, "id" | "code" | "title">[];
    };

export interface OkResult {
  ok: boolean;
  error?: string;
}

export interface MessageResponses {
  "popup:state": PopupState;
  "popup:follow": OkResult;
  "product:lookup": ProductLookupResult;
  "checkout:match": CheckoutMatch;
  "coupon:result": OkResult;
  "settings:get": ExtensionSettings;
  "settings:set": ExtensionSettings;
  "cache:clear": OkResult;
}

export async function sendMessage<M extends ExtensionMessage>(message: M): Promise<MessageResponses[M["type"]]> {
  return (await chrome.runtime.sendMessage(message)) as MessageResponses[M["type"]];
}
