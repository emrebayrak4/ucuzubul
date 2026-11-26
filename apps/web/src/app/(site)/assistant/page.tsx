import type { Metadata } from "next";
import { AssistantChat } from "@/components/assistant-chat";

export const metadata: Metadata = {
  title: "Shopping assistant",
  description: "Ask questions about products, prices and the best time to buy — answers grounded in tracked catalog data.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/assistant" },
};

export default function AssistantPage() {
  return (
    <div className="container-content max-w-3xl py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Shopping assistant</h1>
      <p className="mb-5 mt-1 text-sm text-text-muted">Experimental. It can make mistakes about specs — always check the product page before buying.</p>
      <AssistantChat />
    </div>
  );
}
