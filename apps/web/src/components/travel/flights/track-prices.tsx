"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import { Switch, toast } from "@pricora/ui";
import { api, errorMessage } from "@/lib/api-browser";
import { useSession } from "@/lib/session";
import { usd } from "./format";

/** "Track prices" for a route + dates (signed-in users). The worker checks fares every 6 h and notifies on drops. */
export function TrackPrices({ from, to, depart, ret, demo }: { from: string; to: string; depart: string; ret: string | null; demo: boolean }) {
  const { user, requireAuth } = useSession();
  const qc = useQueryClient();
  const key = ["flight-alerts", from, to];
  const alerts = useQuery({ queryKey: key, queryFn: () => api.travel.flightAlerts.list({ from, to }), enabled: Boolean(user) });
  const current = alerts.data?.items.find((a) => a.depart === depart && (a.return ?? null) === ret && a.active);
  const create = useMutation({
    mutationFn: () => api.travel.flightAlerts.create({ from, to, depart, ...(ret ? { return: ret } : {}) }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success(`Tracking ${from} → ${to}`, { description: a.targetPriceCents ? `We'll notify you if it drops below ${usd(a.targetPriceCents)} per adult.` : "We'll notify you when the price drops." });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.travel.flightAlerts.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast("Price tracking turned off");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const on = Boolean(current);
  const busy = create.isPending || remove.isPending;
  const id = React.useId();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2" data-testid="track-prices">
      {on ? <BellRing aria-hidden className="size-5 text-flights-action" /> : <Bell aria-hidden className="size-5 text-text-muted" />}
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-semibold">Track prices</span>
        <span className="block text-xs text-text-muted">
          {on && current?.targetPriceCents ? `Alert below ${usd(current.targetPriceCents)} per adult` : user ? "Get notified when this route gets cheaper" : "Sign in to get price-drop alerts"}
          {demo ? " · based on demo fares until live providers connect" : ""}
        </span>
      </label>
      <Switch
        id={id}
        checked={on}
        disabled={busy || (Boolean(user) && alerts.isLoading)}
        onCheckedChange={(c) =>
          requireAuth(() => {
            if (c) create.mutate();
            else if (current) remove.mutate(current.id);
          })
        }
        aria-label="Track prices for this route"
      />
    </div>
  );
}
