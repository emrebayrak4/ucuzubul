import type { Metadata } from "next";
import { RetailersView } from "./retailers-view";

export const metadata: Metadata = { title: "Retailers" };

export default function Page() {
  return <RetailersView />;
}
