import type { Metadata } from "next";
import { ShieldX } from "lucide-react";
import { getServerSession } from "@/lib/session-server";
import { ROLE_LABEL, homeForRole } from "@/lib/roles";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = { title: "Access denied" };
export const dynamic = "force-dynamic";

export default async function ForbiddenPage() {
  const session = await getServerSession();
  const user = session.status === "ok" ? session.me.user : null;
  const home = homeForRole(user?.role);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-lg bg-error-soft text-error">
        <ShieldX className="size-6" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="text-text-muted">
        {user ? (
          <>
            You are signed in as <strong className="text-text">{user.email}</strong> ({ROLE_LABEL[user.role]}). This area requires a
            different role.
          </>
        ) : (
          "This area requires a staff or merchant account."
        )}
      </p>
      <div className="flex gap-2">
        {home ? (
          <a href={home} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg">
            Go to your portal
          </a>
        ) : null}
        {user ? <LogoutButton /> : (
          <a href="/login" className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium">
            Log in
          </a>
        )}
      </div>
    </main>
  );
}
