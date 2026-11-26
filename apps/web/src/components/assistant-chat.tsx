"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Send, User } from "lucide-react";
import type { AssistantMessage, ProductCard } from "@pricora/contracts";
import { Button, cn } from "@pricora/ui";
import { ApiError, api, errorMessage } from "@/lib/api-browser";
import { readZipCookie } from "@/lib/zip";
import { ProductCardTile } from "./product-card";
import { Notice } from "./notices";

type Turn = AssistantMessage & { products?: ProductCard[] };

const examples = ["Best noise-cancelling headphones under $200", "Is now a good time to buy a 65-inch OLED TV?", "Compare air fryers for a family of four"];

export function AssistantChat() {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [disabled, setDisabled] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Preflight: if the AI adapter isn't live, show the disabled state up front.
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.health(), staleTime: 5 * 60_000, retry: false });
  const ai = health.data?.adapters.find((a) => a.kind === "ai");
  const preflightDisabled = ai && ai.status !== "live" ? "The shopping assistant isn't configured yet (no AI provider connected)." : null;
  const off = disabled ?? preflightDisabled;

  React.useEffect(() => endRef.current?.scrollIntoView({ block: "nearest" }), [turns, pending]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    setError(null);
    const history: Turn[] = [...turns, { role: "user", content }];
    setTurns(history);
    setInput("");
    setPending(true);
    try {
      const res = await api.assistant.ask({
        messages: history.slice(-20).map(({ role, content: c }) => ({ role, content: c.slice(0, 4000) })),
        context: { zip: readZipCookie() ?? undefined },
      });
      setTurns((t) => [...t, { ...res.message, products: res.products }]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        const d = err.details as { reason?: string } | undefined;
        setDisabled(d?.reason ?? err.message ?? "The assistant is unavailable right now.");
      } else setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col rounded-lg border border-border bg-surface" data-testid="assistant">
      {off ? (
        <Notice tone="info" className="m-4" testId="assistant-disabled">
          {off} You can still search and compare prices normally.
        </Notice>
      ) : null}
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {turns.length === 0 ? (
          <div className="py-8 text-center">
            <Bot aria-hidden className="mx-auto size-8 text-primary" />
            <p className="mt-2 font-medium">Ask about products, prices and timing</p>
            <p className="mt-1 text-sm text-text-muted">Answers are grounded in our catalog — prices always come from tracked offers, never generated.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {examples.map((e) => (
                <button key={e} type="button" disabled={Boolean(off)} onClick={() => void send(e)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50">
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={i} className={cn("flex gap-3", t.role === "user" && "flex-row-reverse")}>
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", t.role === "user" ? "bg-surface-2" : "bg-primary-soft text-primary-soft-fg")}>
                {t.role === "user" ? <User aria-hidden className="size-4" /> : <Bot aria-hidden className="size-4" />}
              </span>
              <div className={cn("max-w-[85%]", t.role === "user" && "text-right")}>
                <p className={cn("inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm", t.role === "user" ? "bg-primary text-primary-fg" : "bg-surface-2")}>{t.content}</p>
                {t.products?.length ? (
                  <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {t.products.slice(0, 6).map((p) => (
                      <li key={p.id}>
                        <ProductCardTile product={p} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ))
        )}
        {pending ? <p className="text-sm text-text-muted">Thinking…</p> : null}
        <div ref={endRef} />
      </div>
      {error ? (
        <p role="alert" className="px-4 pb-2 text-sm text-error">
          {error}
        </p>
      ) : null}
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message
        </label>
        <textarea
          id="assistant-input"
          rows={1}
          maxLength={4000}
          value={input}
          disabled={Boolean(off)}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={off ? "Assistant unavailable" : "Ask about a product…"}
          className="min-h-10 flex-1 resize-none rounded-md border border-border-strong bg-surface px-3 py-2 text-md text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:text-base"
          data-testid="assistant-input"
        />
        <Button type="submit" disabled={Boolean(off) || !input.trim()} loading={pending} aria-label="Send">
          <Send aria-hidden />
        </Button>
      </form>
    </div>
  );
}
