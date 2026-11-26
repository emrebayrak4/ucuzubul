import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: true },
  alternates: { canonical: "/forgot-password" },
};

export default function Page() {
  return <ForgotPasswordForm />;
}
