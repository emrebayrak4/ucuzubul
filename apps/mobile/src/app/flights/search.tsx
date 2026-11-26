import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import type { CabinClass, FlightOffer, FlightSlice } from "@pricora/contracts";
import { formatDuration, formatTravelDate } from "@pricora/utils";
import { RowSkeleton } from "@/components/product";
import { ProviderStrip } from "@/components/travel";
import { AppText, Badge, Button, Card, DemoBadge, EmptyState, ErrorState, Notice, OfflineBanner, Row, Segmented } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { isDemo, money } from "@/lib/format";
import { param } from "@/lib/hooks";
import { openTravelDeal } from "@/lib/links";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
type Sort = "best" | "cheapest" | "fastest";

const timeOf = (iso: string) => {
  // Show local time at the airport as given by the provider offset (HH:MM from the ISO string).
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return "";
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
const totalMinutes = (o: FlightOffer) => o.slices.reduce((s, x) => s + x.durationMinutes, 0);

export default function FlightResults() {
  const p = useLocalSearchParams<{ from: string; to: string; depart: string; return?: string; adults?: string; cabin?: string }>();
  const query = {
    from: param(p.from) ?? "",
    to: param(p.to) ?? "",
    depart: param(p.depart) ?? "",
    return: param(p.return),
    adults: Number(param(p.adults) ?? 1),
    cabin: (param(p.cabin) ?? "economy") as CabinClass,
  };
  const [sort, setSort] = useState<Sort>("best");
  const res = useQuery({
    queryKey: ["flights", query],
    queryFn: ({ signal }) => api.travel.flights(query, { signal }),
    staleTime: 5 * 60_000,
  });
  const d = res.data;

  useEffect(() => {
    if (!d) return;
    track("flight_search", {
      origin: query.from,
      destination: query.to,
      tripType: query.return ? "round_trip" : "one_way",
      cabin: query.cabin,
      passengers: query.adults,
      daysToDeparture: Math.max(0, Math.round((Date.parse(query.depart) - Date.now()) / 86_400_000)),
      providerCount: d.providers.length,
      resultCount: d.offers.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  // Tags computed honestly from the current result set.
  const tags = useMemo(() => {
    const offers = d?.offers ?? [];
    if (!offers.length) return { cheapest: null as string | null, fastest: null as string | null };
    const cheapest = offers.reduce((a, b) => (b.totalPriceCents < a.totalPriceCents ? b : a)).id;
    const fastest = offers.reduce((a, b) => (totalMinutes(b) < totalMinutes(a) ? b : a)).id;
    return { cheapest, fastest };
  }, [d]);

  const sorted = useMemo(() => {
    const offers = [...(d?.offers ?? [])];
    if (sort === "cheapest") offers.sort((a, b) => a.totalPriceCents - b.totalPriceCents);
    else if (sort === "fastest") offers.sort((a, b) => totalMinutes(a) - totalMinutes(b));
    return offers;
  }, [d, sort]);

  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <FlatList
        data={sorted}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: tokens.layout.gutter.base, gap: sp[3], paddingBottom: sp[12] }}
        ListHeaderComponent={
          <View style={{ gap: sp[3] }}>
            <AppText variant="h3">
              {query.from} → {query.to}
            </AppText>
            <AppText color="text-muted">
              {formatTravelDate(query.depart)}
              {query.return ? ` – ${formatTravelDate(query.return)}` : " · one way"} · {query.adults} {query.adults === 1 ? "adult" : "adults"}
            </AppText>
            {d ? <ProviderStrip providers={d.providers} /> : null}
            {d && isDemo(d.source) ? <Notice tone="demo">These fares are demo data, not bookable live prices.</Notice> : null}
            {d?.offers.length ? (
              <Segmented
                options={[
                  { value: "best", label: "Best" },
                  { value: "cheapest", label: "Cheapest" },
                  { value: "fastest", label: "Fastest" },
                ]}
                value={sort}
                onChange={setSort}
              />
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <FlightCard o={item} adults={query.adults} cheapest={item.id === tags.cheapest} fastest={item.id === tags.fastest} position={index} />
        )}
        ListEmptyComponent={
          res.isPending ? (
            <RowSkeleton count={4} />
          ) : res.isError ? (
            <ErrorState message={errorMessage(res.error)} onRetry={() => void res.refetch()} />
          ) : d && d.providers.every((pr) => pr.status !== "live") && d.source === "none" ? (
            <EmptyState icon="airplane-outline" title="No flight providers connected yet" message="Flight search goes live once a fare provider is configured. We don't show made-up fares." />
          ) : (
            <EmptyState icon="airplane-outline" title="No flights found" message="Try different dates or nearby airports." />
          )
        }
      />
    </View>
  );
}

function SliceRow({ s }: { s: FlightSlice }) {
  const plus = dayDiff(s.departAt, s.arriveAt);
  const via = s.segments.slice(0, -1).map((seg) => seg.to);
  return (
    <Row style={{ justifyContent: "space-between" }} gap={2}>
      <View>
        <AppText variant="priceSm">{timeOf(s.departAt)}</AppText>
        <AppText variant="caption" color="text-muted">
          {s.from}
        </AppText>
      </View>
      <View style={{ flex: 1, alignItems: "center" }}>
        <AppText variant="caption" color="text-muted">
          {formatDuration(s.durationMinutes)}
        </AppText>
        <AppText variant="caption" color={s.stops === 0 ? "success" : "text-muted"}>
          {s.stops === 0 ? "Nonstop" : `${s.stops} stop${s.stops > 1 ? "s" : ""}${via.length ? ` · ${via.join(", ")}` : ""}`}
        </AppText>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <AppText variant="priceSm">
          {timeOf(s.arriveAt)}
          {plus > 0 ? ` +${plus}` : ""}
        </AppText>
        <AppText variant="caption" color="text-muted">
          {s.to}
        </AppText>
      </View>
    </Row>
  );
}

function FlightCard({ o, adults, cheapest, fastest, position }: { o: FlightOffer; adults: number; cheapest: boolean; fastest: boolean; position: number }) {
  const carriers = [...new Set(o.slices.flatMap((s) => s.segments.map((seg) => seg.marketingCarrier.name)))];
  return (
    <Card style={{ gap: sp[3] }}>
      <Row gap={1} style={{ flexWrap: "wrap" }}>
        {cheapest ? <Badge label="Cheapest" bg="surface-2" fg="text" /> : null}
        {fastest ? <Badge label="Fastest" bg="surface-2" fg="text" /> : null}
        {o.source === "demo" ? <DemoBadge /> : null}
      </Row>
      <AppText variant="caption" color="text-muted">
        {carriers.join(", ")}
      </AppText>
      {o.slices.map((s, i) => (
        <SliceRow key={i} s={s} />
      ))}
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <AppText variant="priceLg">{money(o.totalPriceCents, o.currency)}</AppText>
          <AppText variant="caption" color="text-muted">
            {adults > 1 ? `total for ${adults} · ${money(o.pricePerAdultCents, o.currency)} per adult` : "total incl. taxes"} · via {o.provider.name}
          </AppText>
        </View>
      </Row>
      <Button
        title="View deal"
        icon="open-outline"
        onPress={() => {
          track("flight_offer_clicked", { provider: o.provider.name, position, totalCents: o.totalPriceCents, stops: Math.max(...o.slices.map((s) => s.stops)) });
          void openTravelDeal("flight", o.id, o.provider.name);
        }}
      />
    </Card>
  );
}
