"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Clock, Folder, Package, Search, Tag, TrendingUp } from "lucide-react";
import type { Suggestion } from "@pricora/contracts";
import { Button, SearchInput, cn, formatPrice } from "@pricora/ui";
import { api } from "@/lib/api-browser";

const RECENT_KEY = "pc_recent_searches";

function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(q: string) {
  try {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

type Row =
  | { kind: "suggestion"; s: Suggestion }
  | { kind: "recent"; text: string }
  | { kind: "trending"; text: string };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function hrefFor(row: Row): string {
  if (row.kind !== "suggestion") return "/search?q=" + encodeURIComponent(row.text);
  const s = row.s;
  switch (s.type) {
    case "product":
      return "/products/" + s.slug;
    case "category":
      return "/categories/" + s.slug;
    case "brand":
      return "/brands/" + s.slug;
    default:
      return "/search?q=" + encodeURIComponent(s.text);
  }
}

function SearchBoxInner({ size = "lg", autoFocusShortcut = true, testId = "search-input" }: { size?: "md" | "lg"; autoFocusShortcut?: boolean; testId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQ = pathname === "/search" ? (params.get("q") ?? "") : "";
  const [q, setQ] = React.useState(urlQ);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [recent, setRecent] = React.useState<string[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const debounced = useDebounced(q.trim(), 150);

  React.useEffect(() => setQ(urlQ), [urlQ]);

  React.useEffect(() => {
    if (!autoFocusShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && t && !/input|textarea|select/i.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autoFocusShortcut]);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const suggest = useQuery({
    queryKey: ["suggest", debounced],
    queryFn: ({ signal }) => api.search.suggest(debounced, { signal }),
    enabled: open && debounced.length >= 2,
    staleTime: 60_000,
  });
  const trending = useQuery({
    queryKey: ["trending"],
    queryFn: () => api.search.trending(),
    enabled: open && debounced.length < 2,
    staleTime: 10 * 60_000,
  });

  const rows: Row[] = React.useMemo(() => {
    if (debounced.length >= 2) return (suggest.data?.items ?? []).slice(0, 10).map((s) => ({ kind: "suggestion", s }));
    const r: Row[] = recent.map((text) => ({ kind: "recent", text }));
    for (const t of (trending.data?.queries ?? []).slice(0, 6)) r.push({ kind: "trending", text: t.text });
    return r;
  }, [debounced, suggest.data, recent, trending.data]);

  const go = (href: string, text?: string) => {
    if (text) pushRecentSearch(text);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    router.push(href);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const row = active >= 0 ? rows[active] : undefined;
    if (row) {
      go(hrefFor(row), row.kind === "suggestion" ? (row.s.type === "query" ? row.s.text : undefined) : row.text);
      return;
    }
    const text = q.trim();
    if (!text) return;
    go("/search?q=" + encodeURIComponent(text), text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (rows.length ? (a + 1) % rows.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a <= 0 ? rows.length - 1 : a - 1) : -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const showPanel = open && (rows.length > 0 || suggest.isFetching || (debounced.length >= 2 && suggest.isSuccess));
  const listMounted = showPanel && rows.length > 0;

  return (
    <div ref={boxRef} className="relative w-full">
      <form role="search" onSubmit={submit} action="/search">
        <SearchInput
          ref={inputRef}
          name="q"
          size={size}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            setRecent(readRecent());
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onClear={() => {
            setQ("");
            inputRef.current?.focus();
          }}
          placeholder="Search products, brands, or paste a product URL"
          aria-label="Search products"
          combobox={{ expanded: listMounted, listboxId: listId, activeOptionId: listMounted && active >= 0 ? `${listId}-${active}` : null }}
          shortcut={autoFocusShortcut ? "/" : undefined}
          trailing={
            <Button type="submit" variant="accent" size={size === "lg" ? "md" : "sm"} className="hidden rounded-full px-5 font-bold sm:inline-flex">
              <Search aria-hidden />
              Search
            </Button>
          }
          data-testid={testId}
          className="rounded-full border-2 border-surface bg-surface shadow-none focus-visible:ring-2 focus-visible:ring-primary-fg focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
        />
      </form>
      {showPanel ? (
        <div className="absolute inset-x-0 top-full z-dropdown mt-1.5 overflow-hidden rounded-lg border border-border bg-surface shadow-md">
          {suggest.data?.degraded ? (
            <p className="border-b border-border bg-surface-2 px-3 py-1.5 text-2xs text-text-muted">
              Suggestions are limited right now (search index offline).
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-muted">
              {suggest.isFetching ? "Searching…" : "No suggestions. Press Enter to search."}
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Search suggestions" className="max-h-[60vh] overflow-y-auto py-1">
              {rows.map((row, i) => {
                const prevKind = i > 0 ? rows[i - 1]?.kind : undefined;
                const header =
                  row.kind !== prevKind && row.kind !== "suggestion"
                    ? row.kind === "recent"
                      ? "Recent searches"
                      : "Trending searches"
                    : null;
                return (
                  <React.Fragment key={i}>
                    {header ? (
                      <li role="none" aria-hidden="true" className="px-3 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-text-muted">
                        {header}
                      </li>
                    ) : null}
                    <li role="option" id={`${listId}-${i}`} aria-selected={i === active}>
                      <Link
                        href={hrefFor(row)}
                        onClick={(e) => {
                          e.preventDefault();
                          go(hrefFor(row), row.kind === "suggestion" ? (row.s.type === "query" ? row.s.text : undefined) : row.text);
                        }}
                        onMouseEnter={() => setActive(i)}
                        className={cn("flex items-center gap-3 px-3 py-2 text-sm", i === active && "bg-surface-2")}
                      >
                        <RowIcon row={row} />
                        <span className="min-w-0 flex-1 truncate">{row.kind === "suggestion" ? row.s.text : row.text}</span>
                        <RowMeta row={row} />
                      </Link>
                    </li>
                  </React.Fragment>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RowIcon({ row }: { row: Row }) {
  const cls = "size-4 shrink-0 text-text-muted";
  if (row.kind === "recent") return <Clock aria-hidden className={cls} />;
  if (row.kind === "trending") return <TrendingUp aria-hidden className={cls} />;
  const s = row.s;
  if (s.type === "product") {
    return s.imageUrl ? (
      <img src={s.imageUrl} alt="" className="size-8 shrink-0 rounded-sm bg-surface-2 object-contain" loading="lazy" />
    ) : (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-2">
        <Package aria-hidden className={cls} />
      </span>
    );
  }
  if (s.type === "category") return <Folder aria-hidden className={cls} />;
  if (s.type === "brand") return <Tag aria-hidden className={cls} />;
  return <Search aria-hidden className={cls} />;
}

function RowMeta({ row }: { row: Row }) {
  if (row.kind !== "suggestion") return null;
  const s = row.s;
  if (s.type === "product" && s.lowestPriceCents !== null) {
    return (
      <span className="price shrink-0 text-xs text-text-muted">
        from <span className="font-semibold text-text">{formatPrice(s.lowestPriceCents)}</span>
      </span>
    );
  }
  if (s.type === "category") return <span className="shrink-0 text-2xs text-text-muted">Category</span>;
  if (s.type === "brand") return <span className="shrink-0 text-2xs text-text-muted">Brand</span>;
  return null;
}

/** Header search with autocomplete (/v1/search/suggest), recent + trending searches. */
export function SearchBox(props: { size?: "md" | "lg"; autoFocusShortcut?: boolean; testId?: string }) {
  return (
    <React.Suspense
      fallback={
        <SearchInput
          size={props.size ?? "lg"}
          placeholder="Search products, brands, or paste a product URL"
          aria-label="Search products"
          readOnly
          className="rounded-full border-2 border-surface bg-surface"
          data-testid={props.testId ?? "search-input"}
        />
      }
    >
      <SearchBoxInner {...props} />
    </React.Suspense>
  );
}
