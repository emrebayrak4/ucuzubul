import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, View } from "react-native";
import type { NearbyAvailability } from "@pricora/contracts";
import { api } from "@/lib/api";
import { money, relative } from "@/lib/format";
import { tokens } from "@/lib/theme";
import { useZip } from "@/lib/zip";
import { StoreMark } from "./common";
import { ZipSheet } from "./ZipSheet";
import { AppText, Badge, Button, Card, DemoBadge, Divider, Row, SectionHeader, SponsoredBadge } from "./ui";

const sp = tokens.spacing;
const STOCK: Record<NearbyAvailability["stock"], { label: string; color: "success" | "warning" | "error" | "text-muted" }> = {
  in_stock: { label: "In stock", color: "success" },
  limited: { label: "Limited stock", color: "warning" },
  out_of_stock: { label: "Out of stock", color: "error" },
  unknown: { label: "Stock unknown", color: "text-muted" },
};

function Row1({ a }: { a: NearbyAvailability }) {
  const s = STOCK[a.stock];
  const l = a.location;
  const approx = l.geoPrecision === "zip_centroid";
  return (
    <View style={{ paddingVertical: sp[2.5], gap: 4 }}>
      <Row gap={3} style={{ alignItems: "flex-start" }}>
        <StoreMark name={l.retailer.name} logoUrl={l.retailer.logoUrl} brandColor={l.retailer.brandColor} size={32} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" numberOfLines={1}>
            {l.name}
          </AppText>
          <AppText variant="caption" color="text-muted" numberOfLines={1}>
            {a.distanceMi.toFixed(1)} mi{approx ? " (approx.)" : ""}
            {l.address1 ? ` · ${l.address1}` : ""}
            {l.city ? `, ${l.city}` : ""}
          </AppText>
          <AppText variant="caption" color={s.color}>
            {s.label}
            {a.pickupToday ? " · Pickup today" : ""}
            {a.deliversToYou ? " · Delivers to you" : ""}
          </AppText>
          <Row gap={1} style={{ flexWrap: "wrap" }}>
            {a.sponsored ? <SponsoredBadge /> : null}
            {a.source === "demo" ? <DemoBadge /> : null}
            {!l.verified ? <Badge label="Unverified store" bg="surface-2" fg="text-muted" /> : null}
          </Row>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <AppText variant="priceSm">{a.priceCents !== null ? money(a.priceCents, a.currency) : "Ask store"}</AppText>
          {a.unitPrice ? (
            <AppText variant="caption" color="text-muted">
              {a.unitPrice.label}
            </AppText>
          ) : null}
          <AppText variant="caption" color="text-muted">
            {relative(a.lastCheckedAt)}
          </AppText>
        </View>
      </Row>
      {l.phone ? <Button title="Call store" variant="ghost" size="sm" icon="call-outline" style={{ alignSelf: "flex-start" }} onPress={() => void Linking.openURL(`tel:${l.phone}`)} /> : null}
    </View>
  );
}

/**
 * "Available nearby" (GET /v1/products/:slug/nearby): organic stores by distance, then at most one separately
 * labeled Sponsored listing that never re-orders the organic list. Needs a ZIP (prompt otherwise).
 */
export function NearbySection({ slug }: { slug: string }) {
  const { zip } = useZip();
  const [zipOpen, setZipOpen] = useState(false);
  const [all, setAll] = useState(false);
  const q = useQuery({
    queryKey: ["product", "nearby", slug, zip ?? null],
    queryFn: ({ signal }) => api.local.nearby(slug, zip ? { zip } : undefined, { signal }),
    staleTime: 5 * 60_000,
  });
  const d = q.data;
  if (!d || (d.status === "ok" && !d.items.length && !d.sponsored.length)) return null;
  const items = all ? d.items : d.items.slice(0, 3);
  return (
    <>
      <SectionHeader title="Available nearby" />
      <Card style={{ gap: sp[1] }}>
        {d.status === "set_zip" ? (
          <>
            <AppText color="text-muted">Set your ZIP to see stores near you that carry this product.</AppText>
            <Button title="Set ZIP" variant="secondary" size="sm" icon="location-outline" style={{ alignSelf: "flex-start" }} onPress={() => setZipOpen(true)} />
          </>
        ) : d.status === "unknown_zip" ? (
          <>
            <AppText color="text-muted">We don’t have store coverage for ZIP {zip} yet.</AppText>
            <Button title="Change ZIP" variant="ghost" size="sm" onPress={() => setZipOpen(true)} style={{ alignSelf: "flex-start" }} />
          </>
        ) : (
          <>
            <AppText variant="caption" color="text-muted">
              Within {d.radiusMi} mi of {d.origin?.zip}
              {d.origin?.city ? ` (${d.origin.city}${d.origin.state ? `, ${d.origin.state}` : ""})` : ""} ·{" "}
              <AppText variant="caption" color="primary" onPress={() => setZipOpen(true)}>
                change
              </AppText>
            </AppText>
            {items.map((a, i) => (
              <View key={a.location.id}>
                {i ? <Divider /> : null}
                <Row1 a={a} />
              </View>
            ))}
            {d.items.length > 3 ? <Button title={all ? "Show fewer stores" : `Show all ${d.items.length} stores`} variant="ghost" size="sm" onPress={() => setAll((v) => !v)} /> : null}
            {d.sponsored.length ? (
              <View style={{ marginTop: sp[2] }}>
                <AppText variant="overline" color="text-muted">
                  Sponsored
                </AppText>
                {d.sponsored.slice(0, 1).map((a) => (
                  <Row1 key={a.location.id} a={a} />
                ))}
              </View>
            ) : null}
            {d.online ? (
              <AppText variant="caption" color="text-muted">
                Online: {money(d.online.priceCents)} at {d.online.retailerName}
                {d.online.source === "demo" ? " (demo)" : ""}
              </AppText>
            ) : null}
            {d.hasDemoData ? (
              <AppText variant="caption" color="text-muted">
                Includes demo store data, not live inventory.
              </AppText>
            ) : null}
          </>
        )}
      </Card>
      <ZipSheet visible={zipOpen} onClose={() => setZipOpen(false)} />
    </>
  );
}
