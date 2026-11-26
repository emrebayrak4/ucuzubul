import { ErrorState } from "@pricora/ui";
import type { LoadError } from "@/lib/api-server";
import { RetryButton } from "./notices";

function describe(error: LoadError): { title: string; description: string } {
  if (error.status === 0) {
    return {
      title: "Can't reach the price service",
      description: "Our API isn't responding right now. Prices and listings will appear as soon as it's back.",
    };
  }
  if (error.status === 503 || error.code === "pending_configuration" || error.code === "service_unavailable") {
    return { title: "Temporarily unavailable", description: error.message || "This feature isn't available right now." };
  }
  if (error.status === 404) {
    return {
      title: "Not available yet",
      description: "This data isn't available from the API yet. Please check back shortly.",
    };
  }
  if (error.status === 429) return { title: "Too many requests", description: "Please wait a moment and try again." };
  return { title: "Something went wrong", description: "We couldn't load this right now. Please try again." };
}

/** Server-renderable error panel for failed API loads (with a client "Try again" that re-runs the server render). */
export function ApiErrorPanel({ error, compact = false }: { error: LoadError; compact?: boolean }) {
  const { title, description } = describe(error);
  return (
    <div
      data-testid="api-error"
      className={compact ? "rounded-md border border-border bg-surface" : "rounded-lg border border-border bg-surface"}
    >
      <ErrorState title={title} description={description} code={error.code} className={compact ? "py-6" : undefined} />
      <div className="-mt-6 flex justify-center pb-8">
        <RetryButton />
      </div>
    </div>
  );
}
