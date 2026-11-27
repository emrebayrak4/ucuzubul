"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, Ticket } from "lucide-react";
import type { CouponFollow } from "@pricora/contracts";
import { Button, EmptyState, ErrorState, Skeleton, toast } from "@pricora/ui";
import { ApiError, api, errorMessage } from "@/lib/api-browser";
import { BrandMark } from "@/components/brand-mark";
import { CouponCard } from "@/components/coupons/coupon-card";

function FollowedStore({ follow }: { follow: CouponFollow }) {
  const qc = useQueryClient();
  const coupons = useQuery({
    queryKey: ["coupons", "retailer", follow.retailer.slug],
    queryFn: () => api.coupons.forRetailer(follow.retailer.slug, { pageSize: 3, sort: "newest" }),
  });
  const unfollow = useMutation({
    mutationFn: () => api.me.couponFollows.unfollow(follow.retailer.slug),
    onSuccess: () => {
      toast.success(`Stopped following ${follow.retailer.name}`);
      void qc.invalidateQueries({ queryKey: ["me", "coupon-follows"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <section className="rounded-lg border border-border bg-surface p-4" data-testid="followed-store">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/stores/${follow.retailer.slug}`} className="flex items-center gap-2 font-bold hover:underline">
          <BrandMark name={follow.retailer.name} logoUrl={follow.retailer.logoUrl} brandColor={follow.retailer.brandColor} size="tile-sm" />
          {follow.retailer.name}
          <span className="price text-xs font-normal text-text-muted">· {follow.activeCoupons} active</span>
        </Link>
        <Button variant="ghost" size="sm" loading={unfollow.isPending} onClick={() => unfollow.mutate()}>
          <BellOff aria-hidden /> Unfollow
        </Button>
      </div>
      {coupons.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : coupons.isError ? (
        <p className="text-sm text-text-muted">Couldn&apos;t load coupons for this store.</p>
      ) : coupons.data.items.length === 0 ? (
        <p className="text-sm text-text-muted">No verified coupons for this store yet — we&apos;ll notify you when one appears.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {coupons.data.items.map((c) => (
            <li key={c.id}>
              <CouponCard coupon={c} showStore={false} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AccountCoupons() {
  const q = useQuery({ queryKey: ["me", "coupon-follows"], queryFn: () => api.me.couponFollows.list() });
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">Coupon alerts</h1>
        <p className="mt-1 text-sm text-text-muted">Stores you follow. We&apos;ll let you know when they get a new verified coupon.</p>
      </div>
      {q.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : q.isError ? (
        q.error instanceof ApiError && q.error.isNotFound ? (
          <EmptyState icon={<Ticket aria-hidden />} title="Coupon alerts are coming soon" />
        ) : (
          <ErrorState onRetry={() => void q.refetch()} />
        )
      ) : q.data.items.length === 0 ? (
        <EmptyState
          icon={<Ticket aria-hidden />}
          title="You're not following any stores yet"
          description="Use “Follow store coupons” on a store or the coupons page."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/coupons">Browse coupons</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {q.data.items.map((f) => (
            <FollowedStore key={f.retailer.slug} follow={f} />
          ))}
        </div>
      )}
    </>
  );
}
