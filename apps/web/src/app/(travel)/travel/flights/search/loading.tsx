import { Skeleton } from "@pricora/ui";
import { PlaneLoader } from "@/components/travel/flights/plane-loader";

export default function Loading() {
  return (
    <div className="container-content py-6" aria-busy="true">
      <PlaneLoader className="mb-6" />
      <Skeleton className="mb-6 h-36 w-full" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}
