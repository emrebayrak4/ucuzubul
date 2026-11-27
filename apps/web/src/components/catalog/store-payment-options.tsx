import { CalendarClock, CreditCard, ExternalLink } from "lucide-react";
import type { PaymentOption } from "@pricora/contracts";
import { formatPrice } from "@pricora/ui/utils";

const PLAN_LABEL: Record<PaymentOption["planType"], string> = {
  pay_in_4: "Pay in 4 (interest-free)",
  monthly_financing: "Monthly financing",
  store_card_promo: "Store card promotional financing",
};

const usd = (c: number | null) => (c === null ? null : formatPrice(c, { trimZeroCents: true }));

function limits(o: PaymentOption): string | null {
  const min = usd(o.minOrderCents);
  const max = usd(o.maxOrderCents);
  const range = min && max ? `${min}–${max} orders` : min ? `orders of ${min}+` : max ? `orders up to ${max}` : null;
  if (!range) return null;
  return o.limitsScope === "provider_general" ? `${range} (provider's general limits)` : range;
}

/** Store page "Payment options": researched from public help pages, with source link and last-verified date. */
export function StorePaymentOptions({ storeName, options }: { storeName: string; options: PaymentOption[] }) {
  return (
    <section aria-labelledby="store-payments" className="mb-(--pc-section-gap) rounded-lg border border-border bg-surface p-4" data-testid="store-payment-options">
      <h2 id="store-payments" className="text-lg font-bold">
        Payment options at {storeName}
      </h2>
      {options.length ? (
        <>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {options.map((o) => {
              const Icon = o.planType === "store_card_promo" ? CreditCard : CalendarClock;
              const l = limits(o);
              return (
                <li key={`${o.provider}-${o.planType}`} className="flex gap-3 rounded-md border border-border p-3">
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{o.provider}</p>
                    <p className="text-text-muted">
                      {o.planType === "pay_in_4" && !o.interestFree ? "Pay in installments (fees may apply)" : PLAN_LABEL[o.planType]}
                    </p>
                    {o.planType === "monthly_financing" ? (
                      <p className="text-text-muted">
                        APR varies{o.aprMinBp !== null && o.aprMaxBp !== null ? ` (published ${o.aprMinBp / 100}%–${o.aprMaxBp / 100}%)` : ""}
                      </p>
                    ) : null}
                    {o.promoDescription && !(o.planType === "pay_in_4" && !o.interestFree) ? <p className="text-text-muted">{o.promoDescription}</p> : null}
                    {l ? <p className="text-text-muted">{l}</p> : null}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                      <a href={o.sourceUrl} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                        Source <ExternalLink aria-hidden className="size-3" />
                      </a>
                      <span>Verified {new Date(o.lastVerifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-text-muted">
            Offered by {storeName} and its payment partners at checkout, subject to approval. Terms can change — check the source before you buy. WhichLess
            does not offer credit.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-text-muted">We haven&apos;t verified any pay-over-time options for this store yet.</p>
      )}
    </section>
  );
}
