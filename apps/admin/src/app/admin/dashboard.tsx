"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminStatsQuery } from "@pricora/contracts";
import {
  Badge,
  ErrorState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { count, money, relative } from "@/lib/format";
import { Kpi } from "@/components/kpi";
import { MiniBarChart } from "@/components/mini-chart";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useSession } from "@/components/session-context";
import { useIntegrations } from "@/lib/integrations";

type Range = AdminStatsQuery["range"];
const RANGES: Range[] = ["24h", "7d", "30d", "90d"];

const NO_SOURCE = "No data source yet: /v1/admin/stats does not return this metric. Requested from the API team (A04).";

export function Dashboard() {
  const [range, setRange] = useState<Range>("7d");
  const stats = useQuery({
    queryKey: ["admin", "stats", range],
    queryFn: ({ signal }) => getApi().admin.stats({ range }, { signal }),
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => getApi().health({ signal }),
    refetchInterval: 60_000,
  });

  const { isAdmin } = useSession();
  const integrations = useIntegrations(isAdmin);
  const t = stats.data?.totals;
  const loading = stats.isLoading;
  const v = (n: number | undefined) => (n === undefined ? null : count(n));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={
          stats.data ? `Generated ${relative(stats.data.generatedAt)} · range ${stats.data.range}` : "Platform KPIs from /v1/admin/stats"
        }
        actions={
          <Tabs value={range} onValueChange={(r) => setRange(r as Range)}>
            <TabsList variant="segmented" aria-label="Time range">
              {RANGES.map((r) => (
                <TabsTrigger key={r} value={r}>
                  {r}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {stats.error ? (
        <ErrorState
          title="Stats unavailable"
          description={errorMessage(stats.error)}
          onRetry={() => void stats.refetch()}
          className="rounded-md border border-border bg-surface"
        />
      ) : null}

      {t && t.demoOffers > 0 ? (
        <p className="rounded-md border border-demo-border bg-demo px-3 py-2 text-sm text-demo-fg">
          {count(t.demoOffers)} of {count(t.offers)} offers are demo data (seeded, source = demo). Live retailer connections are not configured yet.
        </p>
      ) : null}

      <section aria-labelledby="kpi-heading" className="flex flex-col gap-3">
        <h2 id="kpi-heading" className="sr-only">
          Key metrics
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Users" loading={loading} value={stats.error ? null : v(t?.users)} hint={t ? `+${count(t.newUsers)} new in ${range}` : undefined} />
          <Kpi label="Products" loading={loading} value={stats.error ? null : v(t?.products)} />
          <Kpi
            label="Active offers"
            loading={loading}
            value={stats.error ? null : v(t?.offers)}
            hint={t ? `${count(t.demoOffers)} demo` : undefined}
          />
          <Kpi
            label="Retailers"
            loading={loading}
            value={stats.error ? null : v(t?.retailers)}
            hint={t ? `${count(t.liveIntegrations)} live integrations` : undefined}
          />
          <Kpi label={`Searches (${range})`} loading={loading} value={stats.error ? null : v(t?.searches)} />
          <Kpi label={`Outbound clicks (${range})`} loading={loading} value={stats.error ? null : v(t?.affiliateClicks)} />
          <Kpi label="Active price alerts" loading={loading} value={stats.error ? null : v(t?.activeAlerts)} />
          <Kpi label="Data freshness" value={null} missingReason={NO_SOURCE} />
          <Kpi
            label="Failed integrations"
            loading={loading}
            value={stats.error ? null : v(t?.openIntegrationErrors)}
            tone={t && t.openIntegrationErrors > 0 ? "error" : "default"}
            hint="Open integration errors"
          />
          <Kpi label="Queue status" value={null} missingReason={NO_SOURCE} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi
            label="Pending match reviews"
            loading={loading}
            value={stats.error ? null : v(t?.pendingMatchReviews)}
            tone={t && t.pendingMatchReviews > 0 ? "warning" : "default"}
          />
          <Kpi label={`Conversions (${range})`} loading={loading} value={stats.error ? null : v(t?.conversions)} hint="Verified network imports only" />
          <Kpi label={`Commission (${range})`} loading={loading} value={stats.error || !t ? null : money(t.commissionCents)} />
        </div>
      </section>

      <IntegrationsCard
        isAdmin={isAdmin}
        integrations={integrations.data?.items.map((i) => i.status)}
        integrationsError={integrations.error}
        adapters={health.data?.adapters.map((a) => a.status)}
      />

      <section className="grid gap-3 lg:grid-cols-3" aria-label="Trends">
        <MiniBarChart title="Searches" points={stats.data?.series.searches ?? []} />
        <MiniBarChart title="Outbound clicks" points={stats.data?.series.clicks ?? []} />
        <MiniBarChart title="Sign-ups" points={stats.data?.series.signups ?? []} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="text-md font-semibold">Top searches</h2>
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead numeric>Count</TableHead>
                  <TableHead>Results</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stats.data?.topSearches ?? []).map((s) => (
                  <TableRow key={s.query}>
                    <TableCell className="max-w-64 truncate">{s.query}</TableCell>
                    <TableCell numeric>{count(s.count)}</TableCell>
                    <TableCell>{s.zeroResults ? <Badge variant="warning" size="sm">Zero results</Badge> : <span className="text-text-muted">OK</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {stats.data && stats.data.topSearches.length === 0 ? (
              <p className="border-t border-border px-4 py-6 text-center text-sm text-text-muted">No searches recorded in this range.</p>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-semibold">System health</h2>
            <Link href="/admin/health" className="text-sm font-medium text-primary hover:underline">
              Details
            </Link>
          </div>
          <div className="rounded-md border border-border bg-surface p-4">
            {health.error ? (
              <p className="text-sm text-error">{errorMessage(health.error)}</p>
            ) : health.data ? (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-text-muted">Overall</dt>
                  <dd className="mt-1">
                    <StatusBadge value={health.data.status} />
                  </dd>
                </div>
                {(["db", "redis", "search"] as const).map((k) => (
                  <div key={k}>
                    <dt className="text-xs text-text-muted">{k === "db" ? "Database" : k === "redis" ? "Redis / queues" : "Search"}</dt>
                    <dd className="mt-1">
                      <StatusBadge value={health.data.checks[k].status} />
                    </dd>
                  </div>
                ))}
                <div className="col-span-2 sm:col-span-4">
                  <dt className="text-xs text-text-muted">Adapters</dt>
                  <dd className="mt-1 text-sm">
                    {count(health.data.adapters.filter((a) => a.status === "live").length)} live ·{" "}
                    {count(health.data.adapters.filter((a) => a.status === "pending_configuration").length)} not connected ·{" "}
                    {count(health.data.adapters.filter((a) => a.status === "error").length)} error
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-text-muted">Checking…</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Integrations summary: admin integrations endpoint when available, else adapter statuses from /v1/health. */
function IntegrationsCard({
  isAdmin,
  integrations,
  integrationsError,
  adapters,
}: {
  isAdmin: boolean;
  integrations: string[] | undefined;
  integrationsError: unknown;
  adapters: string[] | undefined;
}) {
  const statuses = integrations ?? adapters;
  const source = integrations ? "Integrations" : adapters ? "Adapter status from /v1/health" : null;
  const n = (s: string) => (statuses ?? []).filter((x) => x === s).length;
  const body = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2">
      <span className="text-sm font-medium">Integrations</span>
      {statuses ? (
        <>
          <span className="price text-sm">
            <span className="font-semibold text-success">{count(n("live"))}</span> live
          </span>
          <span className="price text-sm">
            <span className="font-semibold">{count(n("pending_configuration"))}</span> not connected
          </span>
          <span className="price text-sm">
            <span className="font-semibold">{count(n("configured"))}</span> configured
          </span>
          <span className="price text-sm">
            <span className={n("error") ? "font-semibold text-error" : "font-semibold"}>{count(n("error"))}</span> error
          </span>
          {n("disabled") ? <span className="price text-sm">{count(n("disabled"))} disabled</span> : null}
          <span className="ml-auto text-xs text-text-muted">
            {source}
            {isAdmin && integrationsError && !integrations ? " (integrations endpoint unavailable)" : ""}
            {isAdmin ? " · Manage →" : ""}
          </span>
        </>
      ) : (
        <span className="text-sm text-text-muted">Loading…</span>
      )}
    </div>
  );
  return isAdmin ? (
    <Link href="/admin/integrations" aria-label="Integrations: manage connections">
      {body}
    </Link>
  ) : (
    body
  );
}
