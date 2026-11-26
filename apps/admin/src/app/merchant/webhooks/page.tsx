import type { Metadata } from "next";
import { ApiPending } from "@/components/api-pending";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@pricora/ui";

export const metadata: Metadata = { title: "Webhooks" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Webhooks" badge={<Badge variant="info" size="sm">Coming soon</Badge>} description="Receive offer, feed and match events at your HTTPS endpoint." />
      <ApiPending feature="Webhooks" label="Coming soon" endpoints={["GET /v1/merchant/webhooks · POST /v1/merchant/webhooks {url, events[]} · DELETE /v1/merchant/webhooks/:id", "POST /v1/merchant/webhooks/:id/test"]} />
    </div>
  );
}
