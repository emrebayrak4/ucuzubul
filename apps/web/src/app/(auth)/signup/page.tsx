import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: true, follow: true },
  alternates: { canonical: "/signup" },
};

export default function Page() {
  return <SignupForm />;
}
