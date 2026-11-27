import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { BasketOptimizeResponse, BasketScenario, ProductCondition } from "@pricora/contracts";
import { ProductImage } from "@/components/product";
import { ZipSheet } from "@/components/ZipSheet";
import { AppText, Badge, Button, Card, Chip, Divider, EmptyState, ErrorState, Notice, OfflineBanner, Row, SectionHeader } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { removeFromBasket, setBasketQty, useBasket } from "@/lib/basket";
import { money } from "@/lib/format";
import { openOffer } from "@/lib/links";
import { tokens, useTheme } from "@/lib/theme";
import { useZip } from "@/lib/zip";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;
const MEMBERSHIPS = [
  { key: "amazon-prime", label: "Amazon Prime" },
  { key: "walmart-plus", label: "Walmart+" },
  { key: "target-circle-card", label: "Target Circle Card" },
];
const SECOND_HAND: ProductCondition[] = ["refurbished", "used", "open_box"];

/** Smart Basket: cheapest way to buy several items (POST /v1/basket/optimize), shipping + estimated tax included. */
export default function BasketScreen() {
  const { c } = useTheme();
  const items = useBasket();
  const { zip } = useZip();
  const [zipOpen, setZipOpen] = useState(false);
  const [memberships, setMemberships] = useState<string[]>([]);
  const [allowSecondHand, setAllowSecondHand] = useState(false);
  const [fulfillment, setFulfillment] = useState<"shipping" | "pickup" | "delivery">("shipping");
  const run = useMutation({
    mutationFn: () =>
      api.basket.optimize({
        items: items.map((i) => ({ productId: i.id, qty: i.qty })),
        zip: zip ?? undefined,
        memberships,
        allowConditions: allowSecondHand ? ["new", ...SECOND_HAND] : ["new"],
        fulfillment,
      }),
  });
  const res = run.data;

  if (!items.length) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <EmptyState
          icon="basket-outline"
          title="Your Smart Basket is empty"
          message="Add products with the basket button on any product page. We'll find the cheapest way to buy them all, shipping and tax included."
          action={{ label: "Browse deals", onPress: () => router.push("/deals") }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ padding: GUTTER, paddingBottom: sp[24], gap: sp[3] }}>
        <AppText color="text-muted">Saved on this device. Quantities 1–99.</AppText>
        <Card padded={false}>
          {items.map((i, idx) => (
            <View key={i.id}>
              {idx ? <Divider /> : null}
              <Row gap={3} style={{ padding: sp[3] }}>
                <ProductImage uri={i.imageUrl} size={48} />
                <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: "/products/[slug]", params: { slug: i.slug } })} accessibilityRole="link">
                  <AppText variant="label" numberOfLines={2}>
                    {i.title}
                  </AppText>
                </Pressable>
                <Row gap={1}>
                  <QtyButton icon="remove" label="Decrease quantity" disabled={i.qty <= 1} onPress={() => setBasketQty(i.id, i.qty - 1)} />
                  <AppText variant="priceSm" style={{ minWidth: 22, textAlign: "center" }}>
                    {i.qty}
                  </AppText>
                  <QtyButton icon="add" label="Increase quantity" disabled={i.qty >= 99} onPress={() => setBasketQty(i.id, i.qty + 1)} />
                  <QtyButton icon="trash-outline" label={`Remove ${i.title}`} onPress={() => removeFromBasket(i.id)} />
                </Row>
              </Row>
            </View>
          ))}
        </Card>

        <Card style={{ gap: sp[2] }}>
          <Row style={{ justifyContent: "space-between" }}>
            <AppText variant="label">{zip ? `Tax estimated for ZIP ${zip}` : "No ZIP: totals exclude tax"}</AppText>
            <Button title={zip ? "Change" : "Set ZIP"} variant="ghost" size="sm" onPress={() => setZipOpen(true)} />
          </Row>
          <AppText variant="label">How do you want to get it?</AppText>
          <Row gap={2} style={{ flexWrap: "wrap" }}>
            {(
              [
                { v: "shipping", l: "Shipping" },
                { v: "pickup", l: "Store pickup" },
                { v: "delivery", l: "Local delivery" },
              ] as const
            ).map((o) => (
              <Chip key={o.v} label={o.l} selected={fulfillment === o.v} onPress={() => setFulfillment(o.v)} />
            ))}
          </Row>
          {fulfillment !== "shipping" && !zip ? (
            <AppText variant="caption" color="warning">
              Pickup and delivery need your ZIP to find nearby stores.
            </AppText>
          ) : null}
          <AppText variant="label">Memberships you have</AppText>
          <Row gap={2} style={{ flexWrap: "wrap" }}>
            {MEMBERSHIPS.map((m) => (
              <Chip
                key={m.key}
                label={m.label}
                icon={memberships.includes(m.key) ? "checkbox" : "square-outline"}
                selected={memberships.includes(m.key)}
                onPress={() => setMemberships((prev) => (prev.includes(m.key) ? prev.filter((x) => x !== m.key) : [...prev, m.key]))}
              />
            ))}
          </Row>
          <Chip
            label="Allow refurbished, used and open-box offers"
            icon={allowSecondHand ? "checkbox" : "square-outline"}
            selected={allowSecondHand}
            onPress={() => setAllowSecondHand((v) => !v)}
          />
        </Card>

        <Button title="Find the cheapest way to buy" icon="flash-outline" size="lg" loading={run.isPending} onPress={() => run.mutate()} />
        {run.isError ? <ErrorState message={errorMessage(run.error)} onRetry={() => run.mutate()} /> : null}
        {res ? <Results res={res} /> : null}
      </ScrollView>
      <ZipSheet visible={zipOpen} onClose={() => setZipOpen(false)} />
    </View>
  );
}

function QtyButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}
    >
      <Ionicons name={icon} size={16} color={c.text} />
    </Pressable>
  );
}

function Results({ res }: { res: BasketOptimizeResponse }) {
  if (!res.scenarios.length) return <Notice tone="warning">None of these products have offers we can combine right now.</Notice>;
  return (
    <View style={{ gap: sp[3] }}>
      <SectionHeader title="Ways to buy" />
      {res.hasDemoData ? <Notice tone="demo">Includes demo prices, not live retailer prices.</Notice> : null}
      {res.scenarios.map((s) => (
        <ScenarioCard key={s.kind} s={s} recommended={res.recommended === s.kind} />
      ))}
    </View>
  );
}

function ScenarioCard({ s, recommended }: { s: BasketScenario; recommended: boolean }) {
  const [open, setOpen] = useState(recommended);
  return (
    <Card style={{ gap: sp[2] }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }} gap={2}>
        <View style={{ flex: 1, gap: 4 }}>
          {recommended ? <Badge label="Recommended" bg="success-soft" fg="success" icon="star" /> : null}
          <AppText variant="h4">{s.label}</AppText>
          <AppText variant="caption" color="text-muted">
            {s.storeCount} {s.storeCount === 1 ? "store" : "stores"} · shipping {money(s.shippingCents)} · tax {s.estimatedTaxCents === null ? "not estimated" : money(s.estimatedTaxCents)}
          </AppText>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <AppText variant="priceLg">{money(s.totalCents)}</AppText>
          {s.savingsCents > 0 ? (
            <AppText variant="caption" color="price-drop">
              Save {money(s.savingsCents)}
            </AppText>
          ) : null}
        </View>
      </Row>
      {s.unavailableProductIds.length ? (
        <AppText variant="caption" color="warning">
          {s.unavailableProductIds.length} item(s) not available in this option.
        </AppText>
      ) : null}
      <Button title={open ? "Hide details" : "Show stores & items"} variant="ghost" size="sm" onPress={() => setOpen((v) => !v)} style={{ alignSelf: "flex-start" }} />
      {open
        ? s.stores.map((st) => (
            <View key={st.retailer.slug} style={{ gap: sp[1] }}>
              <Row style={{ justifyContent: "space-between" }}>
                <AppText variant="label">{st.retailer.name}</AppText>
                <AppText variant="priceSm">{money(st.totalCents)}</AppText>
              </Row>
              {st.lines.map((l) => (
                <Row key={l.offerId} style={{ justifyContent: "space-between" }} gap={2}>
                  <AppText variant="caption" color="text-muted" style={{ flex: 1 }} numberOfLines={1}>
                    {l.qty} × {l.title}
                    {l.sizeLabel ? ` · ${l.sizeLabel}` : ""}
                    {l.unitMeasurePrice ? ` · ${l.unitMeasurePrice.label}` : ""}
                    {l.source === "demo" ? " (demo)" : ""}
                  </AppText>
                  <AppText variant="caption" color="primary" onPress={() => void openOffer(l.offerId, st.retailer.name, "app_basket")}>
                    {money(l.lineTotalCents)} · Visit
                  </AppText>
                </Row>
              ))}
              {st.orderMinimum ? (
                <AppText variant="caption" color={st.orderMinimum.met ? "success" : "warning"}>
                  {st.orderMinimum.kind === "pickup" ? "Pickup" : "Delivery"} minimum {money(st.orderMinimum.minimumCents)}
                  {st.orderMinimum.met ? " — met" : ` — add ${money(st.orderMinimum.gapCents)} more`}
                </AppText>
              ) : st.orderMinimum === null ? (
                <AppText variant="caption" color="text-muted">
                  Order minimum: unknown — check with the store.
                </AppText>
              ) : null}
              {st.freeShippingGapCents ? (
                <AppText variant="caption" color="text-muted">
                  Add {money(st.freeShippingGapCents)} more for free shipping here.
                </AppText>
              ) : null}
            </View>
          ))
        : null}
      {open && s.assumptions.length ? (
        <AppText variant="caption" color="text-muted">
          Assumptions: {s.assumptions.join(" · ")}
        </AppText>
      ) : null}
    </Card>
  );
}
