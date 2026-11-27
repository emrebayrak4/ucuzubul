"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminAffiliateProgram, EndpointBody } from "@pricora/contracts";
import { Button, EmptyState, ErrorState, Input, Select, Skeleton, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

const KEY = ["admin", "affiliate-programs"] as const;
const NETWORKS = [
  { id: "cj", name: "CJ", kinds: ["coupons", "products", "conversions"] },
  { id: "impact", name: "Impact", kinds: ["coupons", "products", "conversions"] },
  { id: "rakuten", name: "Rakuten", kinds: ["coupons", "products", "conversions"] },
  { id: "awin", name: "Awin", kinds: ["coupons", "products", "conversions"] },
  { id: "partnerize", name: "Partnerize", kinds: ["conversions"] },
  { id: "ebay_partner", name: "eBay Partner Network", kinds: ["conversions"] },
] as const;
type RunNetwork = (typeof NETWORKS)[number]["id"];
type RunKind = "coupons" | "products" | "conversions";

function RetailerLink({ program }: { program: AdminAffiliateProgram }) {
  const [slug, setSlug] = useState(program.retailer?.slug ?? "");
  const save = useApiMutation((body: EndpointBody<"admin.affiliatePrograms.update">) => getApi().request("admin.affiliatePrograms.update", { params: { id: program.id }, body }), {
    success: (p) => (p.retailer ? `Linked to ${p.retailer.name}` : "Unlinked"),
    invalidate: [KEY],
  });
  const dirty = slug.trim() !== (program.retailer?.slug ?? "");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ retailerSlug: slug.trim() === "" ? null : slug.trim() });
      }}
    >
      <Input size="sm" aria-label={`Retailer slug for ${program.name}`} placeholder="retailer slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="w-40" />
      <Button size="sm" variant="secondary" type="submit" disabled={!dirty || save.isPending}>
        Save
      </Button>
    </form>
  );
}

export function AffiliateView() {
  const [network, setNetwork] = useState("");
  const [unmapped, setUnmapped] = useState("");
  const list = useQuery({
    queryKey: [...KEY, network, unmapped],
    queryFn: ({ signal }) =>
      getApi().request("admin.affiliatePrograms.list", {
        signal,
        query: { ...(network ? { network: network as AdminAffiliateProgram["network"] } : {}), ...(unmapped ? { unmapped: unmapped as "true" | "false" } : {}) },
      }),
  });
  const toggle = useApiMutation((v: { id: string; isActive: boolean }) => getApi().request("admin.affiliatePrograms.update", { params: { id: v.id }, body: { isActive: v.isActive } }), {
    success: (p) => `${p.name} ${p.isActive ? "enabled" : "disabled"}`,
    invalidate: [KEY],
  });
  const run = useApiMutation((v: { network: RunNetwork; kind: RunKind }) => getApi().request("admin.affiliateNetworks.run", { params: { network: v.network }, body: { kind: v.kind } }), {
    success: (r) => r.message,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Affiliate programs"
        description="Advertisers reported by connected networks (CJ, Impact, Rakuten, Awin, Partnerize, eBay Partner Network). Link each program to a retailer so its coupons and products are imported. Commissions come only from network conversion reports; nothing is estimated."
      />

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4" aria-labelledby="run-heading">
        <h2 id="run-heading" className="text-sm font-semibold">
          Run a network import now
        </h2>
        <p className="text-xs text-text-muted">Networks without credentials (Admin → Integrations) answer &ldquo;pending configuration&rdquo; and import nothing. Scheduled runs happen automatically.</p>
        <div className="flex flex-wrap gap-4">
          {NETWORKS.map((n) => (
            <div key={n.id} className="flex items-center gap-2">
              <span className="text-sm font-medium">{n.name}</span>
              {n.kinds.map((k) => (
                <Button key={k} size="sm" variant="secondary" disabled={run.isPending} onClick={() => run.mutate({ network: n.id, kind: k })}>
                  {k}
                </Button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Select size="sm" aria-label="Network" value={network} onChange={(e) => setNetwork(e.target.value)} containerClassName="w-52">
          <option value="">All networks</option>
          {NETWORKS.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
        <Select size="sm" aria-label="Mapping" value={unmapped} onChange={(e) => setUnmapped(e.target.value)} containerClassName="w-52">
          <option value="">All programs</option>
          <option value="true">Not linked to a retailer</option>
          <option value="false">Linked</option>
        </Select>
      </div>

      {list.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : list.isError ? (
        <ErrorState title="Could not load programs" description={errorMessage(list.error)} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No affiliate programs yet" description="Programs appear here after a connected network reports its advertisers (first coupon, product or conversion import)." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Network</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Advertiser ID</TableHead>
              <TableHead>Retailer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data.items.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.network}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell className="font-mono text-xs">{p.externalId ?? "—"}</TableCell>
                <TableCell>
                  <RetailerLink program={p} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={p.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.conversions}</TableCell>
                <TableCell>
                  <Switch checked={p.isActive} disabled={toggle.isPending} aria-label={`${p.isActive ? "Disable" : "Enable"} ${p.name}`} onCheckedChange={(isActive) => toggle.mutate({ id: p.id, isActive })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
