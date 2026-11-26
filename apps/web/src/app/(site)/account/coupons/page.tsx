import type { Metadata } from "next";
import { AccountCoupons } from "@/components/account/account-coupons";

export const metadata: Metadata = { title: "Coupon alerts" };

export default function Page() {
  return <AccountCoupons />;
}
