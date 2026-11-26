import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session-server";
import { homeForRole } from "@/lib/roles";
import { ApiUnreachable } from "@/components/api-unreachable";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession();
  if (session.status === "unreachable") return <ApiUnreachable message={session.message} />;
  if (session.status === "anonymous") redirect("/login");
  const home = homeForRole(session.me.user?.role);
  redirect(home ?? "/forbidden");
}
