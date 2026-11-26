import { cn } from "@pricora/ui/utils";

/**
 * Travel hero band. Flights = deep navy (Skyscanner-like), hotels = red (Booking-like).
 * Holds the vertical pill tabs, a headline and the joined search bar.
 */
export function TravelHero({
  vertical,
  active,
  title,
  sub,
  compact = false,
  children,
}: {
  vertical: "flights" | "hotels";
  active?: "flights" | "hotels" | "explore";
  title: React.ReactNode;
  sub?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}) {
  void active;
  return (
    <section className={cn(vertical === "hotels" ? "bg-hotels text-hotels-fg" : "bg-flights text-flights-fg", compact ? "pb-6 pt-2" : "pb-10 pt-4 lg:pb-14")} data-testid="travel-band">
      <div className="container-content">
        <h1 className={cn("font-extrabold tracking-tight", compact ? "text-2xl" : "text-3xl lg:text-4xl")}>{title}</h1>
        {sub ? <p className="mt-2 max-w-3xl text-md opacity-90">{sub}</p> : null}
        <div className={compact ? "mt-4" : "mt-6"}>{children}</div>
      </div>
    </section>
  );
}

/** Back-compat wrapper (old name). */
export function TravelBand({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <TravelHero vertical="flights" title={title} sub={sub} compact>
      {children}
    </TravelHero>
  );
}
