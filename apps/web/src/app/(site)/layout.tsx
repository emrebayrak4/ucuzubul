import { PageTransition } from "@/components/page-transition";
import { SiteHeader } from "@/components/header/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CompareTray } from "@/components/compare/compare-tray";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition>
      <a
        href="#main"
        className="sr-only z-toast rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
      <CompareTray />
    </PageTransition>
  );
}
