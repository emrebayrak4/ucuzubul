import type { Metadata } from "next";
import { ApiPending } from "@/components/api-pending";
import { PageHeader } from "@/components/page-header";
import { SponsoredLabel } from "@pricora/ui";

export const metadata: Metadata = { title: "Sponsored campaigns" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sponsored campaigns" badge={<SponsoredLabel />} description="Paid placements (sponsored rails/tiles). Every sponsored unit renders a visible “Sponsored” label, never takes the organic “Best price” slot and never changes ranking or Deal Score." />
      <ApiPending feature="Sponsored campaigns" endpoints={["GET /v1/admin/campaigns → paginated Campaign {id, advertiser, placement, productIds, startsAt, endsAt, budgetCents, status, impressions, clicks}", "POST /v1/admin/campaigns · PATCH /v1/admin/campaigns/:id (pause/resume)"]}>
        The feature flag sponsored.placements is off by default (see Feature flags).
      </ApiPending>
    </div>
  );
}
