"use client";

import * as React from "react";
import Link from "next/link";
import { Cookie, ShieldCheck } from "lucide-react";
import type { ConsentState } from "@pricora/contracts";
import { analytics } from "@pricora/analytics";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Switch, toast } from "@pricora/ui";
import { api } from "@/lib/api-browser";
import { useSession } from "@/lib/session";
import { browserGpc, makeConsent, purgeFunctionalStorage, readConsentClient, writeConsentCookie } from "@/lib/privacy/consent";

export interface ConsentChoice {
  functional: boolean;
  analytics: boolean;
  advertising: boolean;
}

interface ConsentValue {
  consent: ConsentState | null;
  /** GPC detected (Sec-GPC request header on the server or navigator.globalPrivacyControl in the browser). */
  gpc: boolean;
  save: (choice: ConsentChoice) => void;
  openPreferences: () => void;
}

const ConsentContext = React.createContext<ConsentValue | null>(null);

export const CATEGORY_COPY: Array<{ key: keyof ConsentChoice | "necessary"; title: string; body: string }> = [
  { key: "necessary", title: "Strictly necessary", body: "Sign-in, security, your cookie choices and features you explicitly use (basket, compare). Always on." },
  { key: "functional", title: "Functional", body: "Remembers your ZIP code for tax-inclusive totals, recent searches and similar preferences on this device." },
  { key: "analytics", title: "Analytics", body: "Aggregate usage measurement to improve the site. No analytics provider is connected today; this switch controls it when one is added." },
  {
    key: "advertising",
    title: "Advertising & affiliate measurement",
    body: "Lets partners measure purchases after you click through to a store. Under California and other state laws this can count as “sale” or “sharing”. Never changes our price ranking.",
  },
];

export function ConsentProvider({ initial, gpcHeader, children }: { initial: ConsentState | null; gpcHeader: boolean; children: React.ReactNode }) {
  const { user } = useSession();
  const [consent, setConsent] = React.useState<ConsentState | null>(initial);
  const [gpc, setGpc] = React.useState(gpcHeader || Boolean(initial?.gpc));
  const [prefsOpen, setPrefsOpen] = React.useState(false);
  const syncedFor = React.useRef<string | null>(null);

  const persist = React.useCallback(
    (next: ConsentState, opts: { toAccount: boolean }) => {
      const prev = readConsentClient();
      writeConsentCookie(next);
      setConsent(next);
      if (prev?.functional && !next.functional) purgeFunctionalStorage();
      if (opts.toAccount && user) {
        api.me.updateConsent({ functional: next.functional, analytics: next.analytics, advertising: next.advertising, gpc: next.gpc }).catch(() => undefined);
      }
      window.dispatchEvent(new CustomEvent("pc:consent", { detail: next }));
    },
    [user],
  );

  // GPC in the browser (e.g. extension-set) that the server didn't see: honor it immediately as opt-out of sale/sharing.
  React.useEffect(() => {
    if (!browserGpc()) return;
    setGpc(true);
    const cur = readConsentClient();
    if (cur && (cur.advertising || !cur.gpc)) persist(makeConsent(cur, true), { toAccount: true });
  }, [persist]);

  // Account copy: adopt it on a new device; otherwise push this device's choice to the account.
  React.useEffect(() => {
    if (!user || syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    api.me
      .consent()
      .then(({ consent: saved }) => {
        const local = readConsentClient();
        if (saved && (!local || Date.parse(saved.updatedAt) > Date.parse(local.updatedAt))) persist(makeConsent(saved, saved.gpc || gpc), { toAccount: false });
        else if (local && (!saved || Date.parse(local.updatedAt) > Date.parse(saved.updatedAt))) persist(local, { toAccount: true });
      })
      .catch(() => undefined);
  }, [user, gpc, persist]);

  // Analytics only runs with Analytics consent (default sink is a no-op; no provider is connected).
  React.useEffect(() => {
    analytics.setEnabled(Boolean(consent?.analytics));
  }, [consent?.analytics]);

  const save = React.useCallback(
    (choice: ConsentChoice) => {
      persist(makeConsent(choice, gpc), { toAccount: true });
      toast.success("Privacy choices saved", { description: gpc ? "Global Privacy Control signal honored: no sale or sharing." : undefined });
    },
    [gpc, persist],
  );

  const value = React.useMemo<ConsentValue>(() => ({ consent, gpc, save, openPreferences: () => setPrefsOpen(true) }), [consent, gpc, save]);

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {!consent && !prefsOpen ? <ConsentBanner /> : null}
      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent className="max-w-lg" data-testid="consent-preferences">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cookie aria-hidden className="size-4 text-primary" /> Privacy preferences
            </DialogTitle>
            <DialogDescription>Choose which optional cookies and similar technologies we may use. You can change this anytime.</DialogDescription>
          </DialogHeader>
          <PreferencesForm onDone={() => setPrefsOpen(false)} />
        </DialogContent>
      </Dialog>
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentValue {
  const ctx = React.useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used inside <ConsentProvider>");
  return ctx;
}

export function GpcNotice({ className }: { className?: string }) {
  const { gpc } = useConsent();
  if (!gpc) return null;
  return (
    <p className={"flex items-center gap-1.5 text-sm font-medium text-success " + (className ?? "")} data-testid="gpc-honored">
      <ShieldCheck aria-hidden className="size-4" /> Global Privacy Control signal honored — we treat it as your opt-out of sale/sharing.
    </p>
  );
}

/** Category switches; used in the dialog and on /privacy-choices. */
export function PreferencesForm({ onDone }: { onDone?: () => void }) {
  const { consent, gpc, save } = useConsent();
  const [choice, setChoice] = React.useState<ConsentChoice>({
    functional: consent?.functional ?? false,
    analytics: consent?.analytics ?? false,
    advertising: gpc ? false : (consent?.advertising ?? false),
  });
  const id = React.useId();
  return (
    <form
      className="mt-2 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(choice);
        onDone?.();
      }}
    >
      <GpcNotice />
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {CATEGORY_COPY.map((c) => {
          const locked = c.key === "necessary" || (c.key === "advertising" && gpc);
          const checked = c.key === "necessary" ? true : choice[c.key];
          return (
            <li key={c.key} className="flex items-start justify-between gap-4 p-3">
              <div>
                <label htmlFor={`${id}-${c.key}`} className="text-sm font-semibold text-text">
                  {c.title}
                </label>
                <p className="mt-0.5 text-xs text-text-muted">{c.body}</p>
                {c.key === "advertising" && gpc ? <p className="mt-1 text-xs font-medium text-success">Off because your browser sends Global Privacy Control.</p> : null}
              </div>
              <Switch
                id={`${id}-${c.key}`}
                checked={checked}
                disabled={locked}
                data-testid={`consent-switch-${c.key}`}
                onCheckedChange={(v) => {
                  if (c.key !== "necessary") setChoice((s) => ({ ...s, [c.key]: v }));
                }}
              />
            </li>
          );
        })}
      </ul>
      <DialogFooterLike>
        <Button type="button" variant="ghost" onClick={() => setChoice({ functional: false, analytics: false, advertising: false })}>
          Reject non-essential
        </Button>
        <Button type="submit" data-testid="consent-save">
          Save choices
        </Button>
      </DialogFooterLike>
      <p className="text-xs text-text-muted">
        Details: <Link href="/legal/cookies" className="text-primary underline underline-offset-2">Cookie policy</Link> ·{" "}
        <Link href="/privacy-choices" className="text-primary underline underline-offset-2">Your Privacy Choices</Link>
      </p>
    </form>
  );
}

function DialogFooterLike({ children }: { children: React.ReactNode }) {
  return <DialogFooter className="mt-1">{children}</DialogFooter>;
}

/** US-style notice banner: notice + Accept all / Reject non-essential / Manage. Non-modal; site stays usable. */
function ConsentBanner() {
  const { save, openPreferences, gpc } = useConsent();
  return (
    <section
      aria-label="Cookie notice"
      data-testid="consent-banner"
      className="fixed inset-x-3 bottom-3 z-toast mx-auto max-w-3xl rounded-lg border border-border bg-surface p-4 shadow-lg sm:inset-x-6"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="text-sm">
          <p className="font-semibold text-text">Your privacy choices</p>
          <p className="mt-1 text-text-muted">
            We use necessary cookies to run the site. With your OK we also use functional cookies (like remembering your ZIP), analytics, and
            affiliate measurement, which may count as “sharing” under some state laws.{" "}
            <Link href="/legal/privacy#notice-at-collection" className="text-primary underline underline-offset-2">
              Notice at collection
            </Link>
          </p>
          {gpc ? <GpcNotice className="mt-1.5" /> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={openPreferences} data-testid="consent-manage">
            Manage
          </Button>
          <Button variant="secondary" size="sm" onClick={() => save({ functional: false, analytics: false, advertising: false })} data-testid="consent-reject">
            Reject non-essential
          </Button>
          <Button size="sm" onClick={() => save({ functional: true, analytics: true, advertising: !gpc })} data-testid="consent-accept">
            Accept all
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Footer "Cookie settings" trigger. */
export function CookieSettingsButton({ className }: { className?: string }) {
  const { openPreferences } = useConsent();
  return (
    <button type="button" onClick={openPreferences} className={className} data-testid="cookie-settings">
      Cookie settings
    </button>
  );
}
