import { View } from "react-native";
import type { Offer } from "@pricora/contracts";
import { conditionLabel, money, relative, stockLabel } from "@/lib/format";
import { openOffer } from "@/lib/links";
import { track } from "@/lib/analytics";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, Button, DemoBadge, Divider, Row, SponsoredBadge } from "./ui";

const sp = tokens.spacing;

function shippingText(o: Offer): string {
  switch (o.shipping.kind) {
    case "free":
      return "Free shipping";
    case "threshold":
      return "Free shipping over threshold";
    case "paid":
      return o.shipping.costCents !== null ? `${money(o.shipping.costCents, o.currency)} shipping` : "Paid shipping";
    default:
      return "Shipping unknown";
  }
}

function taxText(o: Offer): string {
  switch (o.tax.status) {
    case "estimated":
      return o.tax.amountCents !== null ? `${money(o.tax.amountCents, o.currency)} est. tax` : "Est. tax";
    case "unknown_set_zip":
      return "Tax: set ZIP";
    case "included":
      return "Tax included";
    default:
      return "No tax";
  }
}

/** Stacked offer rows (DESIGN_SYSTEM §13.3 mobile): store + total + Visit store; details below. Sorted by est. total. */
export function OfferList({ offers, productId, lowestOfferId }: { offers: Offer[]; productId: string; lowestOfferId: string | null }) {
  const { c } = useTheme();
  const sorted = [...offers].sort((a, b) => a.estimatedTotalCents - b.estimatedTotalCents);
  return (
    <View>
      {sorted.map((o, i) => (
        <View key={o.id}>
          {i > 0 ? <Divider /> : null}
          <View style={{ paddingVertical: sp[3], gap: sp[2] }}>
            <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Row gap={2}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      backgroundColor: o.retailer.brandColor ?? c["border-strong"],
                    }}
                  />
                  <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {o.retailer.name}
                  </AppText>
                  {o.id === lowestOfferId ? (
                    <AppText variant="caption" color="success">
                      Lowest
                    </AppText>
                  ) : null}
                </Row>
                <Row gap={1} style={{ flexWrap: "wrap" }}>
                  {o.source === "demo" ? <DemoBadge /> : null}
                  {o.sponsored ? <SponsoredBadge /> : null}
                </Row>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <AppText variant="price">{money(o.estimatedTotalCents, o.currency)}</AppText>
                <AppText variant="caption" color="text-muted">
                  est. total
                </AppText>
              </View>
            </Row>
            <AppText variant="caption" color="text-muted">
              {money(o.priceCents, o.currency)} · {shippingText(o)} · {taxText(o)}
            </AppText>
            <AppText variant="caption" color={o.stock === "out_of_stock" ? "warning" : "text-muted"}>
              {conditionLabel[o.condition]} · {stockLabel[o.stock]} · checked {relative(o.lastCheckedAt)}
              {o.couponCode ? ` · Coupon ${o.couponCode}` : ""}
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
                void openOffer(o.id, o.retailer.name);
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
