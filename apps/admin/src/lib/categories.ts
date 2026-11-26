"use client";

import { useQuery } from "@tanstack/react-query";
import type { CategoryNode } from "@pricora/contracts";
import { getApi } from "./api";

export interface FlatCategory {
  node: CategoryNode;
  depth: number;
  /** Ancestors' ids (root first). */
  path: string[];
}

export function flattenTree(nodes: CategoryNode[], depth = 0, path: string[] = []): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth, path });
    out.push(...flattenTree(n.children, depth + 1, [...path, n.id]));
  }
  return out;
}

/** Category tree via the public catalog endpoint (the admin API has no category list of its own). */
export function useCategoryTree() {
  return useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: ({ signal }) => getApi().catalog.categories({ signal }),
    staleTime: 60_000,
  });
}
