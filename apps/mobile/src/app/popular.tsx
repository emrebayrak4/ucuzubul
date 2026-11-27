import { RankedList } from "@/components/browse/RankedList";

export default function PopularScreen() {
  return (
    <RankedList
      sort="popular"
      description="Ranked by how many tracked stores carry each product, then by Deal Score. We don't have sales data, so we never call these “best sellers” — and placement can't be bought."
    />
  );
}
