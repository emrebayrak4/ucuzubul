"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, cn } from "@pricora/ui";

function SelectInner({ name, label, options, allLabel }: { name: string; label: string; options: Array<{ value: string; label: string }>; allLabel: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const params = useSearchParams();
  const [pending, start] = React.useTransition();
  return (
    <Select
      aria-label={label}
      size="sm"
      containerClassName="w-56"
      value={params.get(name) ?? ""}
      aria-busy={pending}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(name, e.target.value);
        else next.delete(name);
        next.delete("page");
        const s = next.toString();
        start(() => router.push(s ? `${pathname}?${s}` : pathname));
      }}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** A native select bound to one URL query param (resets pagination). */
export function UrlSelect(props: { name: string; label: string; options: Array<{ value: string; label: string }>; allLabel: string }) {
  return (
    <React.Suspense fallback={null}>
      <SelectInner {...props} />
    </React.Suspense>
  );
}

/** Segmented link tabs (server-provided hrefs; crawlable). */
export function LinkTabs({ items, label }: { items: Array<{ href: string; label: string; active: boolean }>; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex gap-0.5 rounded-md bg-surface-2 p-0.5">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center rounded-sm px-3 text-sm font-medium text-text-muted hover:text-text",
            i.active && "bg-surface text-text shadow-xs",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
