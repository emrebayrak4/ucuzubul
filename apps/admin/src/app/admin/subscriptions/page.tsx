import type { Metadata } from "next";
import { ApiPending } from "@/components/api-pending";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Subscriptions & plans" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Subscriptions & plans" description="Premium plans with admin-editable pricing (integer cents) and the subscriber list. Billing runs on Stripe once keys are configured." />
      <ApiPending feature="Subscriptions & plans" endpoints={["GET /v1/admin/plans → {items: Plan {id, key, name, priceCents, currency, interval: month|year, isActive, stripePriceId|null}}", "POST /v1/admin/plans · PATCH /v1/admin/plans/:id (priceCents, isActive, name)", "GET /v1/admin/subscriptions (paginated: user email, plan, status, currentPeriodEnd)"]}>
        Stripe is pending configuration (STRIPE_SECRET_KEY empty), so no checkout or subscriber data exists yet.
      </ApiPending>
    </div>
  );
}
