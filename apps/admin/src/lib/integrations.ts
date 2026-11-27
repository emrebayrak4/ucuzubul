"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminIntegration, AdminIntegrationTestResponse, EndpointBody, IntegrationGroup } from "@pricora/contracts";
import { getApi } from "./api";

export type { AdminIntegration, AdminIntegrationTestResponse };

export const INTEGRATION_GROUPS: { id: IntegrationGroup; label: string }[] = [
  { id: "retail", label: "Retail APIs" },
  { id: "affiliate", label: "Affiliate networks" },
  { id: "travel_flight", label: "Flights" },
  { id: "travel_hotel", label: "Hotels" },
  { id: "auth", label: "Sign-in (Google / Apple)" },
  { id: "payments", label: "Payments" },
  { id: "email", label: "Email (SMTP)" },
  { id: "ai", label: "AI assistant" },
  { id: "monitoring", label: "Monitoring" },
];

export const INTEGRATIONS_KEY = ["admin", "integrations"] as const;

/** Uses the generic contract-typed request (endpoint registry) so it works with any api-client build. */
export function useIntegrations(enabled = true) {
  return useQuery({
    queryKey: INTEGRATIONS_KEY,
    queryFn: ({ signal }) => getApi().request("admin.integrations.list", { signal }),
    enabled,
  });
}

export function saveIntegration(id: string, body: EndpointBody<"admin.integrations.update">) {
  return getApi().request("admin.integrations.update", { params: { id }, body });
}
export function clearIntegration(id: string) {
  return getApi().request("admin.integrations.clear", { params: { id } });
}
export function testIntegration(id: string) {
  return getApi().request("admin.integrations.test", { params: { id } });
}

export type CatalogSourceJob = "channel3-catalog" | "channel3-refresh" | "kroger-catalog" | "icecat-enrich";
/** Integrations whose catalog jobs can be queued now from the sheet (otherwise they run on the worker schedule). */
export const CATALOG_SOURCE_JOBS: Record<string, { job: CatalogSourceJob; label: string; hint: string }[]> = {
  channel3: [
    { job: "channel3-catalog", label: "Import products", hint: "One search per category (uses Channel3 credits; capped at 30 per run, 900 per month)." },
    { job: "channel3-refresh", label: "Refresh prices", hint: "Free product-detail refresh of Channel3 offers." },
  ],
  kroger: [{ job: "kroger-catalog", label: "Import grocery products", hint: "Kroger search for every grocery category at the configured store (free)." }],
  icecat: [{ job: "icecat-enrich", label: "Enrich products", hint: "Adds Icecat images and specs to products with a UPC/EAN." }],
};
export function runCatalogSource(job: CatalogSourceJob) {
  return getApi().request("admin.catalogSources.run", { params: { job } });
}

/** Test outcome → pass/fail for the UI. `unverified` = reachable but credentials could not be fully verified. */
export function testPassed(status: AdminIntegrationTestResponse["status"]): boolean {
  return status === "live";
}
