"use client";

import Link from "next/link";
import { BellRing } from "lucide-react";
import { loginHref } from "@/lib/nav";
import { useSession } from "@/lib/session";

/** Fare alerts need an account. The API has no travel-alert endpoint yet, so signed-in users get an honest "coming soon". */
export function FareAlertCta() {
  const { user } = useSession();
  return (
    <section id="fare-alerts" className="flex flex-col items-start justify-between gap-4 rounded-lg bg-flights-action p-5 text-flights-action-fg sm:flex-row sm:items-center" data-testid="fare-alert-cta">
      <div className="flex items-start gap-3">
        <BellRing aria-hidden className="mt-0.5 size-6 shrink-0" />
        <div>
          <h2 className="text-xl font-bold">Set a fare alert</h2>
          <p className="text-sm opacity-95">
            {user ? "Fare and rate alerts are being set up — they'll appear in your account as soon as they're live." : "Log in to get notified when fares or hotel rates for your trip drop."}
          </p>
        </div>
      </div>
      {user ? (
        <span className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-flights-soft-fg">Coming soon</span>
      ) : (
        <Link href={loginHref("/travel#fare-alerts")} className="rounded-full bg-surface px-4 py-2 text-sm font-semibold text-flights-soft-fg hover:bg-surface-2">
          Log in to set alerts
        </Link>
      )}
    </section>
  );
}
