import type { Metadata } from "next";
import { PrivacyView } from "@/components/account/account-views";

export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return <PrivacyView />;
}
