import type { Metadata } from "next";
import Link from "next/link";
import { BedDouble, Clock, ExternalLink } from "lucide-react";
import { DemoDataBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pricora/ui";
import { formatPrice } from "@pricora/ui/utils";
import { PUBLIC_API_URL } from "@/lib/env";
import { absolute, relative } from "@/lib/format";
import { getHotel } from "@/lib/loaders";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { Crumbs } from "@/components/crumbs";
import { DemoNotice, Notice } from "@/components/notices";
import { PendingProvidersState, ProviderStatusList } from "@/components/travel/provider-status";
import { StarClass } from "@/components/travel/hotel-card";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
function readQuery(sp: SearchParams) {
  const checkin = first(sp.checkin);
  const checkout = first(sp.checkout);
  const guests = Number(first(sp.guests));
  const rooms = Number(first(sp.rooms));
  return {
    checkin: checkin && dateRe.test(checkin) ? checkin : undefined,
    checkout: checkout && dateRe.test(checkout) ? checkout : undefined,
    guests: Number.isInteger(guests) && guests >= 1 && guests <= 16 ? guests : undefined,
    rooms: Number.isInteger(rooms) && rooms >= 1 && rooms <= 8 ? rooms : undefined,
  };
}

const board: Record<string, string> = {
  room_only: "Room only",
  breakfast: "Breakfast included",
  half_board: "Half board",
  full_board: "Full board",
  all_inclusive: "All inclusive",
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const res = await getHotel(id, readQuery(await searchParams));
  if (!res.ok) return { title: "Hotel", robots: { index: false } };
  const h = res.data.hotel;
  return {
    title: `${h.name}, ${h.city} — compare rates`,
    description: h.description?.slice(0, 155) ?? `Compare rates for ${h.name} in ${h.city} across providers.`,
    alternates: { canonical: `/travel/hotels/${encodeURIComponent(id)}` },
    // Demo hotels are fictional — keep them out of the index.
    robots: h.source === "demo" ? { index: false, follow: true } : undefined,
  };
}

export default async function HotelPage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = readQuery(await searchParams);
  const res = await getHotel(id, q);
  if (!res.ok) {
    return (
      <div className="container-content py-6">
        <ApiErrorPanel error={res.error} />
      </div>
    );
  }
  const { hotel: h, rates, providers } = res.data;
  const sorted = [...rates].sort((a, b) => a.totalPriceCents - b.totalPriceCents);
  const images = h.images.length ? h.images : h.imageUrl ? [h.imageUrl] : [];
  const backHref = "/travel/hotels/search" + toQueryString({ city: h.city, checkin: q.checkin, checkout: q.checkout, guests: q.guests, rooms: q.rooms });

  return (
    <div className="container-content py-6">
      <Crumbs items={[{ label: "Hotels", href: "/travel/hotels" }, { label: h.city, href: backHref }, { label: h.name }]} />
      {h.source === "demo" ? <DemoNotice className="mb-4" /> : null}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {images.length ? (
            <div className="grid grid-cols-4 gap-2">
              {images.slice(0, 5).map((src, i) => (
                <img key={src} src={src} alt={i === 0 ? h.name : ""} className={i === 0 ? "col-span-4 aspect-[16/9] w-full rounded-md object-cover" : "aspect-square w-full rounded-sm object-cover"} loading={i === 0 ? "eager" : "lazy"} />
              ))}
            </div>
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center rounded-md bg-surface-2">
              <BedDouble aria-hidden className="size-14 text-text-muted opacity-60" />
            </div>
          )}
        </div>
        <div className="lg:col-span-5">
          <h1 className="text-2xl font-semibold tracking-tight">{h.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <StarClass stars={h.stars} />
            <span>{[h.address, h.city, h.region].filter(Boolean).join(", ")}</span>
          </div>
          {h.checkinTime || h.checkoutTime ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-text-muted">
              <Clock aria-hidden className="size-4" />
              {h.checkinTime ? `Check-in from ${h.checkinTime}` : ""}
              {h.checkinTime && h.checkoutTime ? " · " : ""}
              {h.checkoutTime ? `Check-out by ${h.checkoutTime}` : ""}
            </p>
          ) : null}
          {h.amenities.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {h.amenities.map((a) => (
                <li key={a} className="rounded-sm bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
                  {a}
                </li>
              ))}
            </ul>
          ) : null}
          {h.description ? <p className="mt-4 text-sm leading-relaxed">{h.description}</p> : null}
        </div>
      </div>

      <section aria-labelledby="rates-title" className="mt-8 flex flex-col gap-3">
        <h2 id="rates-title" className="text-xl font-semibold tracking-tight">
          Rates by provider
        </h2>
        {!q.checkin || !q.checkout ? <Notice>Add your dates to see exact rates for your stay.{" "}<Link href="/travel/hotels" className="font-medium underline">Search with dates</Link></Notice> : null}
        <ProviderStatusList providers={providers} />
        {sorted.length === 0 ? (
          providers.length && providers.every((p) => p.status !== "live") ? (
            <PendingProvidersState providers={providers} kind="hotels" />
          ) : (
            <Notice>No rates available for these dates.</Notice>
          )
        ) : (
          <Table data-testid="hotel-rates">
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Room</TableHead>
                <TableHead numeric>Per night</TableHead>
                <TableHead numeric>Taxes &amp; fees</TableHead>
                <TableHead numeric>Total stay</TableHead>
                <TableHead>Checked</TableHead>
                <TableHead>
                  <span className="sr-only">View deal</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.id} data-testid="rate-row">
                  <TableCell>
                    <span className="font-medium">{r.provider.name}</span>
                    {r.source === "demo" ? <DemoDataBadge size="sm" className="ml-1.5" /> : null}
                  </TableCell>
                  <TableCell>
                    {r.roomName}
                    <span className="block text-xs text-text-muted">
                      {[r.boardType ? board[r.boardType] : null, r.refundable === true ? "Refundable" : r.refundable === false ? "Non-refundable" : null].filter(Boolean).join(" · ")}
                    </span>
                  </TableCell>
                  <TableCell numeric>
                    <span className="price">{formatPrice(r.nightlyPriceCents, { currency: r.currency })}</span>
                  </TableCell>
                  <TableCell numeric>
                    {r.taxesAndFeesCents !== null ? <span className="price">{formatPrice(r.taxesAndFeesCents, { currency: r.currency })}</span> : <span className="text-xs text-text-muted">Not provided</span>}
                  </TableCell>
                  <TableCell numeric>
                    <span className="price font-semibold">{formatPrice(r.totalPriceCents, { currency: r.currency })}</span>
                  </TableCell>
                  <TableCell className="text-xs text-text-muted">
                    <span title={absolute(r.fetchedAt)}>{relative(r.fetchedAt)}</span>
                  </TableCell>
                  <TableCell>
                    {r.source === "demo" ? (
                      <span className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-border px-3 text-xs text-text-muted" data-testid="demo-rate-no-link">
                        Demo rate — no booking link
                      </span>
                    ) : (
                    <a
                      href={(r.goUrl.startsWith("http") ? r.goUrl : PUBLIC_API_URL + r.goUrl) + "?placement=hotel_detail"}
                      target="_blank"
                      rel="sponsored nofollow noopener"
                      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                    >
                      View deal <ExternalLink aria-hidden className="size-3.5" />
                    </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-text-muted">Demo rates are samples and can&apos;t be booked. Rates are as returned by each provider and may change until booked. We may earn a commission from “View deal” links.</p>
      </section>
    </div>
  );
}
