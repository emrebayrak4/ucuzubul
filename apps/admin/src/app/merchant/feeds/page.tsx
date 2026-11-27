"use client";

import { useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, FileUp, Upload } from "lucide-react";
import { MERCHANT_FEED_COLUMNS, type MerchantFeed } from "@pricora/contracts";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Pagination,
  PriceTag,
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
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { checkFeed, SAMPLE_HEADER, type FeedCheck } from "@/lib/feed-csv";
import { count, dateTime, humanize, relative } from "@/lib/format";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Field } from "@/components/field";

const MAX_BYTES = 10 * 1024 * 1024;
const PREVIEW_PAGE = 50;

export default function FeedsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [check, setCheck] = useState<FeedCheck | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "errors" | "ok">("errors");
  const [previewPage, setPreviewPage] = useState(1);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<MerchantFeed | null>(null);

  const feeds = useQuery({
    queryKey: ["merchant", "feeds", page],
    queryFn: ({ signal }) => getApi().merchant.feeds.list({ page, pageSize: 10 }, { signal }),
    placeholderData: keepPreviousData,
    // Poll while any upload is still being processed.
    refetchInterval: (q) => (q.state.data?.items.some((f) => f.status === "queued" || f.status === "processing") ? 5000 : false),
  });

  // Local stores (no website needed): url may be empty → in-store-only listing under "Available nearby".
  const local = useQuery({ queryKey: ["merchant", "local", "status"], queryFn: ({ signal }) => getApi().merchant.local.status({ signal }), retry: false });
  const urlOptional = local.data?.merchant.isLocalSeller === true;

  const upload = useApiMutation(
    (v: { file: File; name: string }) => {
      const form = new FormData();
      form.set("file", v.file);
      form.set("name", v.name);
      form.set("format", "csv");
      return getApi().merchant.feeds.upload(form);
    },
    {
      success: (f) => `Feed “${f.name}” uploaded — ${humanize(f.status)}`,
      invalidate: [["merchant", "feeds"], ["merchant", "offers"]],
      onSuccess: (f) => {
        setFile(null);
        setCheck(null);
        setName("");
        if (fileRef.current) fileRef.current.value = "";
        setDetail(f);
      },
    },
  );

  async function onFile(f: File | null) {
    setReadError(null);
    setCheck(null);
    setFile(f);
    setPreviewPage(1);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setReadError("File is larger than 10 MB. Split the feed into smaller files.");
      return;
    }
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) {
      setReadError("Only CSV/TSV files are supported here (XML feeds: coming later).");
      return;
    }
    setName((n) => n || f.name.replace(/\.[^.]+$/, ""));
    const text = await f.text();
    setCheck(checkFeed(text, { urlOptional }));
  }

  const summary = useMemo(() => {
    if (!check) return null;
    const ok = check.rows.filter((r) => r.ok).length;
    return { ok, bad: check.rows.length - ok, total: check.rows.length };
  }, [check]);

  const filteredRows = useMemo(
    () => (check ? check.rows.filter((r) => (filter === "all" ? true : filter === "ok" ? r.ok : !r.ok)) : []),
    [check, filter],
  );
  const pageRows = filteredRows.slice((previewPage - 1) * PREVIEW_PAGE, previewPage * PREVIEW_PAGE);
  const blocked = !check || check.missingRequired.length > 0 || (summary?.ok ?? 0) === 0;

  const feedColumns: Column<MerchantFeed>[] = [
    { key: "name", header: "Feed", cell: (f) => <span className="font-medium">{f.name}</span> },
    { key: "format", header: "Format", cell: (f) => <span className="font-mono text-xs uppercase">{f.format}</span> },
    { key: "status", header: "Status", cell: (f) => <StatusBadge value={f.status} /> },
    { key: "total", header: "Rows", numeric: true, cell: (f) => count(f.rowsTotal) },
    { key: "acc", header: "Accepted", numeric: true, cell: (f) => <span className="text-success">{count(f.rowsAccepted)}</span> },
    { key: "rej", header: "Rejected", numeric: true, cell: (f) => <span className={f.rowsRejected ? "text-error" : undefined}>{count(f.rowsRejected)}</span> },
    { key: "uploaded", header: "Uploaded", cell: (f) => <span title={dateTime(f.uploadedAt)}>{relative(f.uploadedAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (f) => (
        <Button size="sm" variant="ghost" onClick={() => setDetail(f)}>
          Results{f.errors.length ? ` (${f.errors.length})` : ""}
        </Button>
      ),
    },
  ];

  function downloadTemplate() {
    const blob = new Blob([SAMPLE_HEADER + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "feed-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Feed upload"
        description="Upload a product feed (CSV, Google Merchant-style columns). Rows are checked in your browser first; the API validates again and reports per-row results."
        actions={
          <Button size="sm" variant="secondary" onClick={downloadTemplate}>
            <Download className="size-4" aria-hidden /> CSV template
          </Button>
        }
      />

      <section className="grid gap-4 rounded-md border border-border bg-surface p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <label
            htmlFor="feed-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-2 px-4 py-8 text-center hover:bg-surface-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0] ?? null);
            }}
          >
            <FileUp className="size-6 text-text-muted" aria-hidden />
            <span className="text-sm font-medium">{file ? file.name : "Choose a CSV file or drop it here"}</span>
            <span className="text-xs text-text-muted">{file ? `${count(Math.round(file.size / 1024))} KB` : "Max 10 MB · UTF-8 · header row required"}</span>
            <input id="feed-file" ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          </label>
          {readError ? (
            <p role="alert" className="text-sm text-error">
              {readError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-72">
              <Field id="feed-name" label="Feed name">
                <Input id="feed-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </Field>
            </div>
            <Button
              disabled={blocked || !file || !name.trim()}
              loading={upload.isPending}
              onClick={() => file && upload.mutate({ file, name: name.trim() })}
            >
              <Upload className="size-4" aria-hidden /> Upload {summary ? `${count(summary.total)} rows` : ""}
            </Button>
          </div>
          {summary && summary.bad > 0 && !blocked ? (
            <p className="text-xs text-warning">{count(summary.bad)} rows have errors and will be rejected by the API; the other {count(summary.ok)} rows will be imported.</p>
          ) : null}
        </div>
        <aside className="text-xs text-text-muted">
          <p className="mb-2 text-sm font-medium text-text">Columns</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
            {MERCHANT_FEED_COLUMNS.map((c) => (
              <li key={c} className={cn(["sku", "title", "price", "url"].includes(c) && "font-semibold text-text")}>
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-3">Bold = required. Prices as decimals in USD (“19.99”). Google attribute names (id, link, image_link, availability) are accepted.</p>
          {urlOptional ? <p className="mt-1">Local store: <span className="font-mono">url</span> is optional — items without a product link are listed in-store only (store price, stock and pickup under “Available nearby”). Add a UPC/GTIN so we can match items to our catalog.</p> : null}
        </aside>
      </section>

      {check && summary ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-md font-semibold">Validation results</h2>
            <Badge variant="success" size="sm">{count(summary.ok)} valid</Badge>
            <Badge variant={summary.bad ? "error" : "neutral"} size="sm">{count(summary.bad)} with errors</Badge>
            <Tabs value={filter} onValueChange={(v) => { setFilter(v as typeof filter); setPreviewPage(1); }} className="ml-auto">
              <TabsList variant="segmented" aria-label="Filter rows">
                <TabsTrigger value="errors">Errors</TabsTrigger>
                <TabsTrigger value="ok">Valid</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {check.missingRequired.length ? (
            <p role="alert" className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm text-error">
              Missing required column{check.missingRequired.length > 1 ? "s" : ""}: {check.missingRequired.join(", ")}. Found: {check.header.join(", ") || "(empty header)"}.
            </p>
          ) : null}
          {check.unknownColumns.length ? <p className="text-xs text-text-muted">Ignored columns: {check.unknownColumns.join(", ")}</p> : null}
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead numeric>Row</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead numeric>Price</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => (
                  <TableRow key={r.row}>
                    <TableCell numeric>{r.row}</TableCell>
                    <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{r.title || "—"}</TableCell>
                    <TableCell numeric>{r.data ? <PriceTag cents={r.data.priceCents} size="sm" /> : "—"}</TableCell>
                    <TableCell>
                      {r.ok ? (
                        <span className="text-sm text-success">Valid</span>
                      ) : (
                        <ul className="space-y-0.5 text-xs text-error">
                          {r.errors.map((e, i) => (
                            <li key={i}>
                              <span className="font-mono">{e.field}</span>: {e.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredRows.length === 0 ? <p className="border-t border-border p-4 text-center text-sm text-text-muted">No rows in this view.</p> : null}
          </div>
          <Pagination page={previewPage} pageCount={Math.ceil(filteredRows.length / PREVIEW_PAGE)} onPageChange={setPreviewPage} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-md font-semibold">Upload history</h2>
        <DataTable
          columns={feedColumns}
          rows={feeds.data?.items}
          rowKey={(f) => f.id}
          isLoading={feeds.isLoading}
          error={feeds.error}
          onRetry={() => void feeds.refetch()}
          emptyTitle="No feeds uploaded yet"
          caption="Feed uploads"
        />
        {feeds.data && feeds.data.totalPages > 1 ? <Pagination page={page} pageCount={feeds.data.totalPages} onPageChange={setPage} /> : null}
      </section>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{detail?.name} — API results</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <StatusBadge value={detail.status} />
                <span className="text-text-muted">
                  {count(detail.rowsTotal)} rows · {count(detail.rowsAccepted)} accepted · {count(detail.rowsRejected)} rejected
                </span>
              </div>
              {detail.status === "queued" || detail.status === "processing" ? <p className="text-text-muted">Processing… results update automatically in the history table.</p> : null}
              {detail.errors.length ? (
                <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead numeric>Row</TableHead>
                        <TableHead>Field</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell numeric>{e.row}</TableCell>
                          <TableCell className="font-mono text-xs">{e.field ?? "—"}</TableCell>
                          <TableCell className="text-error">{e.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : detail.status === "completed" ? (
                <p className="text-success">All rows accepted.</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
