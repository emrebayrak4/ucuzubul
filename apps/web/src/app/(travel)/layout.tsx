import { SiteFooter } from "@/components/site-footer";
import { TravelHeader } from "@/components/travel/travel-header";

export default function TravelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only z-toast rounded-md bg-travel px-3 py-2 text-travel-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <TravelHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
