import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";

/** Brand sans: Nunito Sans variable font (400–800). Exposed as --font-nunito-sans for the design-token font stack. */
const nunitoSans = Nunito_Sans({ subsets: ["latin"], display: "swap", variable: "--font-nunito-sans" });
import { headers } from "next/headers";
import { brand } from "@pricora/config/brand";
import { SITE_URL } from "@/lib/env";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
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
  // Per-request CSP nonce from src/proxy.ts (needed for the next-themes inline script).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={`${nunitoSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh bg-bg text-text">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
