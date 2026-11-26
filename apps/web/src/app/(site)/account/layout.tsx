import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasSessionCookie, load, serverApi } from "@/lib/api-server";
import { loginHref } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { AccountNav } from "@/components/account/account-nav";

export const metadata: Metadata = {
  title: { default: "Your account", template: "%s · Account" },
  robots: { index: false, follow: false },
};

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasSessionCookie())) redirect(loginHref("/account"));
  const api = await serverApi({ withCookies: true });
  const me = await load(() => api.auth.me());
  if (me.ok && !me.data.user) redirect(loginHref("/account"));

  return (
    <div className="container-content py-6">
      {!me.ok ? (
        <ApiErrorPanel error={me.error} />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
          <AccountNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      )}
    </div>
  );
}
