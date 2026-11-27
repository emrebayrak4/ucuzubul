"use client";

import { CalendarClock, CreditCard, ExternalLink } from "lucide-react";
import type { Offer, PaymentOption } from "@pricora/contracts";
import { Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn, formatPrice } from "@pricora/ui";

/** Short provider name for the compact chip ("PayPal Pay in 4" → "PayPal"); full name stays in tooltip/popover. */
const shortProvider = (p: string) => p.replace(/\s+(Pay in 4|Pay Monthly)$/i, "");

const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;

function optionLine(o: PaymentOption): string {
  if (o.planType === "pay_in_4") return o.interestFree ? "Pay in 4, interest-free" : "Pay in installments · fees may apply";
  if (o.planType === "monthly_financing") return `Monthly financing · APR varies${o.aprMinBp !== null && o.aprMaxBp !== null ? ` (published ${pct(o.aprMinBp)}–${pct(o.aprMaxBp)})` : ""}`;
  return o.promoDescription ?? "Store card promotional financing";
}

/**
 * Pay-over-time for one offer, kept to ONE chip + a compact "+N" popover so table rows stay the same height.
 * Primary chip: the interest-free pay-in-4 estimate when available, otherwise "Pay over time available".
 * Copy rules: "interest-free" only for interest-free pay-in-4; monthly plans "APR varies"; always "subject to approval".
 */
export function PayOverTimeChips({ offer, className }: { offer: Offer; className?: string }) {
  const opts = offer.paymentOptions ?? [];
  const p4 = offer.payIn4;
  if (!opts.length && !p4) return null;
  const rest = p4 ? opts.filter((o) => !(o.planType === "pay_in_4" && o.provider === p4.provider)) : opts;
  const primaryLabel = p4 ? `4 × ${formatPrice(p4.installmentCents, { currency: offer.currency })} · ${shortProvider(p4.provider)}` : "Pay over time";
  const primaryTip = p4
    ? `Interest-free pay-in-4 at checkout, subject to approval by ${p4.provider}. Estimate based on price + shipping before tax. Not offered by WhichLess.`
    : `${offer.retailer.name} offers pay-over-time options at checkout, subject to approval. Not offered by WhichLess.`;
  const moreCount = p4 ? rest.length : Math.max(0, opts.length);
  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("flex flex-wrap gap-1", className)} data-testid="pay-over-time">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className={cn(
                "inline-flex h-5 min-w-0 max-w-full shrink items-center gap-1 rounded-sm border px-1.5 text-xs font-medium",
                p4 ? "border-primary/30 bg-primary-soft text-primary-soft-fg" : "border-border bg-surface-2 text-text-muted",
              )}
              data-testid={p4 ? "pay-in-4-chip" : "pay-over-time-chip"}
            >
              <CalendarClock aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{primaryLabel}</span>
              <span className="sr-only">. {primaryTip}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-72 text-xs">{primaryTip}</TooltipContent>
        </Tooltip>
        {moreCount > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-5 shrink-0 items-center rounded-sm border border-border bg-surface px-1.5 text-xs font-semibold text-text-muted hover:border-primary hover:text-primary"
                aria-label={`All ${opts.length} payment options at ${offer.retailer.name}`}
                data-testid="pay-options-more"
              >
                +{moreCount}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-3 text-sm" data-testid="pay-options-popover">
              <p className="font-semibold">Payment options at {offer.retailer.name}</p>
              <ul className="mt-2 space-y-2">
                {opts.map((o) => {
                  const Icon = o.planType === "store_card_promo" ? CreditCard : CalendarClock;
                  const est = p4 && o.planType === "pay_in_4" && o.provider === p4.provider ? ` — 4 × ${formatPrice(p4.installmentCents, { currency: offer.currency })}` : "";
                  return (
                    <li key={`${o.provider}-${o.planType}`} className="flex gap-2">
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="font-medium">
                          {o.provider}
                          {est}
                        </p>
                        <p className="text-xs text-text-muted">{optionLine(o)}</p>
                        <a href={o.sourceUrl} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
                          Source <ExternalLink aria-hidden className="size-3" />
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 border-t border-border pt-2 text-xs text-text-muted">
                Offered by {offer.retailer.name} and its payment partners at checkout, subject to approval. Terms can change. WhichLess does not offer credit.
              </p>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
