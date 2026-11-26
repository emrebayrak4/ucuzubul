import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: true },
  alternates: { canonical: "/reset-password" },
};

export default function Page() {
  return <ResetPasswordForm />;
}
