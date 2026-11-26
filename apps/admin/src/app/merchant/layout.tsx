import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session-server";
import { isMerchant } from "@/lib/roles";
import { ApiUnreachable } from "@/components/api-unreachable";
import { PortalShell } from "@/components/portal-shell";
import { SessionProvider } from "@/components/session-context";
import { MERCHANT_NAV } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (session.status === "unreachable") return <ApiUnreachable message={session.message} />;
  if (session.status === "anonymous" || !session.me.user) redirect("/login?next=/merchant");
  const user = session.me.user;
  if (!isMerchant(user.role)) redirect("/forbidden");

  return (
    <SessionProvider user={user} csrfToken={session.me.csrfToken}>
      <PortalShell user={user} groups={MERCHANT_NAV} portalLabel="Merchant">
        {children}
      </PortalShell>
    </SessionProvider>
  );
}
