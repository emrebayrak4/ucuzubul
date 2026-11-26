"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@pricora/ui";
import { errorMessage } from "@/lib/api";
import { count } from "@/lib/format";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Server-side sort key sent as `sort` (omit → not sortable). */
  sortKey?: string;
  numeric?: boolean;
  className?: string;
}

export interface ListState {
  page: number;
  pageSize: number;
  q: string;
  sort: string | undefined;
  order: "asc" | "desc";
}

/** Local list state with a debounced search term (300ms) that resets paging. */
export function useListState(initial?: Partial<ListState>) {
  const [state, setState] = useState<ListState>({
    page: 1,
    pageSize: 25,
    q: "",
    sort: undefined,
    order: "desc",
    ...initial,
  });
  const [search, setSearch] = useState(state.q);
  useEffect(() => {
    const t = setTimeout(() => {
      setState((s) => (s.q === search.trim() ? s : { ...s, q: search.trim(), page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return {
    state,
    search,
    setSearch,
    setPage: (page: number) => setState((s) => ({ ...s, page })),
    setPageSize: (pageSize: number) => setState((s) => ({ ...s, pageSize, page: 1 })),
    toggleSort: (key: string) =>
      setState((s) =>
        s.sort === key ? { ...s, order: s.order === "asc" ? "desc" : "asc", page: 1 } : { ...s, sort: key, order: "asc", page: 1 },
      ),
    /** Query object for AdminListQuery-shaped endpoints. */
    query: {
      page: state.page,
      pageSize: state.pageSize,
      q: state.q || undefined,
      sort: state.sort,
      order: state.order,
    },
  };
}

export type ListController = ReturnType<typeof useListState>;

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
  list?: ListController;
  total?: number;
  totalPages?: number;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  caption?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRetry,
  list,
  total,
  totalPages,
  searchPlaceholder,
  toolbar,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  caption,
}: DataTableProps<T>) {
  return (
    <div className="flex flex-col gap-3">
      {list || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {list ? (
            <SearchInput
              size="sm"
              value={list.search}
              onChange={(e) => list.setSearch(e.target.value)}
              onClear={() => list.setSearch("")}
              placeholder={searchPlaceholder ?? "Search"}
              aria-label={searchPlaceholder ?? "Search"}
              containerClassName="w-full sm:w-72"
            />
          ) : null}
          {toolbar}
          {list && total !== undefined ? (
            <span className="ml-auto text-xs text-text-muted tabular-nums">{count(total)} results</span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <ErrorState title="Could not load data" description={errorMessage(error)} onRetry={onRetry} className="rounded-md border border-border bg-surface" />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <Table>
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <TableHeader>
              <TableRow>
                {columns.map((c) => {
                  const sorted = list && c.sortKey && list.state.sort === c.sortKey;
                  return (
                    <TableHead
                      key={c.key}
                      numeric={c.numeric}
                      className={cn("whitespace-nowrap", c.className)}
                      aria-sort={sorted ? (list.state.order === "asc" ? "ascending" : "descending") : undefined}
                    >
                      {list && c.sortKey ? (
                        <button
                          type="button"
                          onClick={() => list.toggleSort(c.sortKey as string)}
                          className={cn("inline-flex items-center gap-1 hover:text-text", c.numeric && "flex-row-reverse")}
                        >
                          {c.header}
                          {sorted ? (
                            list.state.order === "asc" ? (
                              <ArrowUp className="size-3" aria-hidden />
                            ) : (
                              <ArrowDown className="size-3" aria-hidden />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !rows
                ? Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={`sk-${i}`}>
                      {columns.map((c) => (
                        <TableCell key={c.key}>
                          <Skeleton className="h-4 w-full max-w-40" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows?.map((row) => (
                    <TableRow key={rowKey(row)}>
                      {columns.map((c) => (
                        <TableCell key={c.key} numeric={c.numeric} className={c.className}>
                          {c.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
          {!isLoading && rows && rows.length === 0 ? (
            <EmptyState size="sm" title={emptyTitle} description={emptyDescription ?? (list?.state.q ? "Try a different search term." : undefined)} className="border-t border-border" />
          ) : null}
        </div>
      )}

      {list && totalPages !== undefined && totalPages > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Rows
            <Select size="sm" value={String(list.state.pageSize)} onChange={(e) => list.setPageSize(Number(e.target.value))} containerClassName="w-20">
              {[10, 25, 50, 60].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <Pagination page={list.state.page} pageCount={totalPages} onPageChange={list.setPage} />
        </div>
      ) : null}
    </div>
  );
}
