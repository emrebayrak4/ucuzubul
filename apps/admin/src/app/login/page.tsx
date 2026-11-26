import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo suffix="Admin & Merchant" size="lg" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-xs">
          <h1 className="text-lg font-semibold">Log in</h1>
          <p className="mt-1 text-sm text-text-muted">Staff and merchant accounts only.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-xs text-text-muted">Signs in with your API session (same account as the consumer site).</p>
      </div>
    </main>
  );
}
