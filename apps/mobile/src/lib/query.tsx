import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, focusManager, onlineManager, useIsRestoring } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { ApiError } from "./api";

/** Query key roots that may be persisted to disk for offline viewing (no account data). */
const PERSISTED_ROOTS = new Set(["home", "product", "history", "hotel"]);
const DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 7 * DAY,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return count < 2;
      },
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "online" },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "pricora.query-cache.v1", throttleTime: 2000 });

// React Native has no window focus/online events: wire TanStack Query to AppState + NetInfo.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false)),
);

function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === "active");
}

export function QueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, []);
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * DAY,
        buster: "1",
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === "success" && typeof q.queryKey[0] === "string" && PERSISTED_ROOTS.has(q.queryKey[0]),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export { useIsRestoring };

export function useIsOnline(): boolean {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  return online;
}

/** Wipes account-scoped queries (on logout / account deletion). */
export function clearUserQueries(): void {
  queryClient.removeQueries({ queryKey: ["me"] });
  queryClient.removeQueries({ queryKey: ["auth"] });
}
