import Link from "next/link";
import { ExternalLink, Ticket, Truck } from "lucide-react";
import type { Coupon, Offer } from "@pricora/contracts";
import {
  Badge,
  DemoDataBadge,
  SponsoredLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pricora/ui";
import { formatPrice } from "@pricora/ui/utils";
import { PUBLIC_API_URL } from "@/lib/env";
import { absolute, conditionLabel, isStale, relative, stockLabel } from "@/lib/format";
import { SetZipButton } from "@/components/zip-provider";
import { BrandMark } from "@/components/brand-mark";

export function goHref(offer: Pick<Offer, "goUrl">, placement: string): string {
  const base = offer.goUrl.startsWith("http") ? offer.goUrl : PUBLIC_API_URL + offer.goUrl;
  return base + (base.includes("?") ? "&" : "?") + "placement=" + encodeURIComponent(placement);
}

/** Outbound link attributes required for affiliate/retailer links. */
export const outboundRel = "sponsored nofollow noopener";

function Shipping({ offer }: { offer: Offer }) {
  const s = offer.shipping;
  if (s.kind === "free" || (s.kind === "threshold" && s.costCents === 0)) return <span className="text-success">Free</span>;
  if (s.kind === "unknown" || s.costCents === null) return <span className="text-text-muted">Check store</span>;
  return <span className="price">{formatPrice(s.costCents, { currency: offer.currency })}</span>;
}

function Delivery({ offer }: { offer: Offer }) {
  const { estimatedDaysMin: min, estimatedDaysMax: max, pickupAvailable } = offer.shipping;
  const parts: string[] = [];
  if (min !== null && max !== null) parts.push(min === max ? `${min} days` : `${min}–${max} days`);
  else if (max !== null) parts.push(`≤${max} days`);
  if (pickupAvailable) parts.push("Pickup");
  return <span className="text-text-muted">{parts.length ? parts.join(" · ") : "—"}</span>;
}

function Tax({ offer }: { offer: Offer }) {
  const t = offer.tax;
  if (t.status === "unknown_set_zip") return <SetZipButton />;
  if (t.status === "included") return <span className="text-text-muted">Included</span>;
  if (t.status === "not_applicable") return <span className="text-text-muted">None</span>;
  return t.amountCents !== null ? (
    <span className="price" title="Estimated from your ZIP code">
      ~{formatPrice(t.amountCents, { currency: offer.currency })}
    </span>
  ) : (
    <span className="text-text-muted">Unknown</span>
  );
}

function Stock({ offer }: { offer: Offer }) {
  const tone = offer.stock === "in_stock" ? "text-success" : offer.stock === "low_stock" ? "text-warning" : "text-text-muted";
  return <span className={tone}>{stockLabel[offer.stock] ?? offer.stock}</span>;
}

function Checked({ iso }: { iso: string }) {
  const stale = isStale(iso);
  return (
    <span className={stale ? "text-warning" : "text-text-muted"} title={absolute(iso)}>
      {relative(iso)}
      {stale ? <span className="block text-2xs">Price may have changed</span> : null}
    </span>
  );
}

function StoreCell({ offer }: { offer: Offer }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark name={offer.retailer.name} logoUrl={offer.retailer.logoUrl} brandColor={offer.retailer.brandColor} size="sm" />
      <div className="min-w-0">
        <Link href={`/stores/${offer.retailer.slug}`} className="block truncate text-sm font-medium hover:underline">
          {offer.retailer.name}
        </Link>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {offer.source === "demo" ? <DemoDataBadge size="sm" /> : null}
          {offer.sponsored ? <SponsoredLabel /> : null}
        </div>
      </div>
    </div>
  );
}

function VisitButton({ offer, placement }: { offer: Offer; placement: string }) {
  return (
    <a
      href={goHref(offer, placement)}
      target="_blank"
      rel={outboundRel}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      data-testid="visit-store"
    >
      Visit store <ExternalLink aria-hidden className="size-3.5" />
      <span className="sr-only">(opens {offer.retailer.name} in a new tab)</span>
    </a>
  );
}

/**
 * Offer comparison table. Organic order = lowest estimated total (sponsored rows never take the top slot).
 */
export function OfferTable({ offers, lowestOfferId, coupons = [] }: { offers: Offer[]; lowestOfferId: string | null; coupons?: Coupon[] }) {
  const couponFor = (o: Offer) => coupons.find((c) => c.retailer.id === o.retailer.id || c.retailer.slug === o.retailer.slug);
  const sorted = [...offers].sort((a, b) => {
    if (a.sponsored !== b.sponsored) return a.sponsored ? 1 : -1;
    return a.estimatedTotalCents - b.estimatedTotalCents;
  });
  const anyTaxUnknown = offers.some((o) => o.tax.status === "unknown_set_zip");

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table data-testid="offer-table">
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead numeric>Price</TableHead>
              <TableHead numeric>Shipping</TableHead>
              <TableHead numeric>Est. tax</TableHead>
              <TableHead numeric>Est. total</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="hidden xl:table-cell">Delivery</TableHead>
              <TableHead>Checked</TableHead>
              <TableHead>
                <span className="sr-only">Visit store</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((o) => (
              <TableRow key={o.id} data-testid="offer-row" data-offer-id={o.id} className={o.id === lowestOfferId ? "bg-primary-soft/40" : undefined}>
                <TableCell className="max-w-56">
                  <StoreCell offer={o} />
                  {o.id === lowestOfferId ? (
                    <Badge variant="primary" size="sm" className="mt-1">
                      Lowest total
                    </Badge>
                  ) : null}
                  {couponFor(o) ? (
                    <Link
                      href={`/coupons?retailer=${o.retailer.slug}#coupon-${couponFor(o)!.id}`}
                      className="mt-1 inline-flex items-center gap-1 rounded-sm bg-accent px-1.5 py-0.5 text-2xs font-bold text-accent-fg hover:underline"
                      data-testid="coupon-chip"
                    >
                      <Ticket aria-hidden className="size-3" /> Coupon available
                    </Link>
                  ) : null}
                  {o.couponCode || o.couponDescription ? (
                    <p className="mt-1 flex items-center gap-1 text-2xs text-text-muted">
                      <Ticket aria-hidden className="size-3" />
                      {o.couponCode ? <code className="font-mono font-semibold text-text">{o.couponCode}</code> : null} {o.couponDescription}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell numeric>
                  <span className="price">{formatPrice(o.priceCents, { currency: o.currency })}</span>
                  {o.listPriceCents !== null && o.listPriceCents > o.priceCents ? (
                    <s className="price block text-2xs text-text-muted">
                      <span className="sr-only">List price </span>
                      {formatPrice(o.listPriceCents, { currency: o.currency })}
                    </s>
                  ) : null}
                </TableCell>
                <TableCell numeric>
                  <Shipping offer={o} />
                </TableCell>
                <TableCell numeric>
                  <Tax offer={o} />
                </TableCell>
                <TableCell numeric>
                  <span className="price text-md font-semibold">{formatPrice(o.estimatedTotalCents, { currency: o.currency })}</span>
                  {o.tax.status === "unknown_set_zip" ? <span className="block text-2xs text-text-muted">excl. tax</span> : null}
                </TableCell>
                <TableCell>{conditionLabel[o.condition] ?? o.condition}</TableCell>
                <TableCell>
                  <Stock offer={o} />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <Delivery offer={o} />
                </TableCell>
                <TableCell className="text-xs">
                  <Checked iso={o.lastCheckedAt} />
                </TableCell>
                <TableCell>
                  <VisitButton offer={o} placement="pdp_offer_table" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile stacked rows */}
      <ul className="divide-y divide-border rounded-md border border-border bg-surface md:hidden" data-testid="offer-list-mobile">
        {sorted.map((o) => (
          <li key={o.id} className="p-3" data-testid="offer-row-mobile">
            <div className="flex items-start justify-between gap-3">
              <StoreCell offer={o} />
              <div className="text-right">
                <span className="price block text-md font-semibold">{formatPrice(o.estimatedTotalCents, { currency: o.currency })}</span>
                <span className="text-2xs text-text-muted">est. total{o.tax.status === "unknown_set_zip" ? ", excl. tax" : ""}</span>
              </div>
            </div>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-text-muted">Details</summary>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-text-muted">Price</dt>
                <dd className="price text-right">{formatPrice(o.priceCents, { currency: o.currency })}</dd>
                <dt className="text-text-muted">
                  <Truck aria-hidden className="mr-1 inline size-3" />
                  Shipping
                </dt>
                <dd className="text-right">
                  <Shipping offer={o} />
                </dd>
                <dt className="text-text-muted">Est. tax</dt>
                <dd className="text-right">
                  <Tax offer={o} />
                </dd>
                <dt className="text-text-muted">Condition</dt>
                <dd className="text-right">{conditionLabel[o.condition]}</dd>
                <dt className="text-text-muted">Stock</dt>
                <dd className="text-right">
                  <Stock offer={o} />
                </dd>
                <dt className="text-text-muted">Checked</dt>
                <dd className="text-right">
                  <Checked iso={o.lastCheckedAt} />
                </dd>
              </dl>
            </details>
            <div className="mt-2 flex justify-end">
              <VisitButton offer={o} placement="pdp_offer_list_mobile" />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-text-muted" data-testid="affiliate-disclosure">
        We may earn a commission when you buy through “Visit store” links. This never affects the order of offers or the Deal Score.
        Totals are estimates{anyTaxUnknown ? " — set your ZIP to include sales tax" : ""}; the store&apos;s checkout price is final.{" "}
        <Link href="/legal/affiliate-disclosure" className="text-primary underline underline-offset-2">
          Affiliate disclosure
        </Link>
      </p>
    </div>
  );
}
