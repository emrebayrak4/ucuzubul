import { useEffect, useState } from "react";
import { API_ORIGIN, BRAND_NAME, webUrl } from "../shared/env";
import { sendMessage } from "../shared/messages";
import { BUILT_IN_RETAILERS } from "../shared/retailers";
import type { ExtensionSettings } from "../shared/settings";
import { Logo } from "../ui/Logo";
import { Switch } from "../ui/Switch";

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    sendMessage({ type: "settings:get" })
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const update = async (patch: Partial<ExtensionSettings>) => {
    if (settings) setSettings({ ...settings, ...patch }); // optimistic
    const next = await sendMessage({ type: "settings:set", patch }).catch(() => null);
    if (next) setSettings(next);
  };

  const clearCache = async () => {
    const res = await sendMessage({ type: "cache:clear" }).catch(() => null);
    setCleared(!!res?.ok);
  };

  const version = chrome.runtime.getManifest().version;

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <Logo />
          <span className="text-sm text-text-muted">Version {version}</span>
        </header>

        <section aria-labelledby="features" className="rounded-lg border border-border bg-surface px-5 py-2">
          <h1 id="features" className="pt-3 text-xl font-extrabold">
            Settings
          </h1>
          {!settings ? (
            <p className="py-3 text-base text-text-muted">Loading…</p>
          ) : (
            <div className="divide-y divide-border">
              <Switch
                id="priceComparison"
                checked={settings.priceComparison}
                onChange={(v) => void update({ priceComparison: v })}
                label="Price comparison banner"
                description="On product pages of supported stores, show a small note when another store has a lower estimated total."
              />
              <Switch
                id="couponFinder"
                checked={settings.couponFinder}
                onChange={(v) => void update({ couponFinder: v })}
                label="Coupon finder"
                description="Show the number of known codes on the toolbar icon, list them in the popup, and offer to try them at checkout (only when you click “Try them”)."
              />
              <Switch
                id="shareResults"
                checked={settings.shareResults}
                onChange={(v) => void update({ shareResults: v })}
                label="Share coupon results anonymously"
                description={`After trying codes, tell ${BRAND_NAME} which ones worked (worked or not, order total and savings) so success rates stay accurate. Sent without your account or cookies, with a random install ID (not linked to you) that prevents duplicate reports.`}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="privacy" className="mt-6 rounded-lg border border-border bg-surface p-5">
          <h2 id="privacy" className="text-lg font-extrabold">
            Privacy
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-text">
            <li>
              {BRAND_NAME} does <strong>not</strong> collect your browsing history. The extension only runs on the {BUILT_IN_RETAILERS.length} stores
              listed below and does nothing on any other site.
            </li>
            <li>
              On a supported store, it asks the {BRAND_NAME} API for that store&apos;s coupons and, on product pages, sends the product address
              (without tracking parameters) to look up prices at other stores. Results are kept in memory for up to an hour and cleared when the
              browser closes.
            </li>
            <li>
              Coupon codes are only entered at checkout after you click <strong>Try them</strong>. The extension never places an order and never
              reads payment fields.
            </li>
            <li>
              If you are logged in to {BRAND_NAME} in this browser, the extension uses that session only to show “Follow this store” — it does not
              store passwords or tokens. Coupon results are always sent anonymously, and only if sharing is on.
            </li>
            <li>No analytics, ads or third-party trackers are included. Fonts and icons are bundled with the extension.</li>
          </ul>
          <p className="mt-3 text-sm text-text-muted">
            Full policy:{" "}
            <a className="font-bold text-primary underline" href={webUrl.privacy()} target="_blank" rel="noopener noreferrer">
              {BRAND_NAME} privacy policy
            </a>{" "}
            (draft, pending legal review).
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void clearCache()}
              className="inline-flex h-9 items-center rounded-md border border-border bg-surface-2 px-3 text-base font-bold text-text hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-ring"
            >
              Clear cached data
            </button>
            <span role="status" className="text-sm text-text-muted">
              {cleared ? "Cleared." : ""}
            </span>
          </div>
        </section>

        <section aria-labelledby="stores" className="mt-6 rounded-lg border border-border bg-surface p-5">
          <h2 id="stores" className="text-lg font-extrabold">
            Supported stores
          </h2>
          <p className="mt-2 text-base text-text-muted">{BUILT_IN_RETAILERS.map((r) => r.name).join(", ")}.</p>
          <p className="mt-2 text-sm text-text-muted">
            Trying codes at checkout works only for stores whose checkout {BRAND_NAME} has set up and tested.
          </p>
          <p className="mt-4 text-xs text-text-muted">API: {API_ORIGIN}</p>
        </section>
      </div>
    </div>
  );
}
