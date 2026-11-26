import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session-server";
import { isStaff } from "@/lib/roles";
import { ApiUnreachable } from "@/components/api-unreachable";
import { PortalShell } from "@/components/portal-shell";
import { SessionProvider } from "@/components/session-context";
import { ADMIN_NAV } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (session.status === "unreachable") return <ApiUnreachable message={session.message} />;
  if (session.status === "anonymous" || !session.me.user) redirect("/login?next=/admin");
  const user = session.me.user;
  if (!isStaff(user.role)) redirect("/forbidden");

  return (
    <SessionProvider user={user} csrfToken={session.me.csrfToken}>
      <PortalShell user={user} groups={ADMIN_NAV} portalLabel="Admin">
        {children}
      </PortalShell>
    </SessionProvider>
  );
}
