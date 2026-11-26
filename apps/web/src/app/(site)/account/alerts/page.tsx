import type { Metadata } from "next";
import { AlertsView } from "@/components/account/account-views";

export const metadata: Metadata = { title: "Price alerts" };

export default function Page() {
  return <AlertsView />;
}
