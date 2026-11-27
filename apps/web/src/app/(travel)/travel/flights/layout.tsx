import { FlightNavPlane } from "@/components/travel/flights/flight-nav-plane";

/** Persists across /travel/flights/* navigations so the plane fly-across can react to pathname changes. */
export default function FlightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FlightNavPlane />
    </>
  );
}
