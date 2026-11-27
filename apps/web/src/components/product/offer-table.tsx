"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Ticket, TriangleAlert, Truck } from "lucide-react";
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
import { goHref, outboundRel } from "./outbound";
import { PayOverTimeChips } from "./pay-over-time";
import { absolute, conditionLabel, isStale, relative, stockLabel } from "@/lib/format";
import { SetZipButton } from "@/components/zip-provider";
import { BrandMark } from "@/components/brand-mark";

type SortKey = "total" | "price" | "shipping" | "stock" | "store";
const STOCK_RANK: Record<string, number> = { in_stock: 0, low_stock: 1, preorder: 2, unknown: 3, out_of_stock: 4 };

function sortOffers(offers: Offer[], key: SortKey, dir: 1 | -1): Offer[] {
  const val = (o: Offer): number | string => {
    switch (key) {
      case "price":
        return o.priceCents;
      case "shipping":
        return o.shipping.costCents ?? Number.MAX_SAFE_INTEGER;
      case "stock":
        return STOCK_RANK[o.stock] ?? 9;
      case "store":
        return o.retailer.name.toLowerCase();
      default:
        return o.estimatedTotalCents;
    }
  };
  return [...offers].sort((a, b) => {
    // Organic order: sponsored rows never take the top slot by default.
    if (key === "total" && dir === 1 && a.sponsored !== b.sponsored) return a.sponsored ? 1 : -1;
    const va = val(a);
    const vb = val(b);
    const c = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : (va as number) - (vb as number);
    return c * dir || a.estimatedTotalCents - b.estimatedTotalCents;
  });
}

function SortHead({ label, k, sort, onSort, numeric }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; numeric?: boolean }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <TableHead numeric={numeric} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={"inline-flex items-center gap-1 hover:text-text " + (numeric ? "flex-row-reverse " : "") + (active ? "text-text" : "")}
        data-testid={`sort-offers-${k}`}
      >
        {label}
        <Icon aria-hidden className="size-3.5" />
      </button>
    </TableHead>
  );
}

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
    <span className={stale ? "text-warning" : "text-text-muted"} title={stale ? `${absolute(iso)} · Price may have changed` : absolute(iso)}>
      <time dateTime={iso}>{relative(iso)}</time>
      {/* Stale: full note on its own line, except in the narrow lg table (1024–1279) where it would wrap and make the
          row taller — there the warning colour + icon stay visible and the note is in the tooltip / for screen readers. */}
      {stale ? (
        <>
          <TriangleAlert aria-hidden className="ml-1 hidden size-3 align-[-1px] lg:inline xl:hidden" />
          <span className="block text-2xs lg:sr-only xl:not-sr-only xl:block">Price may have changed</span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Store column: fixed 40×40 logo tile (image logos and monograms alike) so every name starts at the same x.
 * Line 1 = name + compact status chips (Demo, Sponsored, Lowest — always visible); line 2 = exactly ONE reserved chip
 * line (coupon + pay-over-time, passed as `badges`, never wraps) → every row has the same height (~65px).
 */
function StoreCell({ offer, badges, lowest = false }: { offer: Offer; badges?: React.ReactNode; lowest?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandMark name={offer.retailer.name} logoUrl={offer.retailer.logoUrl} brandColor={offer.retailer.brandColor} size="tile-md" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link href={`/stores/${offer.retailer.slug}`} className="min-w-0 truncate text-sm font-medium hover:underline">
            {offer.retailer.name}
          </Link>
          {offer.source === "demo" ? (
            <DemoDataBadge size="sm" label="Demo" title="Demo data — not a live price" aria-label="Demo data — not a live price" className="shrink-0" />
          ) : null}
          {offer.sponsored ? <SponsoredLabel className="shrink-0" /> : null}
          {lowest ? (
            <Badge variant="primary" size="sm" className="shrink-0" title="Lowest estimated total">
              Lowest<span className="sr-only"> total</span>
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1 lg:h-5 lg:flex-nowrap lg:overflow-hidden" data-testid="offer-badges">
          {badges}
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
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "total", dir: 1 });
  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }));
  const sorted = sortOffers(offers, sort.key, sort.dir);
  const anyTaxUnknown = offers.some((o) => o.tax.status === "unknown_set_zip");

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden lg:block">
        <Table data-testid="offer-table" className="[&_td]:px-2.5 [&_th]:px-2.5 xl:[&_td]:px-3 xl:[&_th]:px-3">
          <TableHeader>
            <TableRow>
              <SortHead label="Store" k="store" sort={sort} onSort={onSort} />
              <SortHead label="Price" k="price" sort={sort} onSort={onSort} numeric />
              <SortHead label="Shipping" k="shipping" sort={sort} onSort={onSort} numeric />
              <TableHead numeric>Est. tax</TableHead>
              <SortHead label="Est. total" k="total" sort={sort} onSort={onSort} numeric />
              <TableHead>Condition</TableHead>
              <SortHead label="Stock" k="stock" sort={sort} onSort={onSort} />
              <TableHead className="hidden xl:table-cell">Delivery</TableHead>
              <TableHead>Checked</TableHead>
              <TableHead className="w-px text-right">
                <span className="sr-only">Visit store</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((o) => (
              <TableRow key={o.id} data-testid="offer-row" data-offer-id={o.id} className={o.id === lowestOfferId ? "bg-primary-soft/40" : undefined}>
                {/* Lowest total: tinted row + 3px primary accent bar on the leading edge (inset shadow → no layout shift). */}
                <TableCell className={"w-80 min-w-[17.5rem] max-w-96 xl:min-w-[19rem]" + (o.id === lowestOfferId ? " shadow-[inset_3px_0_0_var(--pc-color-primary)]" : "")}>
                  <StoreCell
                    offer={o}
                    lowest={o.id === lowestOfferId}
                    badges={
                      <>
                        {couponFor(o) ? (
                          <Link
                            href={`/coupons?retailer=${o.retailer.slug}#coupon-${couponFor(o)!.id}`}
                            className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm bg-accent px-1.5 text-2xs font-bold text-accent-fg hover:underline"
                            data-testid="coupon-chip"
                            title="Coupon available at this store"
                          >
                            <Ticket aria-hidden className="size-3" /> Coupon<span className="sr-only"> available</span>
                          </Link>
                        ) : null}
                        {/* `contents`: the chips become items of the badge row instead of a second row. */}
                        <PayOverTimeChips offer={o} className="contents" />
                      </>
                    }
                  />
                  {o.couponCode || o.couponDescription ? (
                    <p className="mt-1 flex items-center gap-1 pl-13 text-2xs text-text-muted">
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
                <TableCell className="w-px text-right">
                  <VisitButton offer={o} placement="pdp_offer_table" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile stacked rows */}
      <div className="mb-2 flex items-center justify-end gap-2 lg:hidden">
        <label htmlFor="offer-sort-m" className="text-xs text-text-muted">
          Sort by
        </label>
        <select
          id="offer-sort-m"
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [k, d] = e.target.value.split(":");
            setSort({ key: k as SortKey, dir: d === "-1" ? -1 : 1 });
          }}
          className="h-8 rounded-sm border border-border bg-surface px-2 text-sm"
        >
          <option value="total:1">Lowest total</option>
          <option value="price:1">Lowest price</option>
          <option value="shipping:1">Lowest shipping</option>
          <option value="stock:1">In stock first</option>
        </select>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface lg:hidden" data-testid="offer-list-mobile">
        {sorted.map((o) => (
          <li key={o.id} className="p-3" data-testid="offer-row-mobile">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <StoreCell offer={o} badges={<PayOverTimeChips offer={o} className="contents" />} />
              </div>
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
