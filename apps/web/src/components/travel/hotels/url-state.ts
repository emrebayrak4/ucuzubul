"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FILTER_KEYS } from "./url-keys";

export { FILTER_KEYS, STAY_KEYS } from "./url-keys";

export type ParamPatch = Record<string, string | null | undefined>;

/** URL-synced filter state. Every change replaces the URL (no history spam) and resets pagination. */
export function useHotelParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const update = React.useCallback(
    (patch: ParamPatch, opts: { keepPage?: boolean; push?: boolean; scroll?: boolean } = {}) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!opts.keepPage && !("page" in patch)) next.delete("page");
      const url = `${pathname}?${next.toString()}`;
      startTransition(() => (opts.push ? router.push(url, { scroll: opts.scroll ?? false }) : router.replace(url, { scroll: opts.scroll ?? false })));
    },
    [pathname, router, sp],
  );

  const list = React.useCallback((key: string) => (sp.get(key) ?? "").split(",").filter(Boolean), [sp]);

  const toggleIn = React.useCallback(
    (key: string, value: string) => {
      const cur = list(key);
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      update({ [key]: next.join(",") || null });
    },
    [list, update],
  );

  const clearFilters = React.useCallback(() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null]))), [update]);

  return { sp, update, list, toggleIn, clearFilters, pending };
}

export { fmtUsd } from "./format";
