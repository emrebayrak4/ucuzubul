"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@pricora/ui";
import { api } from "@/lib/api-browser";
import { loginHref } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { ProductCardRail } from "./rail";

/** Signed-in only: /v1/me/recently-viewed. Renders nothing when empty or signed out. */
export function RecentlyViewedRail() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ["me", "recently-viewed"],
    queryFn: () => api.me.recentlyViewed(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  if (!user || !q.data?.items.length) return null;
  return (
    <ProductCardRail title="Recently viewed" description="Pick up where you left off" products={q.data.items.map((i) => i.product)} testId="rail-recently-viewed" />
  );
}

/** Amazon-style personalisation band: signed-out → sign-in CTA; signed-in → recently viewed. */
export function PersonalBand() {
  const { user, loading } = useSession();
  if (loading) return null;
  if (user) {
    return (
      <div className="container-content">
        <RecentlyViewedRail />
      </div>
    );
  }
  return (
    <section className="border-y border-border bg-surface py-8 text-center" data-testid="signin-band">
      <h2 className="text-xl font-semibold">See personalized recommendations</h2>
      <p className="mt-1 text-sm text-text-muted">Saved products, recently viewed and price alerts in one place.</p>
      <Button asChild className="mt-4 w-56 rounded-full">
        <Link href={loginHref("/")}>Log in</Link>
      </Button>
      <p className="mt-2 text-xs text-text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-primary underline underline-offset-2">
          Create a free account
        </Link>
      </p>
    </section>
  );
}
