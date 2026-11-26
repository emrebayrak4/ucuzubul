"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { PublicUser } from "@pricora/contracts";
import { getApi } from "@/lib/api";
import { canEdit, isAdmin } from "@/lib/roles";

interface SessionValue {
  user: PublicUser;
  canEdit: boolean;
  isAdmin: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ user, csrfToken, children }: { user: PublicUser; csrfToken: string; children: ReactNode }) {
  useEffect(() => {
    // Token comes from the server-side /v1/auth/me call; the api-client mirrors it as x-csrf-token.
    getApi().setCsrfToken(csrfToken);
  }, [csrfToken]);
  return (
    <SessionContext.Provider value={{ user, canEdit: canEdit(user.role), isAdmin: isAdmin(user.role) }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
