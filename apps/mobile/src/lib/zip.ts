import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { ME_KEY, useAuth } from "./auth";
import { createLocalStore, useLocalStore } from "./store";

/**
 * ZIP for tax/shipping estimates, web parity: account preference first, otherwise a ZIP saved on this device
 * (signed-out users). Only the 5-digit ZIP is stored — never coordinates.
 */
export const deviceZipStore = createLocalStore<string | null>("pricora.zip.v1", null, (v) => (typeof v === "string" && /^\d{5}$/.test(v) ? v : null));

export function useZip(): { zip: string | null; source: "account" | "device" | null } {
  const { user } = useAuth();
  const device = useLocalStore(deviceZipStore);
  if (user?.zip) return { zip: user.zip, source: "account" };
  if (device) return { zip: device, source: "device" };
  return { zip: null, source: null };
}

/** Saves on the device and, when signed in, to the account (PATCH /v1/me/preferences). */
export function useSaveZip() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (zip: string | null) => {
      deviceZipStore.set(zip);
      if (user) await api.me.updatePreferences({ zip });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ME_KEY });
      void qc.invalidateQueries({ queryKey: ["me", "preferences"] });
      void qc.invalidateQueries({ queryKey: ["product"] });
    },
  });
}
