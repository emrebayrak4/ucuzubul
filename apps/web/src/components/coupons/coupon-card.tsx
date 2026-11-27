"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Check, Copy, ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Coupon } from "@pricora/contracts";
import { Badge, Button, DemoDataBadge, cn, formatPrice, toast } from "@pricora/ui";
import { ApiError, api, errorMessage } from "@/lib/api-browser";
import { PUBLIC_API_URL } from "@/lib/env";
import { useSession } from "@/lib/session";
import { BrandMark } from "@/components/brand-mark";

export function discountLabel(c: Pick<Coupon, "discountType" | "discountValue">): string {
  switch (c.discountType) {
    case "percent":
      return c.discountValue ? `${Math.round(c.discountValue / 100)}% off` : "% off";
    case "amount":
      return c.discountValue ? `${formatPrice(c.discountValue, { trimZeroCents: true })} off` : "Money off";
    case "free_shipping":
      return "Free shipping";
    case "bogo":
      return "Buy one, get one";
    default:
      return "Deal";
  }
}

function expiryLabel(iso: string | null): { text: string; urgent: boolean } {
  if (!iso) return { text: "No end date listed", urgent: false };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: "Expired", urgent: true };
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return { text: "Ends today", urgent: true };
  if (days === 1) return { text: "Ends tomorrow", urgent: true };
  return { text: `Ends in ${days} days`, urgent: days <= 3 };
}

function goHref(c: Coupon): string {
  return c.goUrl.startsWith("http") ? c.goUrl : PUBLIC_API_URL + c.goUrl;
}

/** Coupon card: store logo, discount badge, title, expiry, Show code / Get deal (opens the store), "Did it work?" voting. */
export function CouponCard({ coupon: initial, showStore = true }: { coupon: Coupon; showStore?: boolean }) {
  const [coupon, setCoupon] = React.useState(initial);
  const [revealed, setRevealed] = React.useState(false);
  const [voted, setVoted] = React.useState<boolean | null>(null);
  const { requireAuth } = useSession();
  const exp = expiryLabel(coupon.expiresAt);
  const reports = coupon.stats.successCount + coupon.stats.failCount;
  const isDemo = coupon.source === "demo";

  const vote = useMutation({
    mutationFn: (worked: boolean) => api.coupons.vote(coupon.id, worked),
    onSuccess: (res, worked) => {
      setVoted(worked);
      setCoupon(res.coupon);
      toast.success(res.recorded ? "Thanks — your report helps other shoppers" : (res.reason ?? "Already recorded"));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const onReveal = () => {
    setRevealed(true);
    if (coupon.code) {
      navigator.clipboard?.writeText(coupon.code).then(
        () => toast.success(`Code ${coupon.code} copied`, { description: `${coupon.retailer.name} opened in a new tab.` }),
        () => undefined,
      );
    }
  };

  return (
    <article id={`coupon-${coupon.id}`} className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-md" data-testid="coupon-card">
      <div className="flex items-start justify-between gap-3">
        {showStore ? (
          <Link href={`/stores/${coupon.retailer.slug}`} className="flex min-w-0 items-center gap-2 hover:underline">
            <BrandMark name={coupon.retailer.name} logoUrl={coupon.retailer.logoUrl} brandColor={coupon.retailer.brandColor} size="tile-sm" />
            <span className="truncate text-sm font-semibold">{coupon.retailer.name}</span>
          </Link>
        ) : (
          <span />
        )}
        <span className="price shrink-0 rounded-sm bg-accent px-2 py-1 text-sm font-extrabold text-accent-fg">{discountLabel(coupon)}</span>
      </div>
      <div className="min-w-0">
        <h3 className="line-clamp-2 font-bold leading-snug">{coupon.title}</h3>
        {coupon.description ? <p className="mt-1 line-clamp-2 text-sm text-text-muted">{coupon.description}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cn("font-medium", exp.urgent ? "text-warning" : "text-text-muted")}>{exp.text}</span>
          {coupon.minSpendCents ? <span className="text-text-muted">· Min. spend {formatPrice(coupon.minSpendCents, { trimZeroCents: true })}</span> : null}
          {coupon.status === "unverified" ? <Badge size="sm" variant="warning">Unverified</Badge> : null}
          {isDemo ? <DemoDataBadge size="sm" /> : null}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        {coupon.code ? (
          revealed ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border-2 border-dashed border-primary bg-primary-soft px-3 py-2 text-center font-mono text-base font-semibold tracking-wider text-primary-soft-fg" data-testid="coupon-code">
                {coupon.code}
              </code>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Copy code"
                onClick={() => navigator.clipboard?.writeText(coupon.code ?? "").then(() => toast.success("Copied"))}
              >
                <Copy aria-hidden />
              </Button>
            </div>
          ) : (
            <a
              href={goHref(coupon)}
              target="_blank"
              rel="sponsored nofollow noopener"
              onClick={onReveal}
              className="group relative inline-flex h-10 items-center justify-end overflow-hidden rounded-md bg-primary pr-3 text-sm font-bold text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              data-testid="coupon-reveal"
            >
              <span className="absolute inset-y-0 left-0 flex items-center rounded-l-md bg-primary-hover px-4">Show code</span>
              <span aria-hidden className="font-mono tracking-widest opacity-90">•••{coupon.code.slice(-2)}</span>
              <span className="sr-only">(copies the code and opens {coupon.retailer.name} in a new tab)</span>
            </a>
          )
        ) : (
          <a
            href={goHref(coupon)}
            target="_blank"
            rel="sponsored nofollow noopener"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-bold text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="coupon-deal"
          >
            Get deal <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}

        <div className="flex min-h-7 flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
          <span data-testid="coupon-stats">
            {reports > 0 && coupon.stats.successRate !== null
              ? `${Math.round(coupon.stats.successRate * 100)}% worked · ${reports} ${reports === 1 ? "report" : "reports"}`
              : "No reports yet"}
          </span>
          {revealed || !coupon.code ? (
            <span className="flex items-center gap-1">
              {voted !== null ? (
                <span className="flex items-center gap-1 text-success">
                  <Check aria-hidden className="size-3.5" /> Thanks
                </span>
              ) : (
                <>
                  Did it work?
                  <button
                    type="button"
                    disabled={vote.isPending}
                    onClick={() => requireAuth(() => vote.mutate(true))}
                    className="inline-flex size-7 items-center justify-center rounded-sm hover:bg-success-soft hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Yes, it worked"
                  >
                    <ThumbsUp aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={vote.isPending}
                    onClick={() => requireAuth(() => vote.mutate(false))}
                    className="inline-flex size-7 items-center justify-center rounded-sm hover:bg-error-soft hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="No, it didn't work"
                  >
                    <ThumbsDown aria-hidden className="size-3.5" />
                  </button>
                </>
              )}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Follow a store's coupons (signed-in). Unfollow when already following. */
export function FollowStoreButton({ retailerSlug, retailerName, size = "sm" }: { retailerSlug: string; retailerName: string; size?: "sm" | "md" }) {
  const { user, requireAuth } = useSession();
  const qc = useQueryClient();
  const follows = useQuery({ queryKey: ["me", "coupon-follows"], queryFn: () => api.me.couponFollows.list(), enabled: Boolean(user) });
  const following = Boolean(follows.data?.items.some((f) => f.retailer.slug === retailerSlug));
  const m = useMutation({
    mutationFn: async (): Promise<void> => {
      if (following) await api.me.couponFollows.unfollow(retailerSlug);
      else await api.me.couponFollows.follow(retailerSlug);
    },
    onSuccess: () => {
      toast.success(following ? `Stopped following ${retailerName} coupons` : `You'll get alerts for new ${retailerName} coupons`);
      void qc.invalidateQueries({ queryKey: ["me", "coupon-follows"] });
    },
    onError: (err) => toast.error(err instanceof ApiError && err.isNotFound ? "Coupon alerts aren't available yet." : errorMessage(err)),
  });
  return (
    <Button variant={following ? "secondary" : "soft"} size={size} loading={m.isPending} aria-pressed={following} onClick={() => requireAuth(() => m.mutate())} data-testid="follow-store-coupons">
      {following ? <BellOff aria-hidden /> : <Bell aria-hidden />}
      {following ? "Following coupons" : "Follow store coupons"}
    </Button>
  );
}
