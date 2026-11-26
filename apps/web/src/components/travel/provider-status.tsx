import { CircleCheck, CircleDashed, CircleAlert } from "lucide-react";
import type { ProviderStatus } from "@pricora/contracts";

/** Providers we plan to launch with. Discontinued / enterprise-only adapters are never listed publicly. */
export const PLANNED_PROVIDERS: readonly string[] = ["duffel", "travelpayouts", "hotelbeds", "expedia_rapid", "booking"];

export function plannedOnly(providers: ProviderStatus[]): ProviderStatus[] {
  return providers.filter((p) => PLANNED_PROVIDERS.includes(p.id));
}

const meta = {
  live: { label: "Connected", Icon: CircleCheck, cls: "text-success" },
  pending_configuration: { label: "Not connected", Icon: CircleDashed, cls: "text-text-muted" },
  error: { label: "Error", Icon: CircleAlert, cls: "text-warning" },
} as const;

/** Provider strip: pending providers are shown as "Not connected", never as "no results". */
export function ProviderStatusList({ providers: all }: { providers: ProviderStatus[] }) {
  const providers = plannedOnly(all);
  if (!providers.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface p-3" data-testid="provider-status">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Providers searched</h2>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {providers.map((p) => {
          const m = meta[p.status];
          return (
            <li key={p.id} className="flex items-center gap-1.5 text-sm" title={p.message}>
              <m.Icon aria-hidden className={"size-4 " + m.cls} />
              <span className="font-medium">{p.name}</span>
              <span className={"text-xs " + m.cls}>{m.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PendingProvidersState({ providers, kind }: { providers: ProviderStatus[]; kind: "flights" | "hotels" }) {
  const pending = plannedOnly(providers).filter((p) => p.status === "pending_configuration");
  return (
    <div className="rounded-lg border border-border bg-surface p-6" data-testid="providers-pending">
      <h2 className="text-lg font-semibold">Live {kind === "flights" ? "fares" : "hotel rates"} aren&apos;t available yet</h2>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        We only show real {kind === "flights" ? "fares" : "rates"} returned by travel providers. None of the providers for this search are connected yet
        {pending.length ? ` (${pending.map((p) => p.name).join(", ")} need${pending.length === 1 ? "s" : ""} API credentials)` : ""}, so there are no
        results to show — this isn&apos;t a sign that nothing is available for your trip.
      </p>
      <p className="mt-3 text-sm text-text-muted">Once a provider is configured, results will appear here automatically.</p>
    </div>
  );
}
