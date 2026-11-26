import { Check, Copy, ExternalLink, Search, Settings, TrendingDown } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { successStats } from "../shared/coupons";
import { BRAND_NAME, webUrl } from "../shared/env";
import { sendMessage, type PopupState } from "../shared/messages";
import type { ExtensionCoupon } from "../shared/types";
import { Logo } from "../ui/Logo";

type Load = { status: "loading" } | { status: "ready"; state: PopupState } | { status: "error" };

async function activeTabUrl(): Promise<string | null> {
  // With activeTab, the URL of the current tab is readable once the user opens the popup. Nothing is stored.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? null;
}

function openTab(url: string) {
  void chrome.tabs.create({ url });
  window.close();
}

export function PopupApp() {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await sendMessage({ type: "popup:state", url: await activeTabUrl() });
        if (!cancelled) setLoad(state ? { status: "ready", state } : { status: "error" });
      } catch {
        if (!cancelled) setLoad({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-[360px] bg-bg text-text">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Logo />
        <button
          type="button"
          onClick={() => void chrome.runtime.openOptionsPage()}
          className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="size-4" aria-hidden="true" />
        </button>
      </header>
      <main className="px-4 py-3">
        {load.status === "loading" && <LoadingState />}
        {load.status === "error" && <p className="text-base text-text-muted">Something went wrong. Please reopen the extension.</p>}
        {load.status === "ready" && load.state.kind === "unsupported" && <UnsupportedSite />}
        {load.status === "ready" && load.state.kind === "store" && <StoreView state={load.state} />}
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      <div className="h-5 w-40 animate-skeleton rounded-sm bg-surface-3" />
      <div className="h-16 animate-skeleton rounded-md bg-surface-2" />
      <div className="h-16 animate-skeleton rounded-md bg-surface-2" />
    </div>
  );
}

function UnsupportedSite() {
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) openTab(webUrl.search(term));
  };
  return (
    <div className="space-y-4">
      <p className="text-base text-text-muted">
        This site isn&apos;t a supported store. {BRAND_NAME} only runs on the stores it compares, and doesn&apos;t look at other sites.
      </p>
      <form onSubmit={submit} role="search" className="flex gap-2">
        <label htmlFor="pc-search" className="sr-only">
          Search {BRAND_NAME}
        </label>
        <input
          id="pc-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search or paste a product URL"
          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-base text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-ring"
        />
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-3 text-base font-bold text-primary-fg hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Search className="size-4" aria-hidden="true" />
          Search
        </button>
      </form>
      <button
        type="button"
        onClick={() => openTab(webUrl.priceDrops())}
        className="inline-flex items-center gap-1.5 text-base font-bold text-primary underline-offset-2 hover:underline"
      >
        <TrendingDown className="size-4" aria-hidden="true" />
        See recent price drops
      </button>
    </div>
  );
}

function StoreView({ state }: { state: Extract<PopupState, { kind: "store" }> }) {
  const { store, coupons, couponsError, user, settings } = state;
  const coded = coupons.filter((c) => c.code);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-lg font-extrabold">{store.name}</h1>
        {store.slug && (
          <button
            type="button"
            onClick={() => openTab(webUrl.store(store.slug))}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary underline-offset-2 hover:underline"
          >
            Store page on {BRAND_NAME}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {!settings.couponFinder ? (
        <p className="rounded-md bg-surface-2 p-3 text-base text-text-muted">
          Coupon finder is turned off.{" "}
          <button type="button" className="font-bold text-primary underline" onClick={() => void chrome.runtime.openOptionsPage()}>
            Settings
          </button>
        </p>
      ) : couponsError ? (
        <p className="rounded-md bg-surface-2 p-3 text-base text-text-muted">{couponsError}</p>
      ) : coupons.length === 0 ? (
        <p className="rounded-md bg-surface-2 p-3 text-base text-text-muted">No active coupons for {store.name} right now.</p>
      ) : (
        <>
          <p className="text-sm text-text-muted">
            {coded.length} {coded.length === 1 ? "code" : "codes"}
            {coupons.length > coded.length ? ` · ${coupons.length - coded.length} ${coupons.length - coded.length === 1 ? "deal" : "deals"} without a code` : ""}
            {state.checkoutSupported ? " · we can try codes for you at checkout" : ""}
          </p>
          <ul className="max-h-[300px] space-y-2 overflow-y-auto pr-1" aria-label={`Coupons for ${store.name}`}>
            {coupons.map((c) => (
              <CouponRow key={c.id} coupon={c} />
            ))}
          </ul>
        </>
      )}

      <FollowStore state={state} signedIn={!!user} />
    </div>
  );
}

function CouponRow({ coupon }: { coupon: ExtensionCoupon }) {
  const [copied, setCopied] = useState(false);
  const stats = successStats(coupon);
  const copy = async () => {
    if (!coupon.code) return;
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <li className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-snug">{coupon.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            {stats ? (
              <span>
                {Math.round(stats.rate * 100)}% success
                {stats.reports !== null ? ` · ${stats.reports} ${stats.reports === 1 ? "report" : "reports"}` : ""}
              </span>
            ) : (
              <span>Not verified yet</span>
            )}
            {coupon.source === "demo" && (
              <span className="rounded-full border border-demo-border bg-demo px-2 py-px text-2xs font-bold text-demo-fg">Demo data</span>
            )}
          </p>
        </div>
        {coupon.code ? (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <code className="rounded-sm border border-dashed border-border-strong bg-surface-2 px-2 py-0.5 font-mono text-sm font-bold">{coupon.code}</code>
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-sm font-bold text-primary-fg hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={copied ? `Copied ${coupon.code}` : `Copy code ${coupon.code}`}
            >
              {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <span className="shrink-0 rounded-sm bg-surface-2 px-2 py-0.5 text-xs font-bold text-text-muted">No code needed</span>
        )}
      </div>
    </li>
  );
}

function FollowStore({ state, signedIn }: { state: Extract<PopupState, { kind: "store" }>; signedIn: boolean }) {
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; message: string }>({ kind: "idle" });
  const retailerSlug = state.store.retailer?.slug ?? state.store.slug;
  if (!signedIn) {
    return (
      <p className="border-t border-border pt-3 text-sm text-text-muted">
        <button type="button" className="font-bold text-primary underline" onClick={() => openTab(webUrl.login())}>
          Log in on {BRAND_NAME}
        </button>{" "}
        to follow {state.store.name}&apos;s coupons.
      </p>
    );
  }
  if (!retailerSlug) return null;
  const follow = async () => {
    setStatus({ kind: "busy" });
    const res = await sendMessage({ type: "popup:follow", retailerSlug }).catch(() => null);
    setStatus(res?.ok ? { kind: "done" } : { kind: "error", message: res?.error ?? "Couldn't follow this store." });
  };
  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => void follow()}
        disabled={status.kind === "busy" || status.kind === "done"}
        className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border bg-surface px-3 text-base font-bold text-text hover:bg-surface-2 disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {status.kind === "done" ? "Following this store's coupons" : status.kind === "busy" ? "Following…" : "Follow this store's coupons"}
      </button>
      {status.kind === "error" && (
        <p role="alert" className="mt-1.5 text-sm text-error">
          {status.message}
        </p>
      )}
    </div>
  );
}
