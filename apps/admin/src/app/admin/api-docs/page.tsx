"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import { Button, ErrorState, Skeleton } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import dynamic from "next/dynamic";

// Swagger UI (+ its CSS) is only downloaded when this page is opened.
const SwaggerView = dynamic(() => import("./swagger-view").then((m) => m.SwaggerView), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />,
});

type Spec = { openapi?: string; info?: { title?: string; version?: string }; paths?: Record<string, unknown> };

async function loadSpec(signal: AbortSignal): Promise<Spec> {
  return (await getApi().request("admin.openapi", { signal })) as Spec;
}

export default function ApiDocsPage() {
  const q = useQuery({ queryKey: ["admin", "openapi"], queryFn: ({ signal }) => loadSpec(signal), staleTime: 5 * 60_000 });

  function download() {
    if (!q.data) return;
    const blob = new Blob([JSON.stringify(q.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "openapi.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const pathCount = q.data?.paths ? Object.keys(q.data.paths).length : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="API docs"
        description={
          q.data
            ? `${q.data.info?.title ?? "API"} ${q.data.info?.version ?? ""} · OpenAPI ${q.data.openapi ?? ""} · ${pathCount} paths. "Try it out" calls the API with your admin session.`
            : "OpenAPI reference generated from @pricora/contracts."
        }
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => void q.refetch()} loading={q.isFetching}>
              <RefreshCw className="size-4" aria-hidden /> Reload
            </Button>
            <Button size="sm" variant="secondary" onClick={download} disabled={!q.data}>
              <Download className="size-4" aria-hidden /> Download openapi.json
            </Button>
          </>
        }
      />
      {q.error ? (
        <ErrorState title="Could not load the OpenAPI spec" description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" />
      ) : q.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : q.data ? (
        <SwaggerView spec={q.data} />
      ) : null}
    </div>
  );
}
