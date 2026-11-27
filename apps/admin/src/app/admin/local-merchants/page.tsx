"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Store } from "lucide-react";
import type {
  AdminLocalMerchant,
  AdminLocalMerchantQuery,
  AdminReviewFeedRequest,
  AdminReviewLocationRequest,
  AdminReviewMerchantRequest,
  DataQualityFlag,
} from "@pricora/contracts";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { count, dateTime, relative } from "@/lib/format";
import { BUSINESS_CATEGORY_LABEL, FLAG_SEVERITY_CLASS, GEO_PRECISION_LABEL, LISTING_POLICY } from "@/lib/local";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useSession } from "@/components/session-context";

type StatusTab = AdminLocalMerchantQuery["status"];
const TABS: { value: StatusTab; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "unverified", label: "Unverified" },
  { value: "all", label: "All" },
];
const KEYS = [["admin", "local", "merchants"]];

type Decision = { merchant: AdminLocalMerchant; decision: AdminReviewMerchantRequest["decision"] } | null;

export default function AdminLocalMerchantsPage() {
  const { isAdmin } = useSession();
  const [status, setStatus] = useState<StatusTab>("pending");
  const [page, setPage] = useState(1);
  const [decision, setDecision] = useState<Decision>(null);

  const query = { status, page, pageSize: 20 };
  const q = useQuery({
    queryKey: ["admin", "local", "merchants", query],
    queryFn: ({ signal }) => getApi().admin.local.merchants(query, { signal }),
    placeholderData: keepPreviousData,
  });
  const counts = q.data?.counts;
  const countFor = (t: StatusTab): number | null => {
    if (!counts) return null;
    return t === "all" ? counts.pending + counts.verified + counts.rejected + counts.unverified : counts[t];
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Local sellers"
        description="Moderation queue for self-serve local stores: check business details, compare typed addresses with our ZIP table, and approve locations and feeds before they appear in “Available nearby”."
        badge={counts && counts.pending > 0 ? <Badge variant="warning" size="sm">{counts.pending} pending</Badge> : null}
      />
      {!isAdmin ? (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-muted">View only: approving or rejecting merchants, locations and feeds requires the Admin role.</p>
      ) : null}

      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v as StatusTab);
          setPage(1);
        }}
      >
        <TabsList aria-label="Filter by verification status">
          {TABS.map((t) => {
            const n = countFor(t.value);
            return (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {n !== null ? <span className="price rounded-sm bg-surface-2 px-1.5 text-2xs text-text-muted">{n}</span> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {q.error ? (
        <ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" />
      ) : q.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : q.data && q.data.items.length === 0 ? (
        <EmptyState
          icon={<Store aria-hidden />}
          title={status === "pending" ? "No applications waiting" : "No merchants in this state"}
          description="New local seller applications from the merchant portal show up under Pending."
          className="rounded-md border border-border bg-surface"
        />
      ) : q.data ? (
        <>
          <ul className={cn("flex flex-col gap-4", q.isPlaceholderData && "opacity-60")}>
            {q.data.items.map((m) => (
              <MerchantCard key={m.id} merchant={m} canAct={isAdmin} onDecide={(d) => setDecision({ merchant: m, decision: d })} />
            ))}
          </ul>
          {q.data.totalPages > 1 ? <Pagination page={q.data.page} pageCount={q.data.totalPages} onPageChange={setPage} /> : null}
        </>
      ) : null}

      <DecisionDialog key={decision ? `${decision.merchant.id}-${decision.decision}` : "none"} decision={decision} onClose={() => setDecision(null)} />
    </div>
  );
}

function FlagChips({ flags }: { flags: DataQualityFlag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Data-quality flags">
      {flags.map((f, i) => (
        <li key={`${f.code}-${i}`} title={f.code} className={cn("rounded-full border px-2 py-0.5 text-2xs font-medium", FLAG_SEVERITY_CLASS[f.severity])}>
          <span className="sr-only">{f.severity}: </span>
          {f.message}
        </li>
      ))}
    </ul>
  );
}

function sameText(a: string | null, b: string | null): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function MerchantCard({ merchant: m, canAct, onDecide }: { merchant: AdminLocalMerchant; canAct: boolean; onDecide: (d: AdminReviewMerchantRequest["decision"]) => void }) {
  const reviewLocation = useApiMutation(
    (v: { id: string; body: AdminReviewLocationRequest }) => getApi().admin.local.reviewLocation(v.id, v.body),
    { success: (_d, v) => `Location ${v.body.verificationStatus}`, invalidate: KEYS },
  );
  const reviewFeed = useApiMutation((v: { id: string; body: AdminReviewFeedRequest }) => getApi().admin.local.reviewFeed(v.id, v.body), {
    success: (_d, v) => (v.body.reviewStatus === "verified" ? "Feed approved" : `Feed ${v.body.reviewStatus}`),
    invalidate: KEYS,
  });
  const category = m.businessCategory ? (BUSINESS_CATEGORY_LABEL[m.businessCategory as keyof typeof BUSINESS_CATEGORY_LABEL] ?? m.businessCategory) : null;

  return (
    <li className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5" data-testid="local-merchant-card" data-merchant={m.companyName}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-md font-semibold">{m.companyName}</h2>
            <StatusBadge value={m.verificationStatus} />
            {m.retailer ? (
              <Badge variant={m.retailer.isActive ? "success" : "neutral"} size="sm">
                Retailer {m.retailer.slug} · {m.retailer.isActive ? "active" : "inactive"}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-text-muted">{m.legalName ? `Legal name: ${m.legalName}` : "Legal name not provided"}</p>
        </div>
        {canAct ? (
          <div className="flex flex-wrap gap-2">
            {m.verificationStatus !== "verified" ? (
              <Button size="sm" onClick={() => onDecide("verified")}>
                Approve
              </Button>
            ) : null}
            {m.verificationStatus !== "rejected" ? (
              <Button size="sm" variant="secondary" className="text-error" onClick={() => onDecide("rejected")}>
                Reject
              </Button>
            ) : null}
            {m.verificationStatus !== "pending" ? (
              <Button size="sm" variant="ghost" onClick={() => onDecide("pending")}>
                Back to pending
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-text-muted">Contact</dt>
          <dd className="break-all">{m.contactEmail}</dd>
          <dd>{m.businessPhone ?? "No phone"}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Website</dt>
          <dd className="break-all">
            {m.website ? (
              <a href={m.website} target="_blank" rel="noreferrer noopener nofollow" className="text-primary hover:underline">
                {m.website}
              </a>
            ) : (
              "None"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Category · EIN last 4</dt>
          <dd>
            {category ?? "—"} · <span className="font-mono">{m.einLast4 ? `••-•••${m.einLast4}` : "not provided"}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Submitted · reviewed</dt>
          <dd title={dateTime(m.submittedAt)}>{m.submittedAt ? relative(m.submittedAt) : "—"}</dd>
          <dd className="text-xs text-text-muted">{m.reviewedAt ? `Reviewed ${dateTime(m.reviewedAt)}` : "Not reviewed yet"}</dd>
        </div>
      </dl>
      {m.reviewNote ? <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">Review note: {m.reviewNote}</p> : null}
      <FlagChips flags={m.flags} />

      <div>
        <h3 className="mb-2 text-sm font-medium">Locations ({m.locations.length})</h3>
        {m.locations.length === 0 ? (
          <p className="text-sm text-text-muted">No locations.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store / typed address</TableHead>
                  <TableHead>ZIP table says</TableHead>
                  <TableHead>Geo</TableHead>
                  <TableHead numeric>Inventory</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.locations.map((l) => {
                  const mismatch = l.zipKnown && (!sameText(l.city, l.zipCity) || !sameText(l.state, l.zipState));
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="align-top">
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-text-muted">
                          {l.address1 ?? "—"}, {l.city ?? "—"}, {l.state ?? "—"} {l.zip}
                        </div>
                        <div className="mt-1">
                          <FlagChips flags={l.flags} />
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {l.zipKnown ? (
                          <span className={mismatch ? "font-medium text-warning" : undefined}>
                            {l.zipCity ?? "—"}, {l.zipState ?? "—"}
                            {mismatch ? <span className="block text-2xs">Differs from typed city/state</span> : <span className="block text-2xs text-success">Matches</span>}
                          </span>
                        ) : (
                          <span className="font-medium text-error">ZIP not in table</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-xs">{GEO_PRECISION_LABEL[l.geoPrecision]}</TableCell>
                      <TableCell numeric className="align-top">
                        {count(l.inventoryCount)}
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusBadge value={l.verificationStatus} />
                      </TableCell>
                      <TableCell className="align-top text-right whitespace-nowrap">
                        {canAct ? (
                          <span className="inline-flex gap-1">
                            {l.verificationStatus !== "verified" ? (
                              <Button size="sm" variant="soft" loading={reviewLocation.isPending && reviewLocation.variables?.id === l.id} onClick={() => reviewLocation.mutate({ id: l.id, body: { verificationStatus: "verified" } })}>
                                Verify
                              </Button>
                            ) : null}
                            {l.verificationStatus !== "rejected" ? (
                              <Button size="sm" variant="ghost" className="text-error" onClick={() => reviewLocation.mutate({ id: l.id, body: { verificationStatus: "rejected" } })}>
                                Reject
                              </Button>
                            ) : null}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Feeds ({m.feeds.length})</h3>
        {m.feeds.length === 0 ? (
          <p className="text-sm text-text-muted">No feeds uploaded.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead>Processing</TableHead>
                  <TableHead numeric>Rows accepted / rejected</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.feeds.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-text-muted" title={dateTime(f.uploadedAt)}>
                        Uploaded {relative(f.uploadedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={f.status} />
                    </TableCell>
                    <TableCell numeric>
                      <span className="text-success">{count(f.rowsAccepted)}</span> / <span className={f.rowsRejected ? "text-error" : undefined}>{count(f.rowsRejected)}</span>
                      {f.rowsTotal !== null ? <span className="text-text-muted"> of {count(f.rowsTotal)}</span> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={f.reviewStatus} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {canAct ? (
                        <span className="inline-flex gap-1">
                          {f.reviewStatus !== "verified" ? (
                            <Button size="sm" variant="soft" onClick={() => reviewFeed.mutate({ id: f.id, body: { reviewStatus: "verified" } })}>
                              Approve
                            </Button>
                          ) : null}
                          {f.reviewStatus !== "rejected" ? (
                            <Button size="sm" variant="ghost" className="text-error" onClick={() => reviewFeed.mutate({ id: f.id, body: { reviewStatus: "rejected" } })}>
                              Reject
                            </Button>
                          ) : null}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Store connections ({m.connections.length})</h3>
        {m.connections.length === 0 ? (
          <p className="text-sm text-text-muted">No store platforms connected.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {m.connections.map((c) => (
              <li key={c.provider} className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-medium capitalize">{c.provider.replace(/_/g, " ")}</span>
                  <StatusBadge value={c.status} />
                </span>
                <span className="text-xs text-text-muted">Last sync {c.lastSyncAt ? relative(c.lastSyncAt) : "never"}</span>
                {c.lastError ? <span className="max-w-xs text-xs break-words text-error">{c.lastError}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

const DECISION_COPY: Record<AdminReviewMerchantRequest["decision"], { title: string; confirm: string; text: string }> = {
  verified: {
    title: "Approve local seller?",
    confirm: "Approve",
    text: "The merchant is verified and its verified locations and approved feeds become eligible for “Available nearby”.",
  },
  rejected: { title: "Reject local seller?", confirm: "Reject", text: "The merchant’s store stays hidden from shoppers. The note is shown to the merchant." },
  pending: { title: "Move back to pending?", confirm: "Move to pending", text: "The application returns to the queue for another review." },
};

function DecisionDialog({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const [note, setNote] = useState("");
  const review = useApiMutation(
    (v: { id: string; body: AdminReviewMerchantRequest }) => getApi().admin.local.reviewMerchant(v.id, v.body),
    { success: (m) => `${m.companyName}: ${m.verificationStatus}`, invalidate: KEYS, onSuccess: onClose },
  );
  const copy = decision ? DECISION_COPY[decision.decision] : null;

  return (
    <Dialog open={decision !== null} onOpenChange={(o) => !o && !review.isPending && onClose()}>
      <DialogContent size="sm">
        {decision && copy ? (
          <>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>
                <strong className="text-text">{decision.merchant.companyName}</strong> — {copy.text}
              </DialogDescription>
            </DialogHeader>
            <label className="flex flex-col gap-1.5 text-sm">
              <span>Note (optional, max 1000 characters)</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
              />
            </label>
            {decision.decision === "verified" ? <p className="text-xs text-text-muted">{LISTING_POLICY}</p> : null}
            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={review.isPending}>
                Cancel
              </Button>
              <Button
                variant={decision.decision === "rejected" ? "destructive" : "primary"}
                loading={review.isPending}
                onClick={() => review.mutate({ id: decision.merchant.id, body: { decision: decision.decision, note: note.trim() || undefined } })}
              >
                {copy.confirm}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
