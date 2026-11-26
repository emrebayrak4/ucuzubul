import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: true, follow: true },
  alternates: { canonical: "/login" },
};

export default function Page() {
  return <LoginForm />;
}
