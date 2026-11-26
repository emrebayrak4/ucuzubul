import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { brand } from "@pricora/config/brand";
import { Providers } from "./providers";
import "./globals.css";

// Brand UI font (founder decision): Nunito Sans, variable weight 400–800, self-hosted by next/font at build time.
// Sets the Tailwind/token variable `--font-sans` directly on <html>, so `font-sans` resolves to it in every component.
const nunitoSans = Nunito_Sans({ weight: "variable", subsets: ["latin"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: `${brand.name} Admin`, template: `%s · ${brand.name} Admin` },
  description: `${brand.name} admin panel and merchant portal`,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunitoSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="bg-bg text-text min-h-full font-sans text-base antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
