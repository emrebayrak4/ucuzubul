/**
 * Built-in list of the 22 retailers seeded in packages/database (prisma/seed/reference.ts).
 * It bounds where the extension may run at all: manifest host_permissions and content-script matches are generated
 * from this list. Retailers added later by admins only become active after their domain is added here and a new
 * extension version ships (browsers do not let an installed extension widen its host access silently).
 *
 * This file must stay dependency-free: scripts/build.mjs imports it directly (Node type stripping).
 */
export interface BuiltInRetailer {
  slug: string;
  name: string;
  domain: string;
}

export const BUILT_IN_RETAILERS: readonly BuiltInRetailer[] = [
  { slug: "amazon", name: "Amazon", domain: "amazon.com" },
  { slug: "walmart", name: "Walmart", domain: "walmart.com" },
  { slug: "best-buy", name: "Best Buy", domain: "bestbuy.com" },
  { slug: "target", name: "Target", domain: "target.com" },
  { slug: "ebay", name: "eBay", domain: "ebay.com" },
  { slug: "costco", name: "Costco", domain: "costco.com" },
  { slug: "home-depot", name: "The Home Depot", domain: "homedepot.com" },
  { slug: "lowes", name: "Lowe's", domain: "lowes.com" },
  { slug: "newegg", name: "Newegg", domain: "newegg.com" },
  { slug: "bh-photo", name: "B&H Photo", domain: "bhphotovideo.com" },
  { slug: "macys", name: "Macy's", domain: "macys.com" },
  { slug: "kohls", name: "Kohl's", domain: "kohls.com" },
  { slug: "nordstrom", name: "Nordstrom", domain: "nordstrom.com" },
  { slug: "sephora", name: "Sephora", domain: "sephora.com" },
  { slug: "ulta", name: "Ulta Beauty", domain: "ulta.com" },
  { slug: "chewy", name: "Chewy", domain: "chewy.com" },
  { slug: "dicks", name: "Dick's Sporting Goods", domain: "dickssportinggoods.com" },
  { slug: "staples", name: "Staples", domain: "staples.com" },
  { slug: "wayfair", name: "Wayfair", domain: "wayfair.com" },
  { slug: "gamestop", name: "GameStop", domain: "gamestop.com" },
  { slug: "apple", name: "Apple", domain: "apple.com" },
  { slug: "back-market", name: "Back Market", domain: "backmarket.com" },
];

/** Manifest match patterns (https only) covering each domain and its subdomains. */
export function retailerMatchPatterns(retailers: readonly BuiltInRetailer[] = BUILT_IN_RETAILERS): string[] {
  return retailers.flatMap((r) => [`https://${r.domain}/*`, `https://*.${r.domain}/*`]);
}
