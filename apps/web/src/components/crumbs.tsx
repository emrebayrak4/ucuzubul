"use client";

import Link from "next/link";
import { Breadcrumbs, type BreadcrumbItem } from "@pricora/ui";

export function Crumbs({ items }: { items: BreadcrumbItem[] }) {
  return <Breadcrumbs items={items} linkComponent={Link} className="mb-3" />;
}
