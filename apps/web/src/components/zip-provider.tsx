"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Crosshair, MapPin, X } from "lucide-react";
import type { ZipConfidence, ZipSource } from "@pricora/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldMessage,
  Input,
  Label,
  toast,
} from "@pricora/ui";
import { api } from "@/lib/api-browser";
import { useSession } from "@/lib/session";
import { preferenceStorage, readConsentClient } from "@/lib/privacy/consent";
import { ZIP_RE, readZipCookie, readZipMeta, setZipCookie, writeZipMeta, type ZipMeta } from "@/lib/zip";

/**
 * ZIP resolution order (docs/PRIVACY.md → "ZIP resolution"):
 *  1. saved account preference  2. ZIP cookie  3. edge/IP estimate (shown as "Estimated", never saved automatically)
 *  4. "Use my location" — only after an explicit click (dialog button or the one-time prompt chip) → nearest Census ZCTA.
 * Every value carries its source + confidence and can be overridden from the dialog.
 */
export interface EdgeZipGuess {
  zip: string | null;
  state: string | null;
}

interface ZipValue {
  zip: string | null;
  meta: ZipMeta | null;
  openZipDialog: () => void;
  setZip: (zip: string | null, meta?: ZipMeta) => Promise<void>;
  locate: () => Promise<boolean>;
  locating: boolean;
}

const ZipContext = React.createContext<ZipValue | null>(null);
const PROMPT_KEY = "pc_zip_prompt";

export const SOURCE_LABEL: Record<ZipSource, string> = {
  account: "saved in your account",
  cookie: "saved on this device",
  manual: "entered by you",
  location: "from your location",
  edge: "estimated from your network",
};

/** Coordinates are rounded to 3 decimals (~110 m) before they leave the browser; the API never stores them. */
async function zipFromBrowserLocation(): Promise<{ zip: string; meta: ZipMeta } | { error: string }> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return { error: "Your browser doesn't support location." };
  const pos = await new Promise<GeolocationPosition | GeolocationPositionError>((resolve) =>
    navigator.geolocation.getCurrentPosition(resolve, resolve, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 }),
  );
  if (!("coords" in pos)) {
    return { error: pos.code === pos.PERMISSION_DENIED ? "Location permission was denied. You can type your ZIP instead." : "We couldn't get your location. Try typing your ZIP." };
  }
  const round = (v: number) => Math.round(v * 1000) / 1000;
  try {
    const hit = await api.geo.zipNear(round(pos.coords.latitude), round(pos.coords.longitude));
    if (!hit.zip) return { error: "Your location doesn't match a US ZIP code. Type a US ZIP to see tax estimates." };
    return { zip: hit.zip, meta: { source: "location", confidence: hit.confidence, label: [hit.city, hit.state].filter(Boolean).join(", ") || null } };
  } catch {
    return { error: "ZIP lookup failed. Please type your ZIP." };
  }
}

export function ZipProvider({ edgeGuess = null, children }: { edgeGuess?: EdgeZipGuess | null; children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useSession();
  const [zip, setZipState] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<ZipMeta | null>(null);
  const [open, setOpen] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // Cookie is the source of truth (SSR reads it for tax estimates); sync once on mount.
    const c = readZipCookie();
    if (c) {
      setZipState(c);
      setMeta(readZipMeta() ?? { source: "cookie", confidence: null });
    } else if (edgeGuess?.zip) {
      setZipState(edgeGuess.zip);
      setMeta({ source: "edge", confidence: "low", label: edgeGuess.state });
    }
    setMounted(true);
  }, [edgeGuess]);

  const setZip = React.useCallback(
    async (next: string | null, nextMeta: ZipMeta = { source: "manual", confidence: null }) => {
      setZipCookie(next);
      writeZipMeta(next ? nextMeta : null);
      setZipState(next);
      setMeta(next ? nextMeta : null);
      if (user && next && nextMeta.source !== "account") {
        // Best effort: keep the account preference in sync; cookie already drives tax estimates.
        api.me.updatePreferences({ zip: next }).catch(() => undefined);
      }
      router.refresh();
    },
    [router, user],
  );

  // 1. Saved account preference wins over the device cookie.
  React.useEffect(() => {
    if (!mounted || !user?.zip || !ZIP_RE.test(user.zip.slice(0, 5))) return;
    const accountZip = user.zip.slice(0, 5);
    if (readZipCookie() !== accountZip) void setZip(accountZip, { source: "account", confidence: null });
  }, [mounted, user?.zip, setZip]);

  // Consent changed → re-issue the ZIP cookie with the allowed lifetime (persistent vs session-only).
  React.useEffect(() => {
    const onConsent = () => {
      const c = readZipCookie();
      if (c) {
        setZipCookie(c);
        writeZipMeta(readZipMeta());
      }
    };
    window.addEventListener("pc:consent", onConsent);
    return () => window.removeEventListener("pc:consent", onConsent);
  }, []);

  const locate = React.useCallback(async () => {
    setLocating(true);
    try {
      const r = await zipFromBrowserLocation();
      if ("error" in r) {
        toast.error(r.error);
        return false;
      }
      await setZip(r.zip, r.meta);
      toast.success(`ZIP set to ${r.zip}${r.meta.label ? ` (${r.meta.label})` : ""}`, {
        description: `Nearest ZIP area to your location · ${r.meta.confidence ?? "unknown"} confidence. Change it anytime.`,
      });
      return true;
    } finally {
      setLocating(false);
    }
  }, [setZip]);

  const value = React.useMemo(() => ({ zip, meta, setZip, openZipDialog: () => setOpen(true), locate, locating }), [zip, meta, setZip, locate, locating]);

  return (
    <ZipContext.Provider value={value}>
      {children}
      <ZipDialog open={open} onOpenChange={setOpen} current={meta?.source === "edge" ? null : zip} meta={meta} estimated={meta?.source === "edge" ? zip : null} onSave={setZip} locate={locate} locating={locating} />
      {mounted ? <ZipPromptChip hasSavedZip={Boolean(zip && meta?.source !== "edge")} dialogOpen={open} /> : null}
    </ZipContext.Provider>
  );
}

export function useZip(): ZipValue {
  const ctx = React.useContext(ZipContext);
  if (!ctx) throw new Error("useZip must be used inside <ZipProvider>");
  return ctx;
}

function confidenceText(c: ZipConfidence | null): string {
  return c ? `${c} confidence` : "";
}

function ZipDialog({
  open,
  onOpenChange,
  current,
  meta,
  estimated,
  onSave,
  locate,
  locating,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string | null;
  meta: ZipMeta | null;
  estimated: string | null;
  onSave: (zip: string | null, meta?: ZipMeta) => Promise<void>;
  locate: () => Promise<boolean>;
  locating: boolean;
}) {
  const [value, setValue] = React.useState(current ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (open) {
      setValue(current ?? estimated ?? "");
      setError(null);
    }
  }, [open, current, estimated]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim().slice(0, 5);
    if (!ZIP_RE.test(v)) {
      setError("Enter a 5-digit US ZIP code.");
      return;
    }
    await onSave(v, { source: "manual", confidence: null });
    toast.success(`ZIP set to ${v}`, { description: "Tax and totals are now estimated for this area." });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="zip-dialog">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin aria-hidden className="size-4 text-primary" /> Set your ZIP code
            </DialogTitle>
            <DialogDescription>
              Used only to estimate sales tax and delivered totals. Kept in a cookie on this device
              {readConsentClient()?.functional ? "" : " until you close the browser (Functional cookies are off)"}.
            </DialogDescription>
          </DialogHeader>
          {meta && (current || estimated) ? (
            <p className="mt-3 rounded-sm bg-surface-2 px-2.5 py-1.5 text-xs text-text-muted" data-testid="zip-source">
              {estimated ? `Estimated: ${estimated}` : `Current: ${current}`}
              {meta.label ? ` · ${meta.label}` : ""} · {SOURCE_LABEL[meta.source]}
              {meta.confidence ? ` · ${confidenceText(meta.confidence)}` : ""}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            fullWidth
            className="mt-4"
            loading={locating}
            data-testid="zip-use-location"
            onClick={async () => {
              if (await locate()) onOpenChange(false);
            }}
          >
            <Crosshair aria-hidden /> Use my location
          </Button>
          <p className="mt-1.5 text-2xs text-text-muted">Your browser asks for permission. We look up the nearest ZIP once and don&apos;t store your location.</p>
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor={id}>ZIP code</Label>
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={value}
              invalid={Boolean(error)}
              aria-describedby={error ? id + "-err" : undefined}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 10001"
              data-testid="zip-input"
            />
            {error ? (
              <FieldMessage id={id + "-err"} tone="error">
                {error}
              </FieldMessage>
            ) : null}
          </div>
          <DialogFooter className="mt-5">
            {current ? (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  await onSave(null);
                  onOpenChange(false);
                }}
              >
                Clear ZIP
              </Button>
            ) : null}
            <Button type="submit">Save ZIP</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One-time, unobtrusive chip. Never triggers a permission prompt by itself — only the button click does. */
function ZipPromptChip({ hasSavedZip, dialogOpen }: { hasSavedZip: boolean; dialogOpen: boolean }) {
  const { locate, locating, openZipDialog } = useZip();
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (hasSavedZip) return setVisible(false);
    let dismissed: boolean;
    try {
      dismissed = Boolean(window.localStorage.getItem(PROMPT_KEY) ?? window.sessionStorage.getItem(PROMPT_KEY));
    } catch {
      dismissed = true;
    }
    if (dismissed) return;
    // Wait until the cookie banner is answered so the two never stack.
    const t = window.setInterval(() => {
      if (readConsentClient()) {
        setVisible(true);
        window.clearInterval(t);
      }
    }, 1500);
    return () => window.clearInterval(t);
  }, [hasSavedZip]);

  const dismiss = () => {
    try {
      preferenceStorage()?.setItem(PROMPT_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible || dialogOpen) return null;
  return (
    <div
      role="region"
      aria-label="Tax-inclusive totals"
      data-testid="zip-prompt"
      className="fixed bottom-4 left-4 z-toast flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-3 pr-1.5 text-sm shadow-md"
    >
      <MapPin aria-hidden className="size-4 shrink-0 text-primary" />
      <span className="text-text">Show tax-inclusive totals for your area?</span>
      <Button
        size="sm"
        variant="soft"
        loading={locating}
        data-testid="zip-prompt-locate"
        onClick={async () => {
          if (await locate()) dismiss();
        }}
      >
        Use my location
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          dismiss();
          openZipDialog();
        }}
      >
        Enter ZIP
      </Button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded-full p-1 text-text-muted hover:bg-surface-2 hover:text-text">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/** Inline "Set ZIP" trigger used in offer tables and totals. */
export function SetZipButton({ label = "Set ZIP", className }: { label?: string; className?: string }) {
  const { openZipDialog } = useZip();
  return (
    <button
      type="button"
      onClick={openZipDialog}
      className={"rounded-xs text-xs font-medium text-primary underline-offset-2 hover:underline " + (className ?? "")}
    >
      {label}
    </button>
  );
}
