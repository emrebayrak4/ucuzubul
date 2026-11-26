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

/** Test outcome → pass/fail for the UI. `unverified` = reachable but credentials could not be fully verified. */
export function testPassed(status: AdminIntegrationTestResponse["status"]): boolean {
  return status === "live";
}
