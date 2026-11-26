"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsList, TabsTrigger } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { count, money, pct } from "@/lib/format";
import { Kpi } from "@/components/kpi";
import { MiniBarChart } from "@/components/mini-chart";
import { PageHeader } from "@/components/page-header";

type Range = "7d" | "30d" | "90d";

export default function MerchantAnalyticsPage() {
  const [range, setRange] = useState<Range>("30d");
  const q = useQuery({
    queryKey: ["merchant", "analytics", range],
    queryFn: ({ signal }) => getApi().merchant.analytics({ range }, { signal }),
  });
  const d = q.data;
  const loading = q.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Click analytics"
        description="Impressions and outbound clicks to your store from our listings. Conversions/revenue appear only when reported by an affiliate network."
        actions={
          <Tabs value={range} onValueChange={(r) => setRange(r as Range)}>
            <TabsList variant="segmented" aria-label="Range">
              {(["7d", "30d", "90d"] as const).map((r) => (
                <TabsTrigger key={r} value={r}>
                  {r}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />
      {q.error ? <ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" /> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Impressions" loading={loading} value={d ? count(d.impressions) : null} />
        <Kpi label="Clicks" loading={loading} value={d ? count(d.clicks) : null} />
        <Kpi label="CTR" loading={loading} value={d ? (d.impressions > 0 ? pct(d.ctr, 2) : null) : null} missingReason="No impressions in this range" />
        <Kpi label="Conversions" loading={loading} value={d ? count(d.conversions) : null} hint="Network-reported" />
        <Kpi label="Revenue" loading={loading} value={d ? money(d.revenueCents) : null} hint="Network-reported" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <MiniBarChart title="Clicks" points={(d?.series ?? []).map((p) => ({ t: p.t, value: p.clicks }))} />
        <MiniBarChart title="Impressions" points={(d?.series ?? []).map((p) => ({ t: p.t, value: p.impressions }))} />
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-md font-semibold">Top products by clicks</h2>
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead numeric>Clicks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(d?.topProducts ?? []).map((p) => (
                <TableRow key={p.productSlug}>
                  <TableCell>
                    <div className="font-medium">{p.title}</div>
                    <div className="font-mono text-xs text-text-muted">{p.productSlug}</div>
                  </TableCell>
                  <TableCell numeric>{count(p.clicks)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {d && d.topProducts.length === 0 ? <p className="border-t border-border p-4 text-center text-sm text-text-muted">No clicks recorded in this range.</p> : null}
        </div>
      </section>
    </div>
  );
}
