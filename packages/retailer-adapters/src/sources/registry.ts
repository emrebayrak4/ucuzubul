/**
 * Product sources that are neither a single retailer nor an affiliate network:
 *  - product_search: multi-retailer search with offers from many stores (Channel3)
 *  - product_content: specs and licensed images, no prices (Open Icecat)
 * Ingestion/enrichment jobs and Admin → Integrations entries for these live in apps/api (A04).
 */
import type { AdapterOptions } from "../base";
import { Channel3Client } from "./channel3";
import { IcecatClient } from "./icecat";

export type ProductSourceClient = Channel3Client | IcecatClient;

export interface ProductSourceMetadata {
  id: "channel3" | "icecat";
  name: string;
  kind: "product_search" | "product_content";
  docsUrl: string;
  signupUrl: string;
  requiredEnv: readonly string[];
  notes: string;
  create(options?: AdapterOptions): ProductSourceClient;
}

export const PRODUCT_SOURCE_REGISTRY: readonly ProductSourceMetadata[] = [
  {
    id: "channel3",
    name: "Channel3",
    kind: "product_search",
    docsUrl: "https://docs.trychannel3.com/",
    signupUrl: "https://trychannel3.com/sign-up",
    requiredEnv: ["CHANNEL3_API_KEY"],
    notes: "Search 100M+ products with offers from many US stores; buy links are Channel3-attributed (commission via Channel3). 1,000 searches/month free, then $0.007/search; product detail is free. No GTINs: match on brand/title.",
    create: (o) => new Channel3Client(o),
  },
  {
    id: "icecat",
    name: "Open Icecat",
    kind: "product_content",
    docsUrl: "https://iceclog.com/manual-for-icecat-json-product-requests/",
    signupUrl: "https://icecat.biz/en/registration",
    requiredEnv: ["ICECAT_SHOPNAME"],
    notes: "Free manufacturer-approved specs and images by GTIN or brand + MPN (sponsoring brands only in Open Icecat). Content only, no prices. Fair Use Policy applies.",
    create: (o) => new IcecatClient(o),
  },
];
