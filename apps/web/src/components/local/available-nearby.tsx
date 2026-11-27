import Link from "next/link";
import { MapPin, Store } from "lucide-react";
import type { NearbyAvailability, ProductNearbyResponse } from "@pricora/contracts";
import { Badge, DemoDataBadge } from "@pricora/ui";
import { load, serverApi } from "@/lib/api-server";
import { formatPrice } from "@/lib/format";
import { SetZipButton } from "@/components/zip-provider";
import { StoreMapLazy } from "./store-map-lazy";

const STOCK: Record<NearbyAvailability["stock"], { label: string; variant: "success" | "warning" | "error" | "neutral" }> = {
  in_stock: { label: "In stock", variant: "success" },
  limited: { label: "Limited stock", variant: "warning" },
  out_of_stock: { label: "Out of stock", variant: "error" },
  unknown: { label: "Stock unknown", variant: "neutral" },
};

function distance(i: NearbyAvailability): string {
  return `${i.distanceMi < 0.1 ? "< 0.1" : i.distanceMi.toFixed(1)} mi${i.location.geoPrecision === "zip_centroid" ? " (approx.)" : ""}`;
}

function Row({ item, zip }: { item: NearbyAvailability; zip: string }) {
  const s = STOCK[item.stock];
  const local = item.location.retailer.kind === "local";
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-3 py-3" data-testid={item.sponsored ? "nearby-sponsored" : "nearby-row"}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-text">
          {item.sponsored ? (
            <Badge size="sm" variant="warning">
              Sponsored
            </Badge>
          ) : null}
          <span className="truncate">{item.location.name}</span>
          {local ? (
            <Badge size="sm" variant="success">
              Local seller
            </Badge>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          {distance(item)} from ZIP {zip}
          {item.location.city ? ` · ${item.location.city}${item.location.state ? `, ${item.location.state}` : ""}` : ""}
        </p>
        <p className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge size="sm" variant={s.variant}>
            {s.label}
          </Badge>
          {item.pickupToday ? (
            <Badge size="sm" variant="primary">
              Pickup today
            </Badge>
          ) : null}
          {item.deliversToYou ? (
            <Badge size="sm" variant="outline">
              Delivers to you{item.location.deliveryMinimumCents ? ` · min ${formatPrice(item.location.deliveryMinimumCents)}` : ""}
            </Badge>
          ) : null}
          {item.source === "demo" ? <DemoDataBadge /> : null}
        </p>
      </div>
      <div className="text-right">
        {item.priceCents !== null ? (
          <>
            <p className="text-xs text-text-muted">Price at {item.location.retailer.kind === "local" ? "this store" : item.location.retailer.name}</p>
            <p className="price text-lg font-semibold text-text">{formatPrice(item.priceCents, { currency: item.currency })}</p>
            {item.unitPrice ? <p className="price text-xs text-text-muted" data-testid="nearby-unit-price">{item.unitPrice.label}</p> : null}
          </>
        ) : (
          <p className="text-xs text-text-muted">Store price not provided</p>
        )}
      </div>
    </li>
  );
}

/** "Available nearby": store-level availability from sources that provide it, by distance from the shopper ZIP. */
export async function AvailableNearby({ slug, zip, unitLabel }: { slug: string; zip: string | null; unitLabel?: string | null }) {
  const api = await serverApi({ revalidate: 120 });
  const res = await load(() => api.local.nearby(slug, zip ? { zip, radius: 25 } : { radius: 25 }));
  if (!res.ok) return null;
  const d: ProductNearbyResponse = res.data;

  return (
    <section aria-labelledby="nearby-title" className="mt-(--pc-section-gap)" data-testid="available-nearby">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="nearby-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <MapPin aria-hidden className="size-5 text-primary" /> Available nearby
        </h2>
        {d.origin ? (
          <p className="text-xs text-text-muted">
            Within {d.radiusMi} mi of ZIP {d.origin.zip}
            {d.origin.city ? ` (${d.origin.city}, ${d.origin.state ?? ""})` : ""} · <SetZipButton label="change ZIP" />
          </p>
        ) : null}
      </div>

      {d.status === "set_zip" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-surface p-4" data-testid="nearby-set-zip">
          <p className="text-sm text-text">
            <Store aria-hidden className="mr-1.5 inline size-4 text-text-muted" />
            Set your ZIP code to see which stores near you carry this item and what it costs there.
          </p>
          <SetZipButton label="Set ZIP code" className="text-sm" />
        </div>
      ) : d.status === "unknown_zip" ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-text-muted">
          We couldn&apos;t find that ZIP code. <SetZipButton label="Try another ZIP" />
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {d.online ? (
              <p className="mb-2 text-sm text-text-muted" data-testid="nearby-online">
                Online lowest: <span className="price font-semibold text-text">{formatPrice(d.online.priceCents)}</span> at {d.online.retailerName}
                {unitLabel ? <> · {unitLabel}</> : null}
              </p>
            ) : null}
            {d.sponsored.length ? (
              <div className="mb-3">
                <ul className="rounded-md border border-warning/40 bg-surface">
                  {d.sponsored.map((i) => (
                    <Row key={`sp-${i.location.id}`} item={i} zip={d.origin?.zip ?? ""} />
                  ))}
                </ul>
                <p className="mt-1 text-2xs text-text-muted">Promoted listing paid for by the store. It doesn&apos;t change the order of the stores below or any Deal Score.</p>
              </div>
            ) : null}
            {d.items.length ? (
              <ul className="divide-y divide-border rounded-md border border-border bg-surface">
                {d.items.map((i) => (
                  <Row key={i.location.id} item={i} zip={d.origin?.zip ?? ""} />
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
                No store within {d.radiusMi} mi reports stock for this item yet. Many stores only publish online prices.
              </p>
            )}
            <p className="mt-2 text-2xs text-text-muted">
              Store prices and stock come from the store or its data provider where available and can differ in store. Distances are from your ZIP code&apos;s center; store
              locations marked “approx.” are ZIP-level.{" "}
              <Link href="/sell" className="underline underline-offset-2">
                Own a local store? List it free
              </Link>
            </p>
          </div>
          <div className="h-72 overflow-hidden rounded-md border border-border lg:col-span-5 lg:h-auto lg:min-h-80">
            <StoreMapLazy
              className="h-full min-h-72 w-full"
              origin={d.origin ? { lat: d.origin.lat, lng: d.origin.lng, zip: d.origin.zip } : null}
              pins={[...d.sponsored, ...d.items].map((i, n) => ({
                id: `${i.sponsored ? "sp-" : ""}${i.location.id}`,
                lat: i.location.lat,
                lng: i.location.lng,
                label: i.priceCents !== null ? formatPrice(i.priceCents) : String(n + 1),
                title: `${i.location.name} · ${distance(i)}`,
                kind: i.sponsored ? "sponsored" : i.location.retailer.kind === "local" ? "local" : "chain",
              }))}
            />
          </div>
        </div>
      )}
      {d.marketplacePickup?.length ? (
        <div className="mt-4" data-testid="nearby-marketplace-pickup">
          <h3 className="mb-2 text-sm font-semibold">eBay sellers with local pickup</h3>
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {d.marketplacePickup.map((m, i) => (
              <li key={`${m.title}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-text">{m.title}</span>
                  <span className="text-xs text-text-muted">
                    {m.sellerName ?? "eBay seller"} · {[m.city, m.state].filter(Boolean).join(", ") || m.postalCode || "location not shared"} · {m.condition.replace("_", " ")}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="price font-semibold">{formatPrice(m.priceCents, { currency: m.currency })}</span>
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="nofollow sponsored noopener" className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                      View on eBay
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {d.sources?.length ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-2xs text-text-muted" data-testid="nearby-sources">
          <span>Local sources:</span>
          {d.sources.map((s) => (
            <Badge key={s.id} size="sm" variant={s.status === "live" ? "success" : "neutral"} title={s.note ?? undefined}>
              {s.name} · {s.status === "live" ? "connected" : s.status === "error" ? "error" : "pending configuration"}
            </Badge>
          ))}
        </p>
      ) : null}
      {[...d.items, ...d.sponsored].some((i) => i.source === "demo") ? (
        <p className="mt-2 text-2xs font-medium text-text-muted">Demo data: store rows labeled “Demo data” are samples, not live.</p>
      ) : d.online?.source === "demo" ? (
        <p className="mt-2 text-2xs font-medium text-text-muted">The online comparison price above is demo data.</p>
      ) : null}
    </section>
  );
}
