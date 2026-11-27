import { useCallback, useState } from "react";
import type { PriceDropItem, PriceDropsQuery } from "@pricora/contracts";
import { FeedList } from "@/components/browse/FeedList";
import { AppText, Segmented } from "@/components/ui";
import { api } from "@/lib/api";

type Window = PriceDropsQuery["window"];
const WINDOWS: readonly { value: Window; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

/** Real price drops at the same store (GET /v1/price-drops): previous price struck through, current in drop color. */
export default function PriceDropsScreen() {
  const [win, setWin] = useState<Window>("7d");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const toCard = useCallback(
    (d: PriceDropItem) => ({
      card: d.product,
      extras: { priceCents: d.currentPriceCents, previousPriceCents: d.previousPriceCents, storeName: d.retailer.name, dropRatio: d.dropRatio },
      demo: d.source === "demo" || d.product.hasDemoData,
    }),
    [],
  );
  return (
    <FeedList
      queryKey={["price-drops", win, category ?? null]}
      fetchPage={(page, signal) => api.catalog.priceDrops({ window: win, category, page, pageSize: 24 }, { signal })}
      toCard={toCard}
      category={category}
      onCategory={setCategory}
      emptyText="No price drops in this window yet."
      header={
        <>
          <AppText color="text-muted">Previous vs. current price at the same store — never a list or “was” price.</AppText>
          <Segmented options={WINDOWS} value={win} onChange={setWin} />
        </>
      }
    />
  );
}
