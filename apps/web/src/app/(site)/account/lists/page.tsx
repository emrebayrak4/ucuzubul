import type { Metadata } from "next";
import { ListsView } from "@/components/account/account-views";

export const metadata: Metadata = { title: "Lists" };

export default function Page() {
  return <ListsView />;
}
