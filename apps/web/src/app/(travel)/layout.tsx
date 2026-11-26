import { PageTransition } from "@/components/page-transition";
import { SiteFooter } from "@/components/site-footer";
import { TravelHeader } from "@/components/travel/travel-header";

export default function TravelLayout({ children }: { children: React.ReactNode }) {
  return (
    // Mounts when switching between the shopping and travel areas → horizontal slide (types set by VerticalSwitcher).
    <PageTransition>
      <a href="#main" className="sr-only z-toast rounded-md bg-flights-action px-3 py-2 text-flights-action-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <TravelHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter area="travel" />
    </PageTransition>
  );
}
