import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import type { HotelRate } from "@pricora/contracts";
import { ProviderStrip } from "@/components/travel";
import { AppText, Button, Card, DemoBadge, Divider, ErrorState, Notice, OfflineBanner, Row, SectionHeader, Skeleton } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { money } from "@/lib/format";
import { param } from "@/lib/hooks";
import { openTravelDeal } from "@/lib/links";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const BOARD: Record<NonNullable<HotelRate["boardType"]>, string> = {
  room_only: "Room only",
  breakfast: "Breakfast included",
  half_board: "Half board",
  full_board: "Full board",
  all_inclusive: "All inclusive",
};

export default function HotelDetail() {
  const { c } = useTheme();
  const p = useLocalSearchParams<{ id: string; checkin?: string; checkout?: string; guests?: string; rooms?: string }>();
  const id = param(p.id) ?? "";
  const query = {
    checkin: param(p.checkin),
    checkout: param(p.checkout),
    guests: p.guests ? Number(param(p.guests)) : undefined,
    rooms: p.rooms ? Number(param(p.rooms)) : undefined,
  };
  const res = useQuery({ queryKey: ["hotel", id, query], queryFn: ({ signal }) => api.travel.hotel(id, query, { signal }), enabled: !!id });
  const d = res.data;

  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <OfflineBanner />
        {res.isError ? (
          <ErrorState message={errorMessage(res.error)} onRetry={() => void res.refetch()} />
        ) : (
          <View style={{ padding: sp[4], gap: sp[3] }}>
            <Skeleton height={200} />
            <Skeleton height={24} />
            <Skeleton height={100} />
          </View>
        )}
      </View>
    );
  }

  const h = d.hotel;
  const rates = [...d.rates].sort((a, b) => a.totalPriceCents - b.totalPriceCents);
  const hero = h.images[0] ?? h.imageUrl;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: h.name }} />
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ paddingBottom: sp[12] }}>
        <View style={{ aspectRatio: 16 / 10, backgroundColor: c["surface-2"], alignItems: "center", justifyContent: "center" }}>
          {hero ? (
            <Image source={{ uri: hero }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel={h.name} />
          ) : (
            <Ionicons name="bed-outline" size={48} color={c["text-muted"]} />
          )}
        </View>
        <View style={{ padding: tokens.layout.gutter.base, gap: sp[2] }}>
          <AppText variant="h3">{h.name}</AppText>
          {h.stars ? (
            <AppText variant="caption" color="text-muted">
              {h.stars}-star hotel (category, not a guest rating)
            </AppText>
          ) : null}
          <AppText color="text-muted">{[h.address, h.city, h.region].filter(Boolean).join(", ")}</AppText>
          {h.checkinTime || h.checkoutTime ? (
            <AppText variant="caption" color="text-muted">
              Check-in {h.checkinTime ?? "—"} · Check-out {h.checkoutTime ?? "—"}
            </AppText>
          ) : null}
          {h.source === "demo" ? <Notice tone="demo">This is a demo property with demo rates — not bookable.</Notice> : null}
          <ProviderStrip providers={d.providers} />
          {h.amenities.length ? <AppText>{h.amenities.join(" · ")}</AppText> : null}
          {h.description ? <AppText color="text-muted">{h.description}</AppText> : null}

          <SectionHeader title={`Rates (${rates.length})`} />
          {rates.length === 0 ? (
            <AppText color="text-muted">{query.checkin ? "No rates for these dates." : "Search with dates to see rates."}</AppText>
          ) : (
            <Card padded={false}>
              {rates.map((r, i) => (
                <View key={r.id}>
                  {i ? <Divider /> : null}
                  <View style={{ padding: sp[3], gap: sp[2] }}>
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }} gap={3}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="label">{r.roomName}</AppText>
                        <AppText variant="caption" color="text-muted">
                          {[r.boardType ? BOARD[r.boardType] : null, r.refundable === null ? null : r.refundable ? "Refundable" : "Non-refundable", `via ${r.provider.name}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </AppText>
                        {r.source === "demo" ? <DemoBadge /> : null}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <AppText variant="price">{money(r.totalPriceCents, r.currency)}</AppText>
                        <AppText variant="caption" color="text-muted">
                          {money(r.nightlyPriceCents, r.currency)}/night
                          {r.taxesAndFeesCents !== null ? ` · incl. ${money(r.taxesAndFeesCents, r.currency)} taxes` : " · est. taxes"}
                        </AppText>
                      </View>
                    </Row>
                    <Button
                      title="View deal"
                      icon="open-outline"
                      variant={i === 0 ? "primary" : "secondary"}
                      onPress={() => {
                        track("hotel_offer_clicked", { provider: r.provider.name, hotelId: h.id, position: i, totalCents: r.totalPriceCents });
                        void openTravelDeal("hotel", r.id, r.provider.name);
                      }}
                    />
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
