import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasSessionCookie, load, serverApi } from "@/lib/api-server";

export const metadata: Metadata = { title: "Start your free listing", robots: { index: false, follow: false } };

const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3001").replace(/\/+$/, "");

/**
 * Entry point of the seller funnel: signed-out visitors create an account (or log in) first and come back here;
 * signed-in visitors continue to the application form in the merchant portal (same session cookie).
 */
export default async function SellStart() {
  if (await hasSessionCookie()) {
    const api = await serverApi({ withCookies: true });
    const me = await load(() => api.auth.me());
    if (me.ok && me.data.user) redirect(me.data.user.role === "MERCHANT" ? `${ADMIN_URL}/merchant` : `${ADMIN_URL}/merchant/apply`);
  }
  redirect(`/signup?next=${encodeURIComponent("/sell/start")}`);
}
