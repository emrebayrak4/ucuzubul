"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@pricora/ui";
import { brand } from "@pricora/config/brand";
import { getApi } from "@/lib/api";
import "swagger-ui-dist/swagger-ui.css";

interface SwaggerRequest {
  method?: string;
  headers: Record<string, string>;
  credentials?: RequestCredentials;
}

/**
 * Swagger UI from `swagger-ui-dist` (self-contained ES bundle, no install scripts), loaded lazily on this page only.
 * Runs under the app CSP without eval. Swagger UI is light-themed, so it sits in a light panel in dark mode too.
 */
export function SwaggerView({ spec }: { spec: object }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: SwaggerUI } = await import("swagger-ui-dist/swagger-ui-es-bundle.js");
        if (cancelled || !ref.current) return;
        SwaggerUI({
          domNode: ref.current,
          spec,
          deepLinking: false,
          docExpansion: "none",
          defaultModelsExpandDepth: 0,
          tryItOutEnabled: false,
          displayRequestDuration: true,
          filter: true,
          // Try-it-out requests carry the admin session cookie and the CSRF header for mutations.
          requestInterceptor: (req: SwaggerRequest) => {
            req.credentials = "include";
            if (req.method && req.method.toUpperCase() !== "GET") {
              const token = getApi().core.getCsrfToken();
              if (token) req.headers[brand.csrfHeaderName] = token;
            }
            return req;
          },
        });
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Swagger UI");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spec]);

  return (
    <div className="rounded-md border border-border bg-white p-2 text-black [color-scheme:light]">
      {loading ? <Skeleton className="h-96 w-full" /> : null}
      {error ? <p className="p-4 text-sm text-error">{error}</p> : null}
      <div ref={ref} />
    </div>
  );
}
