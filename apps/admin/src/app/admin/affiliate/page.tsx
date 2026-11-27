import type { Metadata } from "next";
import { AffiliateView } from "./affiliate-view";

export const metadata: Metadata = { title: "Affiliate programs" };

export default function Page() {
  return <AffiliateView />;
}
