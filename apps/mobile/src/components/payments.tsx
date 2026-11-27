import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";
import type { PayIn4, PaymentOption } from "@pricora/contracts";
import { brand } from "@/lib/config";
import { money, relative } from "@/lib/format";
import { tokens } from "@/lib/theme";
import { AppText } from "./ui";

/**
 * Pay-over-time (BNPL / financing) copy rules (shopping session, @pricora/contracts PaymentOption / PayIn4):
 * - "Interest-free" only for pay-in-4 with interestFree=true (PayIn4 is only ever set for those).
 * - Monthly plans: "Monthly financing available, APR varies" — never compute a monthly payment.
 * - Always "subject to approval"; WhichLess doesn't offer credit. Zip (interestFree=false): "fees may apply".
 * - Provider names as text only, no logos.
 */
export const PAY_DISCLAIMER = `Subject to approval by the provider. ${brand.name} doesn't offer credit.`;

/** "or 4 × $24.75 with Affirm" (+ "interest-free" when not compact). */
export function PayIn4Line({ payIn4, compact = false }: { payIn4: PayIn4 | null | undefined; compact?: boolean }) {
  if (!payIn4) return null;
  return (
    <AppText variant="caption" color="text-muted" numberOfLines={compact ? 1 : 2}>
      or 4 × {money(payIn4.installmentCents)} {compact ? `· ${payIn4.provider}` : `with ${payIn4.provider} · interest-free, subject to approval`}
    </AppText>
  );
}

function limits(o: PaymentOption): string | null {
  if (o.minOrderCents === null && o.maxOrderCents === null) return null;
  const lo = o.minOrderCents !== null ? money(o.minOrderCents, "USD", "auto") : null;
  const hi = o.maxOrderCents !== null ? money(o.maxOrderCents, "USD", "auto") : null;
  const range = lo && hi ? `orders ${lo}–${hi}` : lo ? `orders from ${lo}` : `orders up to ${hi}`;
  return o.limitsScope === "provider_general" ? `${range} (provider's general limits)` : range;
}

export function paymentOptionText(o: PaymentOption): { title: string; detail: string | null } {
  switch (o.planType) {
    case "pay_in_4":
      return {
        title: `${o.provider} · Pay in ${o.installments ?? 4}`,
        detail: [o.interestFree ? "interest-free" : "fees may apply", limits(o)].filter(Boolean).join(" · "),
      };
    case "monthly_financing":
      return { title: `${o.provider} · Monthly financing available, APR varies`, detail: limits(o) };
    case "store_card_promo":
      return { title: `${o.provider}${o.promoDescription ? ` · ${o.promoDescription}` : " · Store card offer"}`, detail: limits(o) };
  }
}

/** Full list for the store screen / an offer: provider text, plan, limits, last verified + source link. */
export function PaymentOptionsList({ options, showDisclaimer = true }: { options: PaymentOption[]; showDisclaimer?: boolean }) {
  if (!options.length) return null;
  return (
    <View style={{ gap: tokens.spacing[2] }}>
      {options.map((o, i) => {
        const t = paymentOptionText(o);
        return (
          <View key={`${o.provider}-${o.planType}-${i}`} style={{ gap: 2 }}>
            <AppText variant="label">{t.title}</AppText>
            <AppText variant="caption" color="text-muted">
              {t.detail ? `${t.detail} · ` : ""}verified {relative(o.lastVerifiedAt)} ·{" "}
              <AppText variant="caption" color="primary" onPress={() => void WebBrowser.openBrowserAsync(o.sourceUrl)} accessibilityRole="link">
                source
              </AppText>
            </AppText>
          </View>
        );
      })}
      {showDisclaimer ? (
        <AppText variant="caption" color="text-muted">
          {PAY_DISCLAIMER}
        </AppText>
      ) : null}
    </View>
  );
}
