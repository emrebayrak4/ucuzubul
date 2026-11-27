import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert } from "react-native";
import type { AlertChannel, AlertType } from "@pricora/contracts";
import { track } from "./analytics";
import { api, errorMessage } from "./api";
import { useAuth } from "./auth";
import { haptic } from "./format";

export const FAVORITES_KEY = ["me", "favorites"] as const;
export const ALERTS_KEY = ["me", "alerts"] as const;
export const LISTS_KEY = ["me", "lists"] as const;

export function requireLogin(message = "Log in to save products and get price alerts."): void {
  Alert.alert("Log in required", message, [
    { text: "Not now", style: "cancel" },
    { text: "Log in", onPress: () => router.push("/login") },
  ]);
}

export function useFavorites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: ({ signal }) => api.me.favorites.list({ pageSize: 60 }, { signal }),
    enabled: !!user,
  });
}

export function useAlerts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ALERTS_KEY,
    queryFn: ({ signal }) => api.me.alerts.list({ pageSize: 60 }, { signal }),
    enabled: !!user,
  });
}

export function useLists() {
  const { user } = useAuth();
  return useQuery({ queryKey: LISTS_KEY, queryFn: ({ signal }) => api.me.lists.list({ signal }), enabled: !!user });
}

/** Favorite toggle for a product id; light haptic on change (DESIGN_SYSTEM §11). */
export function useFavoriteToggle(productId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const favorites = useFavorites();
  const favorite = favorites.data?.items.find((f) => f.product.id === productId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!productId) return;
      if (favorite) await api.me.favorites.remove(favorite.id);
      else await api.me.favorites.add(productId);
    },
    onMutate: () => haptic.toggle(),
    onSuccess: () => {
      if (productId) track(favorite ? "favorite_removed" : "favorite_added", { productId });
    },
    onError: (e) => Alert.alert("Couldn't update favorites", errorMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: FAVORITES_KEY }),
  });

  return {
    isFavorite: !!favorite,
    pending: mutation.isPending,
    toggle: () => {
      if (!user) return requireLogin();
      mutation.mutate();
    },
  };
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { productId: string; type: AlertType; targetPriceCents?: number; dropPercentBp?: number; channels: AlertChannel[] }) =>
      api.me.alerts.create({ ...input }),
    onMutate: () => haptic.toggle(),
    onSuccess: (a) => {
      track("alert_created", { alertType: a.type, productId: a.product.id, channel: a.channels.includes("push") ? "push" : "in_app" });
      void qc.invalidateQueries({ queryKey: ALERTS_KEY });
    },
  });
}
