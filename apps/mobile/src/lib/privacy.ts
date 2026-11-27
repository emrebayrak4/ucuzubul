import { createLocalStore, useLocalStore } from "./store";

/**
 * Device privacy choices (CCPA/CPRA "Do Not Sell or Share", analytics opt-out).
 * - `doNotSellShare`: sent to the API as `Sec-GPC: 1` on every request (the Global Privacy Control signal the
 *   web honours), so the server treats this device as opted out. Stays on the device; no account needed.
 * - `analytics`: when false, product analytics events are dropped on the device.
 */
export interface PrivacyChoices {
  doNotSellShare: boolean;
  analytics: boolean;
}

const DEFAULTS: PrivacyChoices = { doNotSellShare: false, analytics: true };

export const privacyStore = createLocalStore<PrivacyChoices>("pricora.privacy.v1", DEFAULTS, (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    doNotSellShare: o.doNotSellShare === true,
    analytics: o.analytics !== false,
  };
});

export function usePrivacy(): PrivacyChoices {
  return useLocalStore(privacyStore);
}

export function setPrivacy(patch: Partial<PrivacyChoices>): void {
  privacyStore.set((prev) => ({ ...prev, ...patch }));
}
