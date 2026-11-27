import { useCallback, useState } from "react";
import type { DealItem, DealsQuery, ConditionGroup } from "@pricora/contracts";

import { ConditionSwitch, FeedList } from "@/components/browse/FeedList";
import { AppText, Segmented } from "@/components/ui";
import { api } from "@/lib/api";

type Sort = DealsQuery["sort"];
const SORTS: readonly { value: Sort; label: string }[] = [
  { value: "score", label: "Deal Score" },
  { value: "drop", label: "Drop" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price" },
];

/** Deals ranked by Deal Score (GET /v1/deals). Fake-discount flags lower the score server-side. */
export default function DealsScreen() {
  const [sort, setSort] = useState<Sort>("score");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [condition, setCondition] = useState<ConditionGroup>("new");
  const toCard = useCallback(
    (d: DealItem) => ({
      card: { ...d.product, dealScore: d.dealScore.score },
      extras: {
        storeName: d.offer.retailer.name,
        priceCents: d.offer.priceCents,
        // The card's real previous price belongs to the lowest-price store; only show it when that is this offer.
        previousPriceCents: d.offer.priceCents === d.product.lowestPriceCents ? (d.product.previousPriceCents ?? null) : null,
      },
      demo: d.offer.source === "demo" || d.product.hasDemoData,
    }),
    [],
  );
  return (
    <FeedList
      queryKey={["deals", sort, category ?? null, condition]}
      fetchPage={(page, signal) => api.catalog.deals({ sort, category, condition, page, pageSize: 24 }, { signal })}
      toCard={toCard}
      category={category}
      onCategory={setCategory}
      emptyText="No deals match right now. Deals appear when a price is low against its own history."
      header={
        <>
          <ConditionSwitch value={condition} onChange={setCondition} />
          <AppText color="text-muted">Ranked by Deal Score — today’s price vs. the product’s own 90-day history and other stores. Sponsored placement can’t change it.</AppText>
          <Segmented options={SORTS} value={sort} onChange={setSort} />
        </>
      }
    />
  );
}
