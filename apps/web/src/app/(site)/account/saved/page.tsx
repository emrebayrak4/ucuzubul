import type { Metadata } from "next";
import { SavedView } from "@/components/account/account-views";

export const metadata: Metadata = { title: "Saved" };

export default function Page() {
  return <SavedView />;
}
