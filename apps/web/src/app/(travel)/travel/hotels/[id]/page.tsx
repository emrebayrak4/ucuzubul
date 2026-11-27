import type { Metadata } from "next";
import Link from "next/link";
import { BedDouble, Check, Clock, ExternalLink, Info, MapPin, Maximize2, Plane, Users, X } from "lucide-react";
import {
  BOARD_TYPE_LABELS,
  HOTEL_ACCESSIBILITY_LABELS,
  HOTEL_AMENITY_GROUPS,
  HOTEL_AMENITY_LABELS,
  HOTEL_PROPERTY_TYPE_LABELS,
  type HotelDetailResponse,
} from "@pricora/contracts";
import { DemoDataBadge } from "@pricora/ui";
import { PUBLIC_API_URL } from "@/lib/env";
import { getHotel } from "@/lib/loaders";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { Crumbs } from "@/components/crumbs";
import { DemoNotice } from "@/components/notices";
import { ProviderStatusList } from "@/components/travel/provider-status";
import { StarClass } from "@/components/travel/hotel-card";
import { AMENITY_ICONS, PhotoTile } from "@/components/travel/hotels/result-card";
import { HotelLocationMap, MobileStayBar, StayPriceBox } from "@/components/travel/hotels/detail-client";
import { fmtUsd } from "@/components/travel/hotels/format";

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

const SECTIONS = [
  ["overview", "Overview"],
  ["rooms", "Rooms & prices"],
  ["facilities", "Facilities"],
  ["location", "Location"],
  ["rules", "House rules"],
  ["faq", "FAQs"],
] as const;

function Gallery({ hotel }: { hotel: HotelDetailResponse["hotel"] }) {
  const imgs = hotel.images;
  if (imgs.length === 0) {
    return (
      <div className="grid h-56 grid-cols-4 grid-rows-2 gap-1.5 overflow-hidden rounded-lg sm:h-80" data-testid="gallery">
        <div className="col-span-4 row-span-2 sm:col-span-2">
          <PhotoTile hotel={hotel} iconClass="size-16" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="hidden bg-surface-2 sm:block" aria-hidden />
        ))}
        <p className="sr-only">No photos have been supplied for this property yet.</p>
      </div>
    );
  }
  return (
    <div className="grid h-56 grid-cols-4 grid-rows-2 gap-1.5 overflow-hidden rounded-lg sm:h-80" data-testid="gallery">
      {imgs.slice(0, 5).map((src, i) => (
        <img key={src} src={src} alt={i === 0 ? hotel.name : ""} className={i === 0 ? "col-span-4 row-span-2 size-full object-cover sm:col-span-2" : "hidden size-full object-cover sm:block"} loading={i === 0 ? "eager" : "lazy"} />
      ))}
    </div>
  );
}

function RoomsTable({ data }: { data: HotelDetailResponse }) {
  const { rooms, stay } = data;
  if (rooms.length === 0) return <p className="text-sm text-text-muted">No room information for this property yet.</p>;
  return (
    <div className="relative overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm" data-testid="rooms-table">
        <thead className="bg-hotels text-left text-hotels-fg">
          <tr>
            <th scope="col" className="w-[32%] p-3 font-bold">Room type</th>
            <th scope="col" className="p-3 font-bold">Rate & conditions</th>
            <th scope="col" className="p-3 font-bold">
              Price for {stay.nights} {stay.nights === 1 ? "night" : "nights"}
              {stay.rooms > 1 ? `, ${stay.rooms} rooms` : ""}
            </th>
            <th scope="col" className="p-3 font-bold">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => {
            const plans = room.ratePlans.filter((p) => p.offers.length > 0);
            const rowCount = Math.max(1, plans.reduce((n, p) => n + p.offers.length, 0));
            const roomCell = (
              <td rowSpan={rowCount} className="border-b border-r border-border p-3 align-top">
                <p className="font-bold text-hotels-soft-fg">{room.name}</p>
                {room.bedConfig ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs">
                    <BedDouble aria-hidden className="size-3.5" /> {room.bedConfig}
                  </p>
                ) : null}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                  {room.sizeSqm ? (
                    <span className="inline-flex items-center gap-1">
                      <Maximize2 aria-hidden className="size-3.5" /> {room.sizeSqm} m² ({Math.round(room.sizeSqm * 10.764)} ft²)
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <Users aria-hidden className="size-3.5" /> Sleeps {room.maxOccupancy}
                  </span>
                </p>
                {!room.fitsGuests ? <p className="mt-1 text-xs font-semibold text-warning">Too small for {Math.ceil(stay.guests / stay.rooms)} guests per room</p> : null}
                {room.amenities.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {room.amenities.slice(0, 6).map((a) => (
                      <li key={a} className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-2xs">
                        {HOTEL_AMENITY_LABELS[a] ?? a.replace(/_/g, " ")}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </td>
            );
            if (plans.length === 0) {
              return (
                <tr key={room.id}>
                  {roomCell}
                  <td colSpan={3} className="border-b border-border p-3 text-sm text-text-muted">
                    {room.fitsGuests ? "No rates for these dates." : "Not available for this party size."}
                  </td>
                </tr>
              );
            }
            let first = true;
            return plans.flatMap((plan) =>
              plan.offers.map((o, oi) => {
                const row = (
                  <tr key={`${room.id}-${plan.code}-${o.id}`} className="align-top">
                    {first ? roomCell : null}
                    <td className="border-b border-border p-3">
                      {oi === 0 ? (
                        <>
                          <p className="font-semibold">{plan.name}</p>
                          <ul className="mt-1 space-y-0.5 text-xs">
                            <li className={plan.refundable ? "flex items-center gap-1 font-semibold text-success" : "flex items-center gap-1 text-text-muted"}>
                              {plan.refundable ? <Check aria-hidden className="size-3.5" /> : <X aria-hidden className="size-3.5" />}
                              {plan.refundable ? "Free cancellation" : plan.refundable === false ? "Non-refundable" : "Cancellation policy from provider"}
                            </li>
                            <li className="flex items-center gap-1">
                              <Check aria-hidden className="size-3.5 text-text-muted" /> {plan.boardType ? BOARD_TYPE_LABELS[plan.boardType] : "Meals not specified"}
                            </li>
                            {plan.payLater !== null ? <li className="flex items-center gap-1 text-text-muted">{plan.payLater ? "Pay at the property" : "Pay now (prepaid)"}</li> : null}
                          </ul>
                        </>
                      ) : null}
                    </td>
                    <td className="border-b border-border p-3">
                      <p className="price text-md font-extrabold">{fmtUsd(o.totalPriceCents)}</p>
                      <p className="text-xs text-text-muted">
                        {fmtUsd(o.nightlyPriceCents)} / night · {o.taxesEstimated ? "incl. est. taxes & fees" : o.taxesAndFeesCents !== null ? "incl. taxes & fees" : "taxes not included"}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs">
                        <span className="font-semibold">{o.provider.name}</span>
                        {o.source === "demo" ? <DemoDataBadge size="sm" /> : null}
                      </p>
                    </td>
                    <td className="border-b border-border p-3 text-right">
                      {o.goUrl ? (
                        <a
                          href={(o.goUrl.startsWith("http") ? o.goUrl : PUBLIC_API_URL + o.goUrl) + "?placement=hotel_rooms"}
                          rel="nofollow sponsored noopener"
                          target="_blank"
                          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-hotels px-3 text-sm font-bold text-hotels-fg hover:opacity-90"
                        >
                          View deal <ExternalLink aria-hidden className="size-3.5" />
                        </a>
                      ) : (
                        <span className="inline-flex flex-col items-end gap-1">
                          <button type="button" disabled className="inline-flex h-9 cursor-not-allowed items-center rounded-md bg-surface-3 px-3 text-sm font-bold text-text-muted" title="Demo data — there is no real offer to open" aria-describedby="demo-deal-note">
                            View deal
                          </button>
                          <span className="text-2xs text-text-muted">Demo — not bookable</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
                first = false;
                return row;
              }),
            );
          })}
        </tbody>
      </table>
      <p id="demo-deal-note" className="sr-only">
        Demo offers cannot be opened because they are not real offers.
      </p>
    </div>
  );
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
  const d = res.data;
  const h = d.hotel;
  const demo = h.source === "demo";
  const backQuery = toQueryString({ city: h.city, checkin: d.stay.checkin, checkout: d.stay.checkout, guests: d.stay.guests, rooms: d.stay.rooms });
  const amenityGroups = HOTEL_AMENITY_GROUPS.map((g) => ({ ...g, codes: g.codes.filter((c) => h.amenities.includes(c)) })).filter((g) => g.codes.length);
  const known = new Set(HOTEL_AMENITY_GROUPS.flatMap((g) => g.codes));
  const other = h.amenities.filter((a) => !known.has(a));
  const roomsWithRates = d.rooms.filter((r) => r.ratePlans.some((p) => p.offers.length)).length;
  const r = h.houseRules;

  return (
    <div className="pb-24 lg:pb-10">
      <nav className="sticky top-0 z-sticky border-b border-border bg-surface/95 backdrop-blur" aria-label="Sections">
        <ul className="container-content scrollbar-none flex gap-1 overflow-x-auto">
          {SECTIONS.map(([sid, label]) => (
            <li key={sid}>
              <a href={`#${sid}`} className="inline-flex h-11 items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-semibold hover:border-hotels hover:text-hotels-soft-fg">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="container-content py-4">
        <Crumbs
          items={[
            { label: "Hotels", href: "/travel/hotels" },
            { label: h.city, href: `/travel/hotels/search${backQuery}` },
            { label: h.name },
          ]}
        />
        {demo ? <DemoNotice className="mb-4" /> : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <header id="overview" className="scroll-mt-14">
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span className="rounded-sm bg-hotels-soft px-1.5 py-0.5 font-semibold text-hotels-soft-fg">{HOTEL_PROPERTY_TYPE_LABELS[h.propertyType]}</span>
                <StarClass stars={h.stars} />
                {h.chain ? <span>{h.chain}</span> : null}
                {demo ? <DemoDataBadge size="sm" /> : null}
              </div>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{h.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-sm">
                <MapPin aria-hidden className="size-4 text-hotels" />
                <span>{h.address ?? h.city}</span>
                {h.distanceKm !== null ? <span className="text-text-muted">· {h.distanceKm.toFixed(1)} km from center</span> : null}
                <a href="#location" className="font-semibold text-hotels-soft-fg hover:underline">
                  · Show map
                </a>
              </p>
            </header>

            <div className="mt-4">
              <Gallery hotel={h} />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
              <section aria-labelledby="about">
                <h2 id="about" className="text-lg font-extrabold">
                  About this property
                </h2>
                {h.description ? <p className="mt-2 text-sm leading-relaxed">{h.description}</p> : <p className="mt-2 text-sm text-text-muted">No description provided yet.</p>}
                {h.amenities.length ? (
                  <ul className="mt-4 flex flex-wrap gap-2" aria-label="Most popular facilities">
                    {h.amenities.slice(0, 8).map((a) => {
                      const Icon = AMENITY_ICONS[a] ?? Check;
                      return (
                        <li key={a} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm">
                          <Icon aria-hidden className="size-4 text-success" /> {HOTEL_AMENITY_LABELS[a] ?? a}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
              {h.highlights.length ? (
                <aside className="rounded-lg bg-hotels-soft p-4" aria-labelledby="highlights">
                  <h2 id="highlights" className="font-extrabold text-hotels-soft-fg">
                    Property highlights
                  </h2>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {h.highlights.map((x) => (
                      <li key={x} className="flex gap-2">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-hotels" /> {x}
                      </li>
                    ))}
                  </ul>
                </aside>
              ) : null}
            </div>

            {/* Reviews appear only when a connected provider returns real review data. */}
            {d.reviews ? (
              <section className="mt-6 rounded-lg border border-border p-4" aria-labelledby="reviews" data-testid="reviews">
                <h2 id="reviews" className="text-lg font-extrabold">
                  Guest reviews
                </h2>
                <p className="mt-1 text-sm">
                  <span className="price text-xl font-extrabold">{d.reviews.score}</span>/{d.reviews.scale} from {d.reviews.count} reviews on {d.reviews.provider.name}
                  {d.reviews.url ? (
                    <a href={d.reviews.url} className="ml-2 font-semibold text-hotels-soft-fg hover:underline" rel="nofollow noopener" target="_blank">
                      Read on {d.reviews.provider.name}
                    </a>
                  ) : null}
                </p>
              </section>
            ) : null}

            <section id="rooms" className="mt-8 scroll-mt-14" aria-labelledby="rooms-h">
              <h2 id="rooms-h" className="text-xl font-extrabold">
                Availability
              </h2>
              <p className="mb-3 mt-1 text-sm text-text-muted">
                {new Date(`${d.stay.checkin}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} –{" "}
                {new Date(`${d.stay.checkout}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · {d.stay.guests}{" "}
                {d.stay.guests === 1 ? "guest" : "guests"} · {d.stay.rooms} {d.stay.rooms === 1 ? "room" : "rooms"}. Prices are per stay; taxes & fees marked “est.” are our estimate.
              </p>
              <RoomsTable data={d} />
              <div className="mt-3">
                <ProviderStatusList providers={d.providers} />
              </div>
            </section>

            <section id="facilities" className="mt-8 scroll-mt-14" aria-labelledby="fac-h">
              <h2 id="fac-h" className="text-xl font-extrabold">
                Facilities
              </h2>
              <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {amenityGroups.map((g) => (
                  <div key={g.group}>
                    <h3 className="text-sm font-bold">{g.group}</h3>
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {g.codes.map((c) => (
                        <li key={c} className="flex items-center gap-2">
                          <Check aria-hidden className="size-4 text-success" /> {HOTEL_AMENITY_LABELS[c] ?? c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {other.length ? (
                  <div>
                    <h3 className="text-sm font-bold">Other</h3>
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {other.map((c) => (
                        <li key={c} className="flex items-center gap-2">
                          <Check aria-hidden className="size-4 text-success" /> {c.replace(/_/g, " ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <h3 className="text-sm font-bold">Accessibility</h3>
                  {h.accessibility.length ? (
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {h.accessibility.map((c) => (
                        <li key={c} className="flex items-center gap-2">
                          <Check aria-hidden className="size-4 text-success" /> {HOTEL_ACCESSIBILITY_LABELS[c] ?? c}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-sm text-text-muted">No accessibility features listed — contact the property before booking.</p>
                  )}
                </div>
              </div>
            </section>

            <section id="location" className="mt-8 scroll-mt-14" aria-labelledby="loc-h">
              <h2 id="loc-h" className="text-xl font-extrabold">
                Location
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
                {h.lat !== null && h.lon !== null ? <HotelLocationMap lat={h.lat} lon={h.lon} name={h.name} className="h-72" /> : <p className="text-sm text-text-muted">No map location provided.</p>}
                <div>
                  <h3 className="text-sm font-bold">What&apos;s nearby</h3>
                  <ul className="mt-2 space-y-2 text-sm" data-testid="nearby">
                    {d.nearby.map((n) => (
                      <li key={`${n.kind}-${n.name}`} className="flex items-start justify-between gap-3">
                        <span className="flex items-start gap-1.5">
                          {n.kind === "airport" ? <Plane aria-hidden className="mt-0.5 size-4 shrink-0 text-text-muted" /> : <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-text-muted" />}
                          <span>
                            {n.name}
                            {n.iata ? <span className="text-text-muted"> ({n.iata})</span> : null}
                          </span>
                        </span>
                        <span className="price shrink-0 text-text-muted">{n.distanceKm.toFixed(1)} km</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-2xs text-text-muted">Straight-line distances from our places data.</p>
                  {h.guideSlug ? (
                    <Link href={`/travel/guides/${h.guideSlug}`} className="mt-3 inline-block text-sm font-bold text-hotels-soft-fg hover:underline">
                      Read the {h.city} travel guide
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            <section id="rules" className="mt-8 scroll-mt-14" aria-labelledby="rules-h">
              <h2 id="rules-h" className="text-xl font-extrabold">
                House rules
              </h2>
              <dl className="mt-3 divide-y divide-border rounded-lg border border-border text-sm" data-testid="house-rules">
                {[
                  ["Check-in", r?.checkinFrom ? `From ${r.checkinFrom}${r.checkinUntil ? ` until ${r.checkinUntil}` : ""}` : h.checkinTime ? `From ${h.checkinTime}` : null],
                  ["Check-out", r?.checkoutUntil ? `Until ${r.checkoutUntil}` : h.checkoutTime ? `Until ${h.checkoutTime}` : null],
                  ["Pets", r?.pets ?? null],
                  ["Smoking", r?.smoking ?? null],
                  ["Parties", r?.parties ?? null],
                  ["Age restriction", r?.minCheckinAge ? `Minimum check-in age is ${r.minCheckinAge}` : null],
                  ["Quiet hours", r?.quietHours ?? null],
                ]
                  .filter((x): x is [string, string] => Boolean(x[1]))
                  .map(([k, v]) => (
                    <div key={k} className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr]">
                      <dt className="flex items-center gap-1.5 font-semibold">
                        {k.startsWith("Check") ? <Clock aria-hidden className="size-4 text-text-muted" /> : <Info aria-hidden className="size-4 text-text-muted" />}
                        {k}
                      </dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </section>

            {h.faqs.length ? (
              <section id="faq" className="mt-8 scroll-mt-14" aria-labelledby="faq-h">
                <h2 id="faq-h" className="text-xl font-extrabold">
                  FAQs about {h.name}
                </h2>
                <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                  {h.faqs.map((f) => (
                    <details key={f.q} className="group p-3">
                      <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}</summary>
                      <p className="mt-2 text-sm text-text-muted">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside id="stay" className="scroll-mt-14">
            <div className="lg:sticky lg:top-14">
              <StayPriceBox stay={d.stay} lowestTotal={h.lowestTotalCents} lowestNightly={h.lowestNightlyCents} taxesEstimated={h.taxesEstimated} demo={demo} roomsAvailable={roomsWithRates} />
            </div>
          </aside>
        </div>
      </div>
      <MobileStayBar stay={d.stay} lowestTotal={h.lowestTotalCents} />
    </div>
  );
}
