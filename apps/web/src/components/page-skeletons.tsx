import { Skeleton } from "@pricora/ui";
import { ProductGridSkeleton } from "./product-card";

export function ResultsPageSkeleton({ title = true }: { title?: boolean }) {
  return (
    <div className="container-content py-6" aria-busy="true">
      {title ? <Skeleton className="mb-5 h-8 w-64" /> : null}
      <div className="flex gap-8">
        <div className="hidden w-60 shrink-0 space-y-4 lg:block">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <Skeleton className="mb-4 h-8 w-full max-w-md" />
          <ProductGridSkeleton count={15} withSidebar />
        </div>
      </div>
    </div>
  );
}

export function GridPageSkeleton() {
  return (
    <div className="container-content py-6" aria-busy="true">
      <Skeleton className="mb-5 h-8 w-64" />
      <ProductGridSkeleton count={18} />
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="container-content py-6" aria-busy="true">
      <Skeleton className="mb-4 h-4 w-72" />
      <div className="grid gap-8 lg:grid-cols-12">
        <Skeleton className="aspect-square w-full lg:col-span-5" />
        <div className="space-y-3 lg:col-span-7">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="mt-6 h-12 w-48" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <Skeleton className="mt-10 h-64 w-full" />
    </div>
  );
}
