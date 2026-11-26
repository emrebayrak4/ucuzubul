import type { Metadata } from "next";
import { ApiPending } from "@/components/api-pending";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Affiliate programs" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Affiliate programs" description="Affiliate networks and programs (CJ, Impact, Awin, Rakuten, Amazon Associates…): status, commission rates, sub-ID click tracking, conversion imports and reconciliation." />
      <ApiPending feature="Affiliate programs" endpoints={["GET /v1/admin/affiliate-programs → AdminAffiliateProgram {id, network, externalId, retailerSlug, status, commissionRateBp, cookieDays, lastImportAt}", "PATCH /v1/admin/affiliate-programs/:id", "GET /v1/admin/affiliate/conversions (paginated, status pending/confirmed/reversed)", "GET /v1/admin/affiliate/clicks (paginated, subId, kind, retailer)"]}>
        Commissions are only shown from verified network conversion imports; nothing is estimated here.
      </ApiPending>
    </div>
  );
}
