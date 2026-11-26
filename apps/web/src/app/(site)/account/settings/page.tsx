import type { Metadata } from "next";
import { SettingsView } from "@/components/account/account-views";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsView />;
}
