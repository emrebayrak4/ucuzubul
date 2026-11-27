"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellPlus, GitCompareArrows, Heart, Share2, ShoppingBasket } from "lucide-react";
import type { AlertType } from "@pricora/contracts";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldMessage,
  IconButton,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  cn,
  formatPrice,
  toast,
} from "@pricora/ui";
import { ApiError, api, errorMessage } from "@/lib/api-browser";
import { addToBasket } from "@/lib/basket-store";
import { COMPARE_MAX, compareHref, compareStore, toggleCompare } from "@/lib/compare-store";
import { loginHref } from "@/lib/nav";
import { useSession } from "@/lib/session";

export interface ActionProduct {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  lowestPriceCents: number | null;
  currency: string;
  hasDemoData: boolean;
}

function useAuthRedirect() {
  const router = useRouter();
  return React.useCallback(() => {
    router.push(loginHref(window.location.pathname + window.location.search));
  }, [router]);
}

/* ------------------------------------------------------------ Favorite */

function FavoriteButton({ product }: { product: ActionProduct }) {
  const { user, requireAuth } = useSession();
  const qc = useQueryClient();
  const toLogin = useAuthRedirect();
  const favs = useQuery({
    queryKey: ["me", "favorites", "all"],
    queryFn: () => api.me.favorites.list({ page: 1, pageSize: 60 }),
    enabled: Boolean(user),
  });
  const existing = favs.data?.items.find((f) => f.product.id === product.id);
  const m = useMutation({
    mutationFn: async () => {
      if (existing) await api.me.favorites.remove(existing.id);
      else await api.me.favorites.add(product.id);
    },
    onSuccess: () => {
      toast.success(existing ? "Removed from saved" : "Saved", { description: existing ? undefined : "Find it under Account → Saved." });
      void qc.invalidateQueries({ queryKey: ["me", "favorites"] });
    },
    onError: (err) => (err instanceof ApiError && err.isUnauthorized ? toLogin() : toast.error(errorMessage(err))),
  });
  const saved = Boolean(existing);
  return (
    <IconButton
      label={saved ? "Remove from saved" : "Save product"}
      variant="secondary"
      aria-pressed={saved}
      disabled={m.isPending}
      onClick={() => requireAuth(() => m.mutate())}
      data-testid="favorite-button"
    >
      <Heart aria-hidden className={cn("size-4", saved && "fill-current text-error")} />
    </IconButton>
  );
}

/* --------------------------------------------------------------- Alert */

const alertOptions: Array<{ value: AlertType; label: string; hint: string }> = [
  { value: "below_price", label: "Price drops below", hint: "Notify me when any store's price is at or below my target." },
  { value: "drop_percent", label: "Price drops by %", hint: "Relative to today's lowest price." },
  { value: "all_time_low", label: "New all-time low", hint: "Based on our real price history." },
  { value: "back_in_stock", label: "Back in stock", hint: "When any store has it in stock again." },
  { value: "new_cheaper_store", label: "A cheaper store appears", hint: "When a new store beats today's lowest." },
];

export function AlertDialogButton({ product, variant = "accent", fullWidth = false }: { product: ActionProduct; variant?: "accent" | "secondary"; fullWidth?: boolean }) {
  const { requireAuth } = useSession();
  const toLogin = useAuthRedirect();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<AlertType>("below_price");
  const [target, setTarget] = React.useState("");
  const [pct, setPct] = React.useState("10");
  const [email, setEmail] = React.useState(true);
  const [inApp, setInApp] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && product.lowestPriceCents !== null && !target) {
      setTarget(String(Math.floor((product.lowestPriceCents * 0.9) / 100)));
    }
  }, [open, product.lowestPriceCents, target]);

  const m = useMutation({
    mutationFn: () => {
      const channels = [...(email ? (["email"] as const) : []), ...(inApp ? (["in_app"] as const) : [])];
      return api.me.alerts.create({
        productId: product.id,
        type,
        targetPriceCents: type === "below_price" ? Math.round(Number(target) * 100) : undefined,
        dropPercentBp: type === "drop_percent" ? Number(pct) * 100 : undefined,
        channels,
      });
    },
    onSuccess: () => {
      toast.success("Alert created", { description: "Manage alerts under Account → Alerts." });
      void qc.invalidateQueries({ queryKey: ["me", "alerts"] });
      setOpen(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.isUnauthorized) toLogin();
      else setError(errorMessage(err));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email && !inApp) return setError("Choose at least one way to be notified.");
    if (type === "below_price") {
      const n = Number(target);
      if (!target || !Number.isFinite(n) || n <= 0) return setError("Enter a target price in dollars.");
    }
    m.mutate();
  };

  return (
    <>
      <Button variant={variant} fullWidth={fullWidth} onClick={() => requireAuth(() => setOpen(true))} data-testid="alert-button">
        <BellPlus aria-hidden /> Set price alert
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Price alert</DialogTitle>
              <DialogDescription className="line-clamp-2">{product.title}</DialogDescription>
            </DialogHeader>
            <RadioGroup value={type} onValueChange={(v) => setType(v as AlertType)} className="mt-4 flex flex-col gap-2.5" aria-label="Alert type">
              {alertOptions.map((o) => (
                <div key={o.value} className="flex items-start gap-2.5">
                  <RadioGroupItem id={`alert-${o.value}`} value={o.value} className="mt-0.5" />
                  <Label htmlFor={`alert-${o.value}`} className="flex flex-col font-normal">
                    <span className="text-sm font-medium">{o.label}</span>
                    <span className="text-xs text-text-muted">{o.hint}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {type === "below_price" ? (
              <div className="mt-4">
                <Label htmlFor="alert-target">Target price ($)</Label>
                <Input id="alert-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1" />
                {product.lowestPriceCents !== null ? (
                  <FieldMessage className="mt-1">Lowest right now: {formatPrice(product.lowestPriceCents, { currency: product.currency })}</FieldMessage>
                ) : null}
              </div>
            ) : null}
            {type === "drop_percent" ? (
              <div className="mt-4 flex gap-2" role="group" aria-label="Drop percentage">
                {["5", "10", "20"].map((p) => (
                  <Button key={p} type="button" size="sm" variant={pct === p ? "primary" : "secondary"} aria-pressed={pct === p} onClick={() => setPct(p)}>
                    {p}%
                  </Button>
                ))}
              </div>
            ) : null}
            <fieldset className="mt-4 flex gap-5">
              <legend className="mb-1.5 text-sm font-medium">Notify me by</legend>
              <div className="flex items-center gap-2">
                <Checkbox id="ch-email" checked={email} onCheckedChange={(c) => setEmail(c === true)} />
                <Label htmlFor="ch-email" className="font-normal">
                  Email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="ch-inapp" checked={inApp} onCheckedChange={(c) => setInApp(c === true)} />
                <Label htmlFor="ch-inapp" className="font-normal">
                  In-app
                </Label>
              </div>
            </fieldset>
            {error ? (
              <FieldMessage tone="error" className="mt-3">
                {error}
              </FieldMessage>
            ) : null}
            <DialogFooter className="mt-5">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={m.isPending}>
                Create alert
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------- Compare */

function CompareToggle({ product }: { product: ActionProduct }) {
  const router = useRouter();
  const list = compareStore.use();
  const inList = list.some((i) => i.id === product.id);
  return (
    <IconButton
      label={inList ? "Remove from compare" : "Add to compare"}
      variant="secondary"
      aria-pressed={inList}
      onClick={() => {
        const r = toggleCompare({ id: product.id, slug: product.slug, title: product.title });
        if (r === "full") {
          toast.error(`You can compare up to ${COMPARE_MAX} products`, {
            action: { label: "Open compare", onClick: () => router.push(compareHref(compareStore.get())) },
          });
        } else if (r === "added") {
          const now = compareStore.get();
          toast.success("Added to compare", {
            description: now.length < 2 ? "Add one more product to compare side by side." : `${now.length} products selected.`,
            action: now.length >= 2 ? { label: "Compare", onClick: () => router.push(compareHref(now)) } : undefined,
          });
        }
      }}
      data-testid="compare-button"
    >
      <GitCompareArrows aria-hidden className={cn("size-4", inList && "text-primary")} />
    </IconButton>
  );
}

/* --------------------------------------------------------------- Share */

function ShareButton({ title }: { title: string }) {
  return (
    <IconButton
      label="Share"
      variant="secondary"
      onClick={async () => {
        const url = window.location.origin + window.location.pathname;
        try {
          if (navigator.share) {
            await navigator.share({ title, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          toast.success("Link copied");
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
          toast.error("Couldn't share this link");
        }
      }}
    >
      <Share2 aria-hidden className="size-4" />
    </IconButton>
  );
}

/* -------------------------------------------------------------- Basket */

function BasketButton({ product }: { product: ActionProduct }) {
  const router = useRouter();
  return (
    <IconButton
      label="Add to smart basket"
      variant="secondary"
      onClick={() => {
        addToBasket({
          productId: product.id,
          slug: product.slug,
          title: product.title,
          imageUrl: product.imageUrl,
          lowestPriceCents: product.lowestPriceCents,
          hasDemoData: product.hasDemoData,
        });
        toast.success("Added to smart basket", { action: { label: "View basket", onClick: () => router.push("/basket") } });
      }}
      data-testid="basket-button"
    >
      <ShoppingBasket aria-hidden className="size-4" />
    </IconButton>
  );
}

export function ProductIconActions({ product }: { product: ActionProduct }) {
  return (
    <div className="flex items-center gap-1.5">
      <FavoriteButton product={product} />
      <CompareToggle product={product} />
      <BasketButton product={product} />
      <ShareButton title={product.title} />
    </div>
  );
}

/* -------------------------------------------------------- Inline alert */

/** Inline "price alarm": one target-price field with quick presets (−5/−10/−20%). Creates a below_price alert. */
export function InlinePriceAlert({ product }: { product: ActionProduct }) {
  const { requireAuth } = useSession();
  const toLogin = useAuthRedirect();
  const qc = useQueryClient();
  const base = product.lowestPriceCents;
  const preset = (pct: number) => (base === null ? "" : String(Math.floor((base * (1 - pct)) / 100)));
  const [target, setTarget] = React.useState(preset(0.1));
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api.me.alerts.create({ productId: product.id, type: "below_price", targetPriceCents: Math.round(Number(target) * 100), channels: ["email", "in_app"] }),
    onSuccess: () => {
      setDone(true);
      toast.success("Price alarm set", { description: `We'll tell you when it drops to ${formatPrice(Math.round(Number(target) * 100), { currency: product.currency })} or less.` });
      void qc.invalidateQueries({ queryKey: ["me", "alerts"] });
    },
    onError: (err) => (err instanceof ApiError && err.isUnauthorized ? toLogin() : setError(errorMessage(err))),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d+$/.test(target) || Number(target) <= 0) return setError("Enter a target price in whole dollars.");
    requireAuth(() => m.mutate());
  };
  return (
    <form onSubmit={submit} className="rounded-md border border-border bg-surface-2/60 p-3" data-testid="inline-price-alert" aria-labelledby="inline-alert-title">
      <p id="inline-alert-title" className="flex items-center gap-1.5 text-sm font-bold">
        <BellPlus aria-hidden className="size-4 text-primary" /> Price alarm
      </p>
      {done ? (
        <p className="mt-1 text-sm text-success">Alarm set — manage it under Account → Alerts.</p>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-text-muted">Get an email when any store drops to your price.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Label htmlFor="inline-target" className="text-2xs text-text-muted">
                Target ($)
              </Label>
              <Input id="inline-target" size="sm" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(error)} />
            </div>
            {base !== null ? (
              <div className="flex gap-1" role="group" aria-label="Quick targets">
                {[0.05, 0.1, 0.2].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTarget(preset(p))}
                    className={cn("h-8 rounded-sm border px-2 text-xs font-medium", target === preset(p) ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border bg-surface hover:bg-surface-2")}
                  >
                    −{Math.round(p * 100)}%
                  </button>
                ))}
              </div>
            ) : null}
            <Button type="submit" size="sm" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Set alarm"}
            </Button>
          </div>
          {error ? <FieldMessage tone="error">{error}</FieldMessage> : null}
        </>
      )}
    </form>
  );
}
