import type { Metadata } from "next";
import { AccountOverview } from "@/components/account/account-views";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <AccountOverview />;
}
