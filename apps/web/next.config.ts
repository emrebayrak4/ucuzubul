import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4400";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? apiUrl,
  },
  images: {
    // Product images come from retailer/CDN hosts we don't control; rendered with plain <img> (lazy) to avoid
    // proxying third-party images through the Next image optimizer.
    unoptimized: true,
  },
  async redirects() {
    // Travel moved to its own area (/travel/*). Query strings are preserved automatically.
    return [
      { source: "/flights", destination: "/travel/flights", statusCode: 301 },
      { source: "/flights/:path*", destination: "/travel/flights/:path*", statusCode: 301 },
      { source: "/hotels", destination: "/travel/hotels", statusCode: 301 },
      { source: "/hotels/:path*", destination: "/travel/hotels/:path*", statusCode: 301 },
    ];
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // Universal links / app links files must be served as JSON.
        source: "/.well-known/:file(apple-app-site-association|assetlinks.json)",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
      { source: "/account/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
