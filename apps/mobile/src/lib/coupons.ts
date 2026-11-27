import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import type { Coupon } from "@pricora/contracts";
import { api, errorMessage } from "./api";
import { useAuth } from "./auth";
import { haptic, money } from "./format";
import { requireLogin } from "./saved";
import { createLocalStore } from "./store";

export const FOLLOWS_KEY = ["me", "coupon-follows"] as const;

/** Stable per-install random id (dedupe only, not a secret) for anonymous "worked?" reports (hashed server-side, never stored raw). */
const deviceIdStore = createLocalStore<string | null>("pricora.device-id.v1", null, (raw) => (typeof raw === "string" ? raw : null));
async function deviceId(): Promise<string> {
  await deviceIdStore.ready;
  let id = deviceIdStore.get();
  if (!id) {
    id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    deviceIdStore.set(id);
  }
  return id;
}

/** Coupons this device already voted on (so the buttons show the choice). */
const votedStore = createLocalStore<Record<string, boolean>>("pricora.coupon-votes.v1", {}, (raw) =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, boolean>) : null,
);
export { votedStore };

export function discountLabel(c: Coupon): string {
  switch (c.discountType) {
    case "percent":
      return c.discountValue !== null ? `${Math.round(c.discountValue / 100)}% off` : "Percent off";
    case "amount":
      return c.discountValue !== null ? `${money(c.discountValue, "USD", "auto")} off` : "Amount off";
    case "free_shipping":
      return "Free shipping";
    case "bogo":
      return "BOGO";
    default:
      return "Deal";
  }
}

export function useCouponFollows() {
  const { user } = useAuth();
  return useQuery({ queryKey: FOLLOWS_KEY, queryFn: ({ signal }) => api.me.couponFollows.list({ signal }), enabled: !!user });
}

export function useFollowStore(retailerSlug: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const follows = useCouponFollows();
  const following = !!follows.data?.items.some((f) => f.retailer.slug === retailerSlug);
  const m = useMutation({
    mutationFn: async () => {
      if (!retailerSlug) return;
      if (following) await api.me.couponFollows.unfollow(retailerSlug);
      else await api.me.couponFollows.follow(retailerSlug);
    },
    onMutate: () => haptic.toggle(),
    onError: (e) => Alert.alert("Couldn't update", errorMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: FOLLOWS_KEY }),
  });
  return {
    following,
    pending: m.isPending,
    toggle: () => (user ? m.mutate() : requireLogin("Log in to follow a store's coupons and get notified about new codes.")),
  };
}

/** Worked / didn't work: signed-in users vote (one per account), guests send an anonymous device report. */
export function useCouponVote() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ coupon, worked }: { coupon: Coupon; worked: boolean }) => {
      if (user) return api.coupons.vote(coupon.id, worked);
      return api.coupons.reportResult(coupon.id, { worked, source: "mobile", deviceId: await deviceId() });
    },
    onMutate: ({ coupon, worked }) => {
      haptic.toggle();
      votedStore.set((prev) => ({ ...prev, [coupon.id]: worked }));
    },
    onSuccess: (res) => {
      if (!res.recorded && res.reason) Alert.alert("Thanks", res.reason);
      void qc.invalidateQueries({ queryKey: ["coupons"] });
    },
    onError: (e, { coupon }) => {
      votedStore.set((prev) => {
        const next = { ...prev };
        delete next[coupon.id];
        return next;
      });
      Alert.alert("Couldn't send", errorMessage(e));
    },
  });
}
