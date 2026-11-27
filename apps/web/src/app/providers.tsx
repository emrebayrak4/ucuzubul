"use client";

import "@/lib/zod-csp";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { MotionGovernor, Toaster, TooltipProvider } from "@pricora/ui";
import { ApiError } from "@/lib/api-browser";
import { SessionProvider } from "@/lib/session";
import type { ConsentState } from "@pricora/contracts";
import { ZipProvider, type EdgeZipGuess } from "@/components/zip-provider";
import { ConsentProvider } from "@/components/privacy/consent-provider";
import { NavProgress } from "@/components/nav-progress";

export function Providers({
  children,
  nonce,
  consent = null,
  gpc = false,
  edgeZip = null,
}: {
  children: React.ReactNode;
  nonce?: string;
  consent?: ConsentState | null;
  gpc?: boolean;
  edgeZip?: EdgeZipGuess | null;
}) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Don't hammer the API on 4xx; retry network blips once.
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider nonce={nonce} attribute="class" defaultTheme="light" enableSystem={false} storageKey="pc-theme" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ConsentProvider initial={consent} gpcHeader={gpc}>
            <ZipProvider edgeGuess={edgeZip}>
              <TooltipProvider>
                <NavProgress />
              <MotionGovernor />
                {children}
                <Toaster />
              </TooltipProvider>
            </ZipProvider>
          </ConsentProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
