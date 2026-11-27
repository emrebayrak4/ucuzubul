/**
 * Real storefronts per non-US market (markets session). Every storefront is its own Retailer row
 * (own domain, own currency) linked to its market via RetailerMarket. integrationStatus stays
 * pending_configuration — no keys, no fake data. Affiliate routes come from read-only research on
 * 2026-11-27 (docs/DATA_SOURCES.md "Markets"): `verified: false` means only third-party directories
 * pointed to it; `network: null` means no affiliate programme was found.
 */
import type { MarketId } from "@pricora/config";

export type MarketRetailerKind = "general" | "electronics" | "fashion" | "home" | "office" | "diy";

export type SeedNetwork =
  | "amazon_associates"
  | "awin"
  | "cj"
  | "impact"
  | "rakuten"
  | "partnerize"
  | "tradedoubler"
  | "effinity"
  | "valuecommerce"
  | "rakuten_jp"
  | "ebay_partner"
  | "direct";

export interface SeedMarketRetailer {
  slug: string;
  name: string;
  market: Exclude<MarketId, "us">;
  domain: string;
  /** Extra hosts our redirect may land on (e.g. search subdomains). */
  extraHosts?: string[];
  brandColor: string;
  /** Real search page; `{q}` = URL-encoded product title. */
  searchUrl: string;
  group?: string;
  kinds: MarketRetailerKind[];
  affiliate: {
    network: SeedNetwork | null;
    program: string | null;
    signupUrl?: string;
    verified: boolean;
    notes?: string;
  };
}

const amazon = (
  market: SeedMarketRetailer["market"],
  tld: string,
  program: string,
  signupUrl: string,
  verified = true,
  notes?: string,
): SeedMarketRetailer => ({
  slug: "amazon-" + market,
  name: "Amazon." + tld,
  market,
  domain: "amazon." + tld,
  brandColor: "#FF9900",
  searchUrl: "https://www.amazon." + tld + "/s?k={q}",
  group: "amazon",
  kinds: ["general", "electronics", "home", "fashion", "office", "diy"],
  affiliate: {
    network: "amazon_associates",
    program,
    signupUrl,
    verified,
    notes: notes ?? "Separate Associates account per locale. Product data via the Creators API (PA-API 5 retired 2026).",
  },
});

const mediamarkt = (
  market: "de" | "es" | "nl" | "tr",
  domain: string,
  path: string,
  affiliate: SeedMarketRetailer["affiliate"],
): SeedMarketRetailer => ({
  slug: "mediamarkt-" + market,
  name: "MediaMarkt",
  market,
  domain,
  brandColor: "#DF0000",
  searchUrl: "https://www." + domain + path + "/search.html?query={q}",
  group: "mediamarkt",
  kinds: ["electronics", "home"],
  affiliate,
});

export const MARKET_RETAILERS: SeedMarketRetailer[] = [
  // ── United Kingdom ──
  amazon("uk", "co.uk", "Amazon.co.uk Associates", "https://affiliate-program.amazon.co.uk/"),
  { slug: "argos", name: "Argos", market: "uk", domain: "argos.co.uk", brandColor: "#D42114", searchUrl: "https://www.argos.co.uk/search/{q}/", kinds: ["general", "electronics", "home", "office"], affiliate: { network: "cj", program: "Argos (CJ Affiliate)", verified: false, notes: "Directories agree on CJ; one listing shows it paused. Confirm in CJ advertiser search." } },
  { slug: "currys", name: "Currys", market: "uk", domain: "currys.co.uk", brandColor: "#4C2A85", searchUrl: "https://www.currys.co.uk/search?q={q}", kinds: ["electronics", "home"], affiliate: { network: "awin", program: "Awin — Currys (merchant 1599)", signupUrl: "https://ui.awin.com/merchant-profile/1599", verified: true, notes: "Daily product feed via Awin. Only programme-issued codes. #Ad labelling." } },
  { slug: "john-lewis", name: "John Lewis", market: "uk", domain: "johnlewis.com", brandColor: "#1C1C1C", searchUrl: "https://www.johnlewis.com/search?search-term={q}", kinds: ["general", "electronics", "home", "fashion"], affiliate: { network: "impact", program: "John Lewis (Impact, managed by Silverbean)", verified: false, notes: "Source is 2020 agency-appointment press; no official affiliates page found." } },
  { slug: "ao", name: "AO.com", market: "uk", domain: "ao.com", brandColor: "#5FA92D", searchUrl: "https://ao.com/search?search={q}", kinds: ["electronics", "home"], affiliate: { network: "awin", program: "Awin — AO.com (merchant 19526)", signupUrl: "https://ao.com/affiliates", verified: true, notes: "30-day cookie; no brand-keyword PPC." } },
  { slug: "very", name: "Very", market: "uk", domain: "very.co.uk", brandColor: "#E6007E", searchUrl: "https://www.very.co.uk/e/q/{q}.end", kinds: ["general", "electronics", "home", "fashion"], affiliate: { network: "awin", program: "Awin — Very (merchant 3090)", signupUrl: "https://www.very.co.uk/affiliates.page", verified: true, notes: "Feed may not be used for Google Shopping; some brands excluded." } },
  { slug: "ebay-uk", name: "eBay UK", market: "uk", domain: "ebay.co.uk", brandColor: "#E53238", searchUrl: "https://www.ebay.co.uk/sch/i.html?_nkw={q}", group: "ebay", kinds: ["general", "electronics", "home", "fashion", "diy"], affiliate: { network: "ebay_partner", program: "eBay Partner Network (UK)", signupUrl: "https://partnernetwork.ebay.co.uk/", verified: true, notes: "Product data via eBay Browse API (EBAY_GB marketplace)." } },

  // ── Germany ──
  amazon("de", "de", "Amazon.de PartnerNet", "https://partnernet.amazon.de/"),
  mediamarkt("de", "mediamarkt.de", "/de", { network: null, program: null, verified: false, notes: "No active direct programme found (Awin 'MediaMarkt DE' inactive). Ask MediaMarktSaturn directly." }),
  { slug: "saturn", name: "Saturn", market: "de", domain: "saturn.de", brandColor: "#EF7C00", searchUrl: "https://www.saturn.de/de/search.html?query={q}", group: "mediamarkt", kinds: ["electronics", "home"], affiliate: { network: null, program: null, verified: false, notes: "No active direct programme found (Awin 'Saturn DE' inactive; only sub-networks)." } },
  { slug: "otto", name: "OTTO", market: "de", domain: "otto.de", brandColor: "#D52B1E", searchUrl: "https://www.otto.de/suche/{q}/", kinds: ["general", "electronics", "home", "fashion"], affiliate: { network: "awin", program: "Awin — OTTO (merchant 14336)", signupUrl: "https://www.otto.de/partnerprogramm/", verified: true, notes: "Coupon/cashback portals excluded unless in the Closed Group. Product feeds via Awin." } },
  { slug: "cyberport", name: "Cyberport", market: "de", domain: "cyberport.de", brandColor: "#00468C", searchUrl: "https://www.cyberport.de/tools/search-results.html?q={q}", kinds: ["electronics"], affiliate: { network: "awin", program: "Awin — Cyberport (merchant 11657)", signupUrl: "https://ui.awin.com/merchant-profile/11657", verified: true, notes: "No brand bidding; Cyberport creatives only." } },
  { slug: "notebooksbilliger", name: "notebooksbilliger.de", market: "de", domain: "notebooksbilliger.de", brandColor: "#D6001C", searchUrl: "https://www.notebooksbilliger.de/produkte/{q}", kinds: ["electronics"], affiliate: { network: "awin", program: "Awin — notebooksbilliger DE/AT (merchant 11348)", signupUrl: "https://ui.awin.com/merchant-profile/11348", verified: true, notes: "Only released codes; no brand bidding." } },
  { slug: "zalando-de", name: "Zalando", market: "de", domain: "zalando.de", brandColor: "#FF6900", searchUrl: "https://www.zalando.de/katalog/?q={q}", group: "zalando", kinds: ["fashion"], affiliate: { network: null, program: null, verified: false, notes: "Main shop: no open programme found; only 'Lounge by Zalando' (outlet) is on Awin. Contact affiliate@zalando.de." } },

  // ── France ──
  amazon("fr", "fr", "Amazon.fr Partenaires", "https://partenaires.amazon.fr/"),
  { slug: "fnac", name: "Fnac", market: "fr", domain: "fnac.com", brandColor: "#E1A925", searchUrl: "https://www.fnac.com/SearchResult/ResultList.aspx?Search={q}", group: "fnac-darty", kinds: ["electronics", "general", "home"], affiliate: { network: "awin", program: "Awin — Fnac", signupUrl: "https://ui.awin.com/merchant-profile/12665", verified: true, notes: "10-day cookie; ticketing and gift cards excluded. FR merchant id not verified." } },
  { slug: "darty", name: "Darty", market: "fr", domain: "darty.com", brandColor: "#E30613", searchUrl: "https://www.darty.com/nav/recherche?text={q}", group: "fnac-darty", kinds: ["electronics", "home"], affiliate: { network: "effinity", program: "Darty (Effinity; also listed on Awin 7735)", signupUrl: "https://www.darty.com/services/partenaires/affiliation", verified: true, notes: "Sources conflict between Effinity and Awin — check both." } },
  { slug: "cdiscount", name: "Cdiscount", market: "fr", domain: "cdiscount.com", brandColor: "#0064D2", searchUrl: "https://www.cdiscount.com/search/10/{q}.html", kinds: ["general", "electronics", "home", "diy"], affiliate: { network: "awin", program: "Awin — Cdiscount (merchant 6948)", signupUrl: "https://ui.awin.com/merchant-profile/6948", verified: true, notes: "7-day cookie; scripted actions banned." } },
  { slug: "boulanger", name: "Boulanger", market: "fr", domain: "boulanger.com", brandColor: "#ED7203", searchUrl: "https://www.boulanger.com/resultats?tr={q}", kinds: ["electronics", "home"], affiliate: { network: "effinity", program: "Boulanger (Effinity)", verified: false, notes: "Directory marks the Effinity listing closed. Contact affiliation@boulanger.com." } },

  // ── Spain ──
  amazon("es", "es", "Amazon.es Afiliados", "https://afiliados.amazon.es/"),
  { slug: "el-corte-ingles", name: "El Corte Inglés", market: "es", domain: "elcorteingles.es", brandColor: "#00873C", searchUrl: "https://www.elcorteingles.es/search-nwx/1/?s={q}", kinds: ["general", "electronics", "home", "fashion"], affiliate: { network: "awin", program: "Awin — El Corte Inglés (merchant 13075)", signupUrl: "https://ui.awin.com/merchant-profile/13075", verified: true, notes: "No cashback. Supermarket/travel/refurbished excluded." } },
  { slug: "pccomponentes", name: "PcComponentes", market: "es", domain: "pccomponentes.com", brandColor: "#FF6000", searchUrl: "https://www.pccomponentes.com/buscar/?query={q}", kinds: ["electronics", "home"], affiliate: { network: "awin", program: "Awin — PcComponentes (merchant 20982)", signupUrl: "https://ui.awin.com/merchant-profile/20982", verified: true, notes: "7-day cookie; no brand bidding." } },
  mediamarkt("es", "mediamarkt.es", "/es", { network: "tradedoubler", program: "Tradedoubler — MediaMarkt ES", verified: true, notes: "Tradedoubler 2025 case study." }),

  // ── Italy ──
  amazon("it", "it", "Amazon.it Programma di affiliazione", "https://programma-affiliazione.amazon.it/"),
  { slug: "mediaworld", name: "MediaWorld", market: "it", domain: "mediaworld.it", brandColor: "#DF0000", searchUrl: "https://www.mediaworld.it/it/search.html?query={q}", group: "mediamarkt", kinds: ["electronics", "home"], affiliate: { network: "awin", program: "Awin — MediaWorld IT (merchant 18529)", signupUrl: "https://ui.awin.com/merchant-profile/18529", verified: true } },
  { slug: "unieuro", name: "Unieuro", market: "it", domain: "unieuro.it", brandColor: "#D90F28", searchUrl: "https://www.unieuro.it/online/?q={q}", group: "fnac-darty", kinds: ["electronics", "home"], affiliate: { network: "awin", program: "Awin — Unieuro (merchant 10139)", signupUrl: "https://ui.awin.com/merchant-profile/10139", verified: true, notes: "Data feeds offered; part of Fnac Darty since 2025." } },
  { slug: "eprice", name: "ePRICE", market: "it", domain: "eprice.it", brandColor: "#F26522", searchUrl: "https://www.eprice.it/search?q={q}", kinds: ["electronics", "home"], affiliate: { network: null, program: null, verified: false, notes: "Network programmes closed; sub-network only. Treat as no direct programme." } },

  // ── Netherlands ──
  { slug: "bol", name: "bol", market: "nl", domain: "bol.com", brandColor: "#0000A4", searchUrl: "https://www.bol.com/nl/nl/s/?searchtext={q}", kinds: ["general", "electronics", "home", "fashion", "office", "diy"], affiliate: { network: "direct", program: "bol.com Partnerprogramma", signupUrl: "https://partner.bol.com/", verified: true, notes: "Product feed (FTP, 2-hourly) + Marketing Catalog API + Affiliate Reporting API." } },
  { slug: "coolblue", name: "Coolblue", market: "nl", domain: "coolblue.nl", brandColor: "#0090E3", searchUrl: "https://www.coolblue.nl/zoeken?query={q}", kinds: ["electronics", "home"], affiliate: { network: "awin", program: "Awin — Coolblue NL", signupUrl: "https://www.coolblue.nl/affiliate", verified: true } },
  amazon("nl", "nl", "Amazon.nl Associates", "https://partnernet.amazon.nl/"),
  mediamarkt("nl", "mediamarkt.nl", "/nl", { network: "tradedoubler", program: "Tradedoubler — MediaMarkt NL", signupUrl: "https://www.mediamarkt.nl/nl/shop/affiliate.html", verified: true, notes: "30-day cookie." }),

  // ── Canada ──
  amazon("ca", "ca", "Amazon.ca Associates", "https://associates.amazon.ca/"),
  { slug: "best-buy-ca", name: "Best Buy Canada", market: "ca", domain: "bestbuy.ca", brandColor: "#0046BE", searchUrl: "https://www.bestbuy.ca/en-ca/search?search={q}", kinds: ["electronics", "home"], affiliate: { network: "impact", program: "Best Buy Canada (Impact)", signupUrl: "https://www.bestbuy.ca/en-ca/about/affiliate-program/blt82df225e80ec75e9", verified: true } },
  { slug: "walmart-ca", name: "Walmart Canada", market: "ca", domain: "walmart.ca", brandColor: "#0071DC", searchUrl: "https://www.walmart.ca/search?q={q}", group: "walmart", kinds: ["general", "electronics", "home", "office"], affiliate: { network: "rakuten", program: "Walmart Canada (Rakuten Advertising)", signupUrl: "https://www.walmart.ca/en/cp/affiliate-program/6000208941216", verified: true, notes: "Separate from Walmart US (Impact)." } },
  { slug: "canadian-tire", name: "Canadian Tire", market: "ca", domain: "canadiantire.ca", brandColor: "#D6001C", searchUrl: "https://www.canadiantire.ca/en/search-results.html?q={q}", kinds: ["home", "diy", "general"], affiliate: { network: "impact", program: "Canadian Tire (Impact)", verified: false, notes: "Directory: Impact open, CJ closed." } },
  { slug: "staples-ca", name: "Staples Canada", market: "ca", domain: "staples.ca", brandColor: "#CC0000", searchUrl: "https://www.staples.ca/search?query={q}", kinds: ["office", "electronics"], affiliate: { network: "impact", program: "Staples Canada (Impact)", verified: false, notes: "Directory: Impact open, CJ paused." } },

  // ── Australia ──
  amazon("au", "com.au", "Amazon.com.au Associates", "https://affiliate-program.amazon.com.au/"),
  { slug: "jb-hi-fi", name: "JB Hi-Fi", market: "au", domain: "jbhifi.com.au", brandColor: "#F5D300", searchUrl: "https://www.jbhifi.com.au/search?query={q}", kinds: ["electronics", "home"], affiliate: { network: "partnerize", program: "JB Hi-Fi (Partnerize)", verified: false, notes: "Directory says live on Partnerize since Apr 2026; no official page found." } },
  { slug: "harvey-norman", name: "Harvey Norman", market: "au", domain: "harveynorman.com.au", brandColor: "#E4002B", searchUrl: "https://www.harveynorman.com.au/catalogsearch/result/?q={q}", kinds: ["electronics", "home"], affiliate: { network: null, program: null, verified: false, notes: "No affiliate programme found." } },
  { slug: "the-good-guys", name: "The Good Guys", market: "au", domain: "thegoodguys.com.au", brandColor: "#00843D", searchUrl: "https://www.thegoodguys.com.au/SearchDisplay?searchTerm={q}", kinds: ["electronics", "home"], affiliate: { network: "partnerize", program: "The Good Guys (Partnerize)", signupUrl: "https://www.thegoodguys.com.au/affiliate", verified: true } },
  { slug: "officeworks", name: "Officeworks", market: "au", domain: "officeworks.com.au", brandColor: "#0A68B5", searchUrl: "https://www.officeworks.com.au/shop/officeworks/search?q={q}", kinds: ["office", "electronics"], affiliate: { network: null, program: null, verified: false, notes: "No affiliate programme found." } },

  // ── Japan ──
  amazon("jp", "co.jp", "Amazon.co.jp アソシエイト・プログラム", "https://affiliate.amazon.co.jp/"),
  { slug: "rakuten-ichiba", name: "楽天市場", market: "jp", domain: "rakuten.co.jp", extraHosts: ["search.rakuten.co.jp", "item.rakuten.co.jp"], brandColor: "#BF0000", searchUrl: "https://search.rakuten.co.jp/search/mall/{q}/", kinds: ["general", "electronics", "home", "fashion", "office", "diy"], affiliate: { network: "rakuten_jp", program: "楽天アフィリエイト (Rakuten Affiliate)", signupUrl: "https://affiliate.rakuten.co.jp/", verified: true, notes: "Ichiba Item Search API is public (webservice.rakuten.co.jp)." } },
  { slug: "yahoo-shopping", name: "Yahoo!ショッピング", market: "jp", domain: "shopping.yahoo.co.jp", brandColor: "#FF0033", searchUrl: "https://shopping.yahoo.co.jp/search?p={q}", kinds: ["general", "electronics", "home", "fashion"], affiliate: { network: "valuecommerce", program: "ValueCommerce — Yahoo!ショッピング", verified: true, notes: "Exclusive via ValueCommerce (same LY Corp group)." } },
  { slug: "yodobashi", name: "ヨドバシ・ドット・コム", market: "jp", domain: "yodobashi.com", brandColor: "#D7000F", searchUrl: "https://www.yodobashi.com/?word={q}", kinds: ["electronics", "home"], affiliate: { network: null, program: null, verified: false, notes: "No affiliate programme found." } },
  { slug: "bic-camera", name: "ビックカメラ", market: "jp", domain: "biccamera.com", brandColor: "#E60012", searchUrl: "https://www.biccamera.com/bc/category/?q={q}", kinds: ["electronics", "home"], affiliate: { network: null, program: null, verified: false, notes: "No direct programme; its Rakuten Ichiba store can be linked via Rakuten Affiliate." } },

  // ── Turkey ──
  { slug: "trendyol", name: "Trendyol", market: "tr", domain: "trendyol.com", brandColor: "#F27A1A", searchUrl: "https://www.trendyol.com/sr?q={q}", kinds: ["general", "electronics", "home", "fashion"], affiliate: { network: "direct", program: "Trendyol Influencer Program", verified: true, notes: "Aimed at social creators; network programmes closed. Fit for a comparison site doubtful." } },
  { slug: "hepsiburada", name: "Hepsiburada", market: "tr", domain: "hepsiburada.com", brandColor: "#FF6000", searchUrl: "https://www.hepsiburada.com/ara?q={q}", kinds: ["general", "electronics", "home", "fashion"], affiliate: { network: "direct", program: "Hepsiburada Link Gelir", verified: true, notes: "Consumer/creator link sharing paid in Hepsipara with a monthly cap; no web-publisher programme found." } },
  amazon("tr", "com.tr", "Amazon.com.tr Gelir Ortaklığı", "https://gelirortakligi.amazon.com.tr/", false, "Reportedly invite-only; not on Amazon's international programme list."),
  { slug: "n11", name: "n11", market: "tr", domain: "n11.com", brandColor: "#5D3EBC", searchUrl: "https://www.n11.com/arama?q={q}", kinds: ["general", "electronics", "home"], affiliate: { network: "direct", program: "n11 Influencer Programı", verified: false, notes: "Source is a news report." } },
  mediamarkt("tr", "mediamarkt.com.tr", "/tr", { network: null, program: null, verified: false, notes: "No affiliate programme found (sub-network only)." }),
  { slug: "teknosa", name: "Teknosa", market: "tr", domain: "teknosa.com", brandColor: "#005BAA", searchUrl: "https://www.teknosa.com/arama/?s={q}", kinds: ["electronics", "home"], affiliate: { network: "direct", program: "Teknosa Paylaş Kazan", signupUrl: "https://www.teknosa.com/paylas-kazan", verified: true, notes: "Personal link-sharing with monthly cash cap." } },

  // ── Brazil ──
  { slug: "mercado-livre", name: "Mercado Livre", market: "br", domain: "mercadolivre.com.br", extraHosts: ["lista.mercadolivre.com.br", "produto.mercadolivre.com.br"], brandColor: "#FFE600", searchUrl: "https://lista.mercadolivre.com.br/{q}", kinds: ["general", "electronics", "home", "fashion", "diy"], affiliate: { network: "direct", program: "Mercado Livre Programa de Afiliados e Criadores", signupUrl: "https://www.mercadolivre.com.br/l/afiliados-home", verified: true, notes: "Affiliate links to search/category pages NOT allowed — only product pages." } },
  amazon("br", "com.br", "Amazon.com.br Associados", "https://associados.amazon.com.br/"),
  { slug: "magalu", name: "Magalu", market: "br", domain: "magazineluiza.com.br", brandColor: "#0086FF", searchUrl: "https://www.magazineluiza.com.br/busca/{q}/", kinds: ["general", "electronics", "home"], affiliate: { network: "direct", program: "Parceiro Magalu", signupUrl: "https://www.parceiromagalu.com.br/", verified: true, notes: "CPF and CNPJ tiers; sources secondary." } },
  { slug: "americanas", name: "Americanas", market: "br", domain: "americanas.com.br", brandColor: "#E60014", searchUrl: "https://www.americanas.com.br/busca/{q}", kinds: ["general", "electronics", "home"], affiliate: { network: null, program: null, verified: false, notes: "No active programme (Awin closed; payouts suspended during restructuring)." } },
  { slug: "casas-bahia", name: "Casas Bahia", market: "br", domain: "casasbahia.com.br", brandColor: "#0033A0", searchUrl: "https://www.casasbahia.com.br/{q}/b", kinds: ["electronics", "home"], affiliate: { network: "awin", program: "Awin — Casas Bahia BR (merchant 17629)", signupUrl: "https://ui.awin.com/merchant-profile/17629", verified: true } },
];
