import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session-server";
import { MERCHANT_APPLY_PATH, PATHNAME_HEADER, isMerchant } from "@/lib/roles";
import { ApiUnreachable } from "@/components/api-unreachable";
import { PortalShell } from "@/components/portal-shell";
import { SessionProvider } from "@/components/session-context";
import { Logo } from "@/components/logo";
import { MERCHANT_NAV } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (session.status === "unreachable") return <ApiUnreachable message={session.message} />;
  const pathname = (await headers()).get(PATHNAME_HEADER);
  const onApply = pathname === MERCHANT_APPLY_PATH;
  if (session.status === "anonymous" || !session.me.user) redirect(`/login?next=${onApply ? MERCHANT_APPLY_PATH : "/merchant"}`);
  const user = session.me.user;

  if (!isMerchant(user.role)) {
    // Exception: the self-serve local seller signup is open to any signed-in account (the API upgrades it to MERCHANT).
    // Everything else under /merchant stays gated.
    if (!onApply) redirect("/forbidden");
    return (
      <SessionProvider user={user} csrfToken={session.me.csrfToken}>
        <div className="min-h-screen">
          <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:px-8">
            <Link href={MERCHANT_APPLY_PATH} aria-label="Home">
              <Logo suffix="Merchant" />
            </Link>
            <span className="ml-auto truncate text-sm text-text-muted">Signed in as {user.email}</span>
          </header>
          <main className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8">{children}</main>
        </div>
      </SessionProvider>
    );
  }

  return (
    <SessionProvider user={user} csrfToken={session.me.csrfToken}>
      <PortalShell user={user} groups={MERCHANT_NAV} portalLabel="Merchant">
        {children}
      </PortalShell>
    </SessionProvider>
  );
}
