"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@pricora/ui";
import { getApi } from "@/lib/api";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          // /v1/auth/me returns the CSRF token the logout mutation needs.
          await getApi().auth.me();
          await getApi().auth.logout();
        } finally {
          router.replace("/login");
          router.refresh();
        }
      }}
    >
      Log out and switch account
    </Button>
  );
}
