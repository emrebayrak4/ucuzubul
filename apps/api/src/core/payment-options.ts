/**
 * Pay over time (BNPL / promotional financing) — pure helpers. Shared by API and search indexing.
 *
 * Honesty rules:
 *  - Only options the retailer/provider publicly documents are stored (unknown limits stay null).
 *  - A pay-in-4 estimate is computed ONLY for interest-free 4-installment plans whose published min AND max
 *    are known and contain the order total. Monthly financing payments are never computed (APR varies).
 */
import type { PayIn4, PaymentOption } from "@pricora/contracts";
import type { PrismaClient } from "@pricora/database";

export type PaymentIndex = Map<string, PaymentOption[]>;

/** Loads active options for all retailers, keyed by retailer id. */
export async function loadPaymentIndex(prisma: PrismaClient): Promise<PaymentIndex> {
  const rows = await prisma.retailerPaymentOption.findMany({ where: { isActive: true }, orderBy: [{ planType: "asc" }, { provider: "asc" }] });
  const index: PaymentIndex = new Map();
  for (const r of rows) {
    const list = index.get(r.retailerId) ?? [];
    list.push({
      provider: r.provider,
      planType: r.planType,
      installments: r.installments,
      interestFree: r.interestFree,
      minOrderCents: r.minOrderCents,
      maxOrderCents: r.maxOrderCents,
      limitsScope: r.limitsScope,
      aprMinBp: r.aprMinBp,
      aprMaxBp: r.aprMaxBp,
      promoDescription: r.promoDescription,
      sourceUrl: r.sourceUrl,
      lastVerifiedAt: r.lastVerifiedAt.toISOString(),
    });
    index.set(r.retailerId, list);
  }
  return index;
}

/** Order total is not outside the published limits (unknown limits don't exclude). */
export function withinLimits(o: Pick<PaymentOption, "minOrderCents" | "maxOrderCents">, totalCents: number): boolean {
  return (o.minOrderCents === null || totalCents >= o.minOrderCents) && (o.maxOrderCents === null || totalCents <= o.maxOrderCents);
}

/** Options shown for an order amount. */
export function applicableOptions(options: PaymentOption[] | undefined, totalCents: number): PaymentOption[] {
  return (options ?? []).filter((o) => withinLimits(o, totalCents));
}

/** Interest-free pay-in-4 estimate, or null (requires known min and max that contain the total). */
export function payIn4For(options: PaymentOption[] | undefined, totalCents: number): PayIn4 | null {
  const plan = (options ?? []).find(
    (o) => o.planType === "pay_in_4" && o.interestFree && o.minOrderCents !== null && o.maxOrderCents !== null && totalCents >= o.minOrderCents && totalCents <= o.maxOrderCents,
  );
  if (!plan || totalCents <= 0) return null;
  return { provider: plan.provider, installments: 4, installmentCents: Math.ceil(totalCents / 4), basisTotalCents: totalCents };
}
