import Constants from "expo-constants";
import { consoleSink, createAnalytics, type EventMap, type EventName } from "@pricora/analytics";
import { privacyStore } from "./privacy";

/** Provider-agnostic analytics: console sink in dev, no-op otherwise until a provider sink is configured. */
export const analytics = createAnalytics({
  context: { app: "mobile", appVersion: Constants.expoConfig?.version },
  sinks: __DEV__ ? [consoleSink("[analytics]")] : undefined,
});

/** Dropped on the device when the user turned analytics off in Privacy choices. */
export function track<N extends EventName>(name: N, properties: EventMap[N]): void {
  if (!privacyStore.get().analytics) return;
  analytics.track(name, properties);
}
