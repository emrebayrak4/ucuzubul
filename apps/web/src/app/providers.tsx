"use client";

import "@/lib/zod-csp";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster, TooltipProvider } from "@pricora/ui";
import { ApiError } from "@/lib/api-browser";
import { SessionProvider } from "@/lib/session";
import { ZipProvider } from "@/components/zip-provider";
import { NavProgress } from "@/components/nav-progress";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
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
          <ZipProvider>
            <TooltipProvider>
              <NavProgress />
              {children}
              <Toaster />
            </TooltipProvider>
          </ZipProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
