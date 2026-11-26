"use client";

import { z } from "zod";
import { createLocalStore } from "./local-store";

const Item = z.object({
  productId: z.string(),
  slug: z.string(),
  title: z.string(),
  qty: z.number().int().min(1).max(99),
  imageUrl: z.string().nullable(),
  lowestPriceCents: z.number().int().nullable(),
  hasDemoData: z.boolean(),
});
export type BasketItem = z.infer<typeof Item>;
const EMPTY: BasketItem[] = [];

export const basketStore = createLocalStore<BasketItem[]>("pc_basket", EMPTY, (v) => {
  const r = z.array(Item).max(50).safeParse(v);
  return r.success ? r.data : null;
});

export function addToBasket(item: Omit<BasketItem, "qty"> & { qty?: number }) {
  basketStore.set((prev) => {
    const existing = prev.find((i) => i.productId === item.productId);
    if (existing) {
      return prev.map((i) => (i.productId === item.productId ? { ...i, qty: Math.min(99, i.qty + (item.qty ?? 1)) } : i));
    }
    return [...prev, { ...item, qty: item.qty ?? 1 }].slice(0, 50);
  });
}

export function setBasketQty(productId: string, qty: number) {
  basketStore.set((prev) => prev.map((i) => (i.productId === productId ? { ...i, qty: Math.max(1, Math.min(99, qty)) } : i)));
}

export function removeFromBasket(productId: string) {
  basketStore.set((prev) => prev.filter((i) => i.productId !== productId));
}
