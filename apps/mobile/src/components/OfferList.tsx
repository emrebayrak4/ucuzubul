import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { conditionGroupOf, type Offer, type StockStatus } from "@pricora/contracts";
import { track } from "@/lib/analytics";
import { conditionGradeLabel, haptic, money, relative, stockLabel } from "@/lib/format";
import { openOffer } from "@/lib/links";
import { tokens } from "@/lib/theme";
import { StoreMark } from "./common";
import { PAY_DISCLAIMER, PayIn4Line, PaymentOptionsList } from "./payments";
import { AppText, Badge, Button, Chip, DemoBadge, Divider, Row, SponsoredBadge } from "./ui";

const sp = tokens.spacing;

export type OfferSort = "total" | "price" | "shipping" | "stock";
const SORTS: { value: OfferSort; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "price", label: "Price" },
  { value: "shipping", label: "Shipping" },
  { value: "stock", label: "In stock" },
];
const STOCK_RANK: Record<StockStatus, number> = { in_stock: 0, low_stock: 1, preorder: 2, unknown: 3, out_of_stock: 4 };
/** Unknown shipping sorts after known costs. */
const shipCost = (o: Offer) => (o.shipping.kind === "free" ? 0 : (o.shipping.costCents ?? Number.MAX_SAFE_INTEGER));

/**
 * Condition badge (web parity): amber "Used · Very good", blue "Refurbished" (+ by whom), gray "Open box".
 * Nothing for new offers.
 */
export function ConditionBadge({ offer: o }: { offer: Offer }) {
  const g = o.conditionGroup ?? conditionGroupOf(o.condition);
  if (g === "new") return null;
  if (g === "used") {
    const label = o.condition === "for_parts" ? "For parts" : o.conditionGrade ? `Used · ${conditionGradeLabel[o.conditionGrade]}` : o.condition === "unknown" ? "Condition unknown" : "Used";
    return <Badge label={label} bg="warning-soft" fg="warning" />;
  }
  if (g === "refurbished") return <Badge label={o.refurbishedBy ? `Refurbished by ${o.refurbishedBy}` : "Refurbished"} bg="info-soft" fg="info" />;
  return <Badge label="Open box" bg="surface-2" fg="text-muted" border="border" />;
}

export function shippingText(o: Offer): string {
  switch (o.shipping.kind) {
    case "free":
      return "Free shipping";
    case "threshold":
      return "Free over threshold";
    case "paid":
      return o.shipping.costCents !== null ? `+${money(o.shipping.costCents, o.currency)} shipping` : "Paid shipping";
    default:
      return "Shipping unknown";
  }
}

function deliveryText(o: Offer): string | null {
  const { estimatedDaysMin: a, estimatedDaysMax: b } = o.shipping;
  if (a === null && b === null) return null;
  if (a !== null && b !== null && a !== b) return `${a}–${b} days`;
  return `${a ?? b} days`;
}

function taxText(o: Offer): string {
  switch (o.tax.status) {
    case "estimated":
      return o.tax.amountCents !== null ? `+${money(o.tax.amountCents, o.currency)} est. tax` : "Est. tax";
    case "unknown_set_zip":
      return "Tax: set ZIP";
    case "included":
      return "Tax included";
    default:
      return "No tax";
  }
}

/**
 * Store table for the product screen (mobile layout: one stacked row per store). Sortable by total, price,
 * shipping or stock. "Visit store" goes through /v1/go/:offerId in the in-app browser. Sponsored offers are
 * labeled and sorted exactly like organic ones.
 */
export function OfferList({
  offers,
  productId,
  lowestOfferId,
  limit,
}: {
  offers: Offer[];
  productId: string;
  lowestOfferId: string | null;
  limit?: number;
}) {
  const [sort, setSort] = useState<OfferSort>("total");
  const [showAll, setShowAll] = useState(false);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const anyPay = offers.some((o) => o.payIn4 || o.paymentOptions?.length);
  const sorted = useMemo(() => {
    const arr = [...offers];
    const by: Record<OfferSort, (a: Offer, b: Offer) => number> = {
      total: (a, b) => a.estimatedTotalCents - b.estimatedTotalCents,
      price: (a, b) => a.priceCents - b.priceCents,
      shipping: (a, b) => shipCost(a) - shipCost(b) || a.estimatedTotalCents - b.estimatedTotalCents,
      stock: (a, b) => STOCK_RANK[a.stock] - STOCK_RANK[b.stock] || a.estimatedTotalCents - b.estimatedTotalCents,
    };
    return arr.sort(by[sort]);
  }, [offers, sort]);
  const shown = limit && !showAll ? sorted.slice(0, limit) : sorted;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: sp[2], paddingBottom: sp[2] }}>
        <AppText variant="caption" color="text-muted" style={{ alignSelf: "center" }}>
          Sort
        </AppText>
        {SORTS.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            selected={sort === s.value}
            onPress={() => {
              haptic.toggle();
              setSort(s.value);
            }}
          />
        ))}
      </ScrollView>
      {shown.map((o, i) => {
        const delivery = deliveryText(o);
        return (
          <View key={o.id}>
            {i > 0 ? <Divider /> : null}
            <View style={{ paddingVertical: sp[3], gap: sp[2] }}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }} gap={3}>
                <Row gap={2} style={{ flex: 1, alignItems: "flex-start" }}>
                  <StoreMark name={o.retailer.name} logoUrl={o.retailer.logoUrl} brandColor={o.retailer.brandColor} size={36} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row gap={2}>
                      <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {o.retailer.name}
                      </AppText>
                      {o.id === lowestOfferId ? (
                        <AppText variant="caption" color="success">
                          Lowest
                        </AppText>
                      ) : null}
                    </Row>
                    <AppText variant="caption" color={o.stock === "out_of_stock" ? "warning" : o.stock === "in_stock" ? "success" : "text-muted"}>
                      {stockLabel[o.stock]}
                    </AppText>
                    {o.seller?.type === "marketplace" ? (
                      <AppText variant="caption" color="text-muted" numberOfLines={1}>
                        Sold by {o.seller.name ?? "a marketplace seller"} (marketplace)
                      </AppText>
                    ) : null}
                    <Row gap={1} style={{ flexWrap: "wrap" }}>
                      <ConditionBadge offer={o} />
                      {o.source === "demo" ? <DemoBadge /> : null}
                      {o.sponsored ? <SponsoredBadge /> : null}
                    </Row>
                  </View>
                </Row>
                <View style={{ alignItems: "flex-end" }}>
                  <AppText variant="price">{money(sort === "price" ? o.priceCents : o.estimatedTotalCents, o.currency)}</AppText>
                  <AppText variant="caption" color="text-muted">
                    {sort === "price" ? "item price" : "est. total"}
                  </AppText>
                  {o.unitPrice ? (
                    <AppText variant="caption" color="text-muted">
                      {o.unitPrice.label}
                    </AppText>
                  ) : null}
                </View>
              </Row>
              <AppText variant="caption" color="text-muted">
                {money(o.priceCents, o.currency)} · {shippingText(o)}
                {delivery ? ` (${delivery})` : ""} · {taxText(o)}
                {o.shipping.pickupAvailable ? " · Pickup" : ""}
              </AppText>
              {o.returnPolicy ? (
                <AppText variant="caption" color="text-muted">
                  Returns: {o.returnPolicy}
                </AppText>
              ) : null}
              <PayIn4Line payIn4={o.payIn4} />
              {o.paymentOptions?.length ? (
                <View style={{ gap: sp[1] }}>
                  <AppText
                    variant="caption"
                    color="primary"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: payOpen === o.id }}
                    onPress={() => setPayOpen(payOpen === o.id ? null : o.id)}
                  >
                    {payOpen === o.id ? "Hide" : "Pay over time"} ({o.paymentOptions.length} {o.paymentOptions.length === 1 ? "option" : "options"})
                  </AppText>
                  {payOpen === o.id ? <PaymentOptionsList options={o.paymentOptions} showDisclaimer={false} /> : null}
                </View>
              ) : null}
              <AppText variant="caption" color="text-muted">
                Checked {relative(o.lastCheckedAt)}
                {o.couponCode ? ` · Coupon ${o.couponCode}${o.couponDescription ? ` (${o.couponDescription})` : ""}` : ""}
              </AppText>
              <Button
                title="Visit store"
                icon="open-outline"
                variant={i === 0 ? "primary" : "secondary"}
                accessibilityLabel={`Visit ${o.retailer.name}, ${money(o.estimatedTotalCents, o.currency)}`}
                onPress={() => {
                  track("offer_clicked", {
                    offerId: o.id,
                    productId,
                    retailerId: o.retailer.id,
                    position: i,
                    priceCents: o.priceCents,
                    isSponsored: o.sponsored,
                    source: o.source,
                  });
                  void openOffer(o.id, o.retailer.name, "app_pdp_offer_table");
                }}
              />
            </View>
          </View>
        );
      })}
      {anyPay ? (
        <AppText variant="caption" color="text-muted" style={{ marginTop: sp[1] }}>
          Pay over time: {PAY_DISCLAIMER}
        </AppText>
      ) : null}
      {limit && sorted.length > limit ? (
        <Button
          title={showAll ? "Show fewer stores" : `Show all ${sorted.length} stores`}
          variant="ghost"
          onPress={() => setShowAll((v) => !v)}
        />
      ) : null}
    </View>
  );
}
