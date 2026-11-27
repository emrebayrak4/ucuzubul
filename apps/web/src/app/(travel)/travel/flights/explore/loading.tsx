import { Skeleton } from "@pricora/ui";
import { PlaneLoader } from "@/components/travel/flights/plane-loader";

export default function Loading() {
  return (
    <div className="container-content py-6" aria-busy="true">
      <PlaneLoader label="Finding the cheapest destinations…" className="mb-6" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    </div>
  );
}
