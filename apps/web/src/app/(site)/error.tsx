"use client";

import { ErrorState } from "@pricora/ui";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-content py-10">
      <ErrorState title="Something went wrong" description="This page failed to load. Please try again." code={error.digest} onRetry={reset} />
    </div>
  );
}
