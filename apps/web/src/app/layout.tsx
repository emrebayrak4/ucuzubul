import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";

/** Brand sans: Plus Jakarta Sans variable font (200–800). Exposed as --font-plus-jakarta-sans for the design-token font stack. */
const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-plus-jakarta-sans" });
import { headers } from "next/headers";
import { preconnect } from "react-dom";
import { brand } from "@pricora/config/brand";
import { SITE_URL } from "@/lib/env";
import { getEdgeZipGuess, getGpcHeader, getInitialConsent } from "@/lib/privacy/server";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: "Compare prices across US stores with shipping and estimated tax, real price history, honest Deal Scores, coupons and price alerts.",
  applicationName: brand.name,
  openGraph: { siteName: brand.name, type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#151A17" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Home promo tiles / category circles (incl. the mobile LCP image) are hotlinked from Unsplash.
  preconnect("https://images.unsplash.com");
  // Per-request CSP nonce from src/proxy.ts (needed for the next-themes inline script).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const [consent, gpc, edgeZip] = await Promise.all([getInitialConsent(), getGpcHeader(), getEdgeZipGuess()]);
  return (
    <html lang="en" suppressHydrationWarning className={`${plusJakartaSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh bg-bg text-text">
        <Providers nonce={nonce} consent={consent} gpc={gpc} edgeZip={edgeZip}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
