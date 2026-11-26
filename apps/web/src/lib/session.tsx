"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import type { PublicUser } from "@pricora/contracts";
import { api } from "./api-browser";
import { loginHref } from "./nav";

export const ME_QUERY_KEY = ["auth", "me"] as const;

export interface SessionValue {
  user: PublicUser | null;
  /** First load in progress. */
  loading: boolean;
  /** The API could not be reached (treat as signed out, but don't claim it). */
  unavailable: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Runs `action` when signed in, otherwise sends the user to /login?next=<current page>. */
  requireAuth: (action: () => void) => void;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const res = await api.auth.me();
      api.setCsrfToken(res.csrfToken);
      return res;
    },
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const user = me.data?.user ?? null;

  const value = React.useMemo<SessionValue>(
    () => ({
      user,
      loading: me.isPending,
      unavailable: me.isError,
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
      },
      logout: async () => {
        try {
          await api.auth.logout();
        } finally {
          qc.setQueryData(ME_QUERY_KEY, (prev: { csrfToken: string } | undefined) => ({ user: null, csrfToken: prev?.csrfToken ?? "" }));
          qc.removeQueries({ predicate: (q) => q.queryKey[0] === "me" });
          router.refresh();
        }
      },
      requireAuth: (action) => {
        if (user) action();
        else {
          const qs = typeof window !== "undefined" ? window.location.search : "";
          router.push(loginHref((pathname ?? "/") + qs));
        }
      },
    }),
    [user, me.isPending, me.isError, qc, router, pathname],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
