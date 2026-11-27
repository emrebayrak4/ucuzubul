import type { Metadata } from "next";
import { PrivacyChoicesIcon } from "@/components/privacy/privacy-choices-icon";
import { PrivacyChoicesView } from "@/components/privacy/privacy-choices-view";

export const metadata: Metadata = { title: "Your Privacy Choices", alternates: { canonical: "/privacy-choices" }, robots: { index: false, follow: true } };

export default function PrivacyChoicesPage() {
  return (
    <div className="container-content py-6">
      <div className="max-w-3xl">
      <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
        <PrivacyChoicesIcon className="h-6 w-auto" /> Your Privacy Choices
      </h1>
      <p className="mt-2 text-text-muted">
        Control cookies, opt out of the sale or sharing of personal information, and request access, deletion or correction of your data.
        Available to everyone; residents of California, Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Montana and other states with
        privacy laws have these rights by law.
      </p>
      <div className="mt-6">
        <PrivacyChoicesView />
      </div>
      </div>
    </div>
  );
}
