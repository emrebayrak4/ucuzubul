"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, Skeleton } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { GuideEditor } from "./guide-editor";

export default function GuideEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === "new";
  const q = useQuery({
    queryKey: ["admin", "guide-detail", id],
    queryFn: ({ signal }) => getApi().request("admin.guides.get", { params: { id }, signal }),
    enabled: !isNew,
  });

  if (isNew) return <GuideEditor guide={null} />;
  if (q.error) return <ErrorState title="Could not load guide" description={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-[60vh] w-full" />;
  return <GuideEditor key={`${q.data.id}-${q.data.updatedAt}`} guide={q.data} />;
}
