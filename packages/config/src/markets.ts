/**
 * Markets — single source of truth for every country WhichLess operates in.
 *
 * Everything market-specific (locale, currency, price display rule, tax model, formats, legal duties,
 * routing) is read from here by the API, web, admin, mobile, extension and seed. Do not hard-code a
 * currency, locale or VAT rate anywhere else.
 *
 * Rates and legal notes were checked on 2026-11-27 against national tax authority / EU Commission
 * "VAT rates in the EU" summaries. They are DISPLAY ESTIMATES, not tax advice; re-verify yearly
 * (see `TAX_RATES_AS_OF`). Money is always integer minor units in the market currency.
 */

export const MARKET_IDS = ["us", "uk", "ca", "au", "de", "fr", "es", "it", "nl", "jp", "tr", "br"] as const;
export type MarketId = (typeof MARKET_IDS)[number];

export const DEFAULT_MARKET_ID: MarketId = "us";

/** Every UI locale we ship a catalog for (BCP 47). */
export const LOCALES = [
  "en-US",
  "en-GB",
  "en-CA",
  "fr-CA",
  "en-AU",
  "de-DE",
  "fr-FR",
  "es-ES",
  "it-IT",
  "nl-NL",
  "ja-JP",
  "tr-TR",
  "pt-BR",
] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en-US";

export const CURRENCIES = ["USD", "GBP", "CAD", "AUD", "EUR", "JPY", "TRY", "BRL"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

/** ISO 4217 minor-unit digits. JPY has none: ¥1,980 is stored as 1980. */
export const CURRENCY_MINOR_DIGITS: Readonly<Record<CurrencyCode, 0 | 2>> = {
  USD: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  EUR: 2,
  JPY: 0,
  TRY: 2,
  BRL: 2,
};

export const TAX_RATES_AS_OF = "2026-11-27";

/** Tax rates are stored in thousandths of a percent ("milli"): 20% = 20000, 9.975% = 9975. */
export interface VatRate {
  /** Thousandths of a percent (20% = 20000). */
  rateMilli: number;
  /** What the reduced rate typically covers. English, for docs/admin only. */
  appliesTo: string;
}

export type TaxModel =
  | {
      kind: "us_sales_tax";
      /** Prices are shown before tax; tax is estimated from ZIP → state base rate (see @pricora/algorithms totals). */
      note: string;
    }
  | {
      kind: "ca_gst_hst_pst";
      /** GST/HST/PST by province, keyed by the province code. Prices shown before tax. */
      provinces: Readonly<Record<CaProvince, CaProvinceTax>>;
      note: string;
    }
  | {
      kind: "vat";
      /** Local name: VAT, MwSt./USt., TVA, IVA, BTW, 消費税, KDV, GST. */
      localName: string;
      standard: VatRate;
      reduced: readonly VatRate[];
      note: string;
    }
  | {
      kind: "br_composite";
      /** Brazil: ICMS (state) + PIS/COFINS + IPI are embedded in shelf prices; CBS/IBS reform transition 2026–2033. */
      note: string;
    };

export type CaProvince = "AB" | "BC" | "MB" | "NB" | "NL" | "NS" | "NT" | "NU" | "ON" | "PE" | "QC" | "SK" | "YT";

export interface CaProvinceTax {
  /** Combined rate in thousandths of a percent (13% = 13000). */
  totalMilli: number;
  parts: readonly { name: "GST" | "HST" | "PST" | "QST" | "RST"; rateMilli: number }[];
}

export type PriceDisplayRule =
  /** Shelf price already contains VAT/GST/consumption tax; the price IS the total before shipping. */
  | "tax_inclusive"
  /** Shelf price excludes sales tax; show "+ est. tax" computed from the shopper's ZIP / postal code. */
  | "tax_added_at_checkout";

export interface PostalCodeFormat {
  /** Local name shown in forms: ZIP code, Postcode, Postal code, PLZ, Code postal, CAP, 郵便番号, Posta kodu, CEP. */
  label: string;
  /** Validates an upper-cased, trimmed input. */
  pattern: RegExp;
  example: string;
}

export interface LegalRequirements {
  /** Privacy regimes that apply to users in this market. */
  privacyLaws: readonly string[];
  /** Must non-essential cookies/trackers wait for opt-in consent? (EU/UK/TR/BR/QC: yes) */
  cookieConsentRequired: boolean;
  /** "opt_in" = block until accepted, reject as easy as accept; "notice_opt_out" = notice + "Do not sell/share". */
  cookieModel: "opt_in" | "notice_opt_out";
  /** Site operator identity page required by law (DE Impressum, FR mentions légales, ES aviso legal, IT note legali, JP 特商法 not needed for publishers). */
  imprint: { required: boolean; pageName?: string; legalBasis?: string };
  /** Price-reduction rule: EU Omnibus Art. 6a / TR / UK DMCC — "was" price must be the lowest of the prior 30 days. */
  priceReductionReference: "lowest_30_days" | "none";
  /** Affiliate/advertising disclosure rule. */
  adDisclosure: string;
  /** Data-subject rights the account area must expose (export, delete, correct, object…). */
  notes: readonly string[];
  /** Legal pages render "Draft — needs legal review" until a lawyer signs off for this market. */
  legalPagesStatus: "draft_needs_legal_review";
}

export interface ShippingNorms {
  /** Typical standard delivery window in days from big-box retailers. */
  typicalDaysMin: number;
  typicalDaysMax: number;
  /** Statutory right of withdrawal for distance sales, in days (null = none by law; store policy only). */
  withdrawalDays: number | null;
  note: string;
}

export interface MarketFormats {
  /** Sample formatted date (Intl, dateStyle "medium") for docs; real formatting goes through Intl. */
  dateExample: string;
  /** "dmy" | "mdy" | "ymd" order for short numeric dates. */
  dateOrder: "dmy" | "mdy" | "ymd";
  /** Decimal and grouping separators for docs/tests (Intl is authoritative). */
  decimal: "." | ",";
  group: "," | "." | " " | " " | "'";
  /** Address lines top-to-bottom; tokens: name, line1, line2, city, region, postal, country. */
  addressOrder: readonly ("name" | "line1" | "line2" | "city" | "region" | "postal" | "country")[];
  /** First day of week: 0 = Sunday, 1 = Monday. */
  firstDayOfWeek: 0 | 1;
  hourCycle: "h12" | "h23";
}

export interface MarketConfig {
  id: MarketId;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** English name for admin/docs; localized names come from @pricora/i18n. */
  name: string;
  /** Flag emoji for switchers (decorative; always paired with a text label). */
  flag: string;
  defaultLocale: Locale;
  locales: readonly Locale[];
  currency: CurrencyCode;
  currencyDigits: 0 | 2;
  measurement: "imperial" | "metric" | "uk_mixed";
  formats: MarketFormats;
  postalCode: PostalCodeFormat;
  priceDisplay: PriceDisplayRule;
  tax: TaxModel;
  shipping: ShippingNorms;
  legal: LegalRequirements;
  /** IANA timezone used for "today", deal expiry and scheduling defaults. */
  timezone: string;
  /** Web routing: `/{pathSegment}` prefix (root for the default market). */
  routing: {
    /** Path segment for the default locale ("" = site root). */
    pathSegment: string;
    /** Extra segments for non-default locales, e.g. { "fr-CA": "ca-fr" }. */
    localeSegments: Partial<Record<Locale, string>>;
    /** Country-code domain we may move to later (not live). */
    futureCcTld: string;
  };
  /** Travel: provider currency + market params when live (Duffel/Travelpayouts/Booking take currency + market). */
  travel: { currency: CurrencyCode; defaultOriginIata: string };
  /** Display order in switchers. */
  sortOrder: number;
}

const EU_GDPR_NOTES = [
  "GDPR data-subject rights: access/export, rectification, erasure, restriction, objection, portability.",
  "ePrivacy: analytics/advertising cookies only after opt-in; 'Reject all' as prominent as 'Accept all'.",
  "EU Omnibus Directive (2019/2161): advertised price reductions must cite the lowest price of the prior 30 days.",
  "EU Digital Services Act: ranking parameters explained ('How we rank'), ads/sponsored listings labelled.",
] as const;

const MDY_US: MarketFormats = {
  dateExample: "Nov 27, 2026",
  dateOrder: "mdy",
  decimal: ".",
  group: ",",
  addressOrder: ["name", "line1", "line2", "city", "region", "postal", "country"],
  firstDayOfWeek: 0,
  hourCycle: "h12",
};

const EURO_DMY = (decimal: "." | ",", group: MarketFormats["group"], example: string): MarketFormats => ({
  dateExample: example,
  dateOrder: "dmy",
  decimal,
  group,
  addressOrder: ["name", "line1", "line2", "postal", "city", "country"],
  firstDayOfWeek: 1,
  hourCycle: "h23",
});

const EU_SHIPPING = (min: number, max: number, note: string): ShippingNorms => ({
  typicalDaysMin: min,
  typicalDaysMax: max,
  withdrawalDays: 14,
  note: "EU 14-day right of withdrawal for online purchases. " + note,
});

export const MARKETS: Readonly<Record<MarketId, MarketConfig>> = {
  us: {
    id: "us",
    country: "US",
    name: "United States",
    flag: "🇺🇸",
    defaultLocale: "en-US",
    locales: ["en-US"],
    currency: "USD",
    currencyDigits: 2,
    measurement: "imperial",
    formats: MDY_US,
    postalCode: { label: "ZIP code", pattern: /^\d{5}(?:-?\d{4})?$/, example: "94107" },
    priceDisplay: "tax_added_at_checkout",
    tax: {
      kind: "us_sales_tax",
      note: "Sales tax is added at checkout and varies by state/county/city. We estimate the state base rate from the ZIP code and label it 'estimated'.",
    },
    shipping: {
      typicalDaysMin: 2,
      typicalDaysMax: 7,
      withdrawalDays: null,
      note: "No federal right of withdrawal; returns follow each store's policy (often 30 days). Free-shipping thresholds are common ($35).",
    },
    legal: {
      privacyLaws: ["CCPA/CPRA (California)", "State consumer privacy laws (VA, CO, CT, TX, OR, …)", "COPPA"],
      cookieConsentRequired: false,
      cookieModel: "notice_opt_out",
      imprint: { required: false },
      priceReductionReference: "none",
      adDisclosure: "FTC Endorsement Guides (16 CFR 255): clear, conspicuous affiliate disclosure near links; FTC rule banning fake reviews (2024).",
      notes: [
        "'Do Not Sell or Share My Personal Information' link + honour Global Privacy Control signals (CCPA/CPRA).",
        "FTC 'click-to-cancel'-style honesty for paid plans; no fake urgency or countdowns.",
      ],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "America/New_York",
    routing: { pathSegment: "", localeSegments: {}, futureCcTld: "whichless.com" },
    travel: { currency: "USD", defaultOriginIata: "JFK" },
    sortOrder: 0,
  },

  uk: {
    id: "uk",
    country: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    defaultLocale: "en-GB",
    locales: ["en-GB"],
    currency: "GBP",
    currencyDigits: 2,
    measurement: "uk_mixed",
    formats: {
      dateExample: "27 Nov 2026",
      dateOrder: "dmy",
      decimal: ".",
      group: ",",
      addressOrder: ["name", "line1", "line2", "city", "postal", "country"],
      firstDayOfWeek: 1,
      hourCycle: "h23",
    },
    postalCode: {
      label: "Postcode",
      pattern: /^(?:GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/,
      example: "SW1A 1AA",
    },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "vat",
      localName: "VAT",
      standard: { rateMilli: 20000, appliesTo: "Most goods and services" },
      reduced: [
        { rateMilli: 5000, appliesTo: "Children's car seats, home energy, some energy-saving materials" },
        { rateMilli: 0, appliesTo: "Most food, books and newspapers, children's clothing and footwear" },
      ],
      note: "Consumer prices must include VAT (Price Marking Order 2004).",
    },
    shipping: {
      typicalDaysMin: 1,
      typicalDaysMax: 5,
      withdrawalDays: 14,
      note: "Consumer Contracts Regulations 2013: 14-day cancellation for online purchases. Click & collect is common.",
    },
    legal: {
      privacyLaws: ["UK GDPR", "Data Protection Act 2018", "PECR (cookies/e-marketing)", "Data (Use and Access) Act 2025"],
      cookieConsentRequired: true,
      cookieModel: "opt_in",
      imprint: { required: false },
      priceReductionReference: "lowest_30_days",
      adDisclosure: "CAP Code + CMA guidance: affiliate links labelled ('Ad', 'Affiliate link'); DMCC Act 2024 bans fake reviews and drip pricing.",
      notes: [
        "Price reductions: CMA Pricing Practices Guide — reference price must be genuine (we use lowest of prior 30 days).",
        "Mandatory fees must be included in the headline price (DMCC Act 2024 drip-pricing ban).",
      ],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "Europe/London",
    routing: { pathSegment: "uk", localeSegments: {}, futureCcTld: "whichless.co.uk" },
    travel: { currency: "GBP", defaultOriginIata: "LHR" },
    sortOrder: 1,
  },

  ca: {
    id: "ca",
    country: "CA",
    name: "Canada",
    flag: "🇨🇦",
    defaultLocale: "en-CA",
    locales: ["en-CA", "fr-CA"],
    currency: "CAD",
    currencyDigits: 2,
    measurement: "metric",
    formats: {
      dateExample: "Nov 27, 2026",
      dateOrder: "ymd",
      decimal: ".",
      group: ",",
      addressOrder: ["name", "line1", "line2", "city", "region", "postal", "country"],
      firstDayOfWeek: 0,
      hourCycle: "h12",
    },
    postalCode: {
      label: "Postal code",
      pattern: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/,
      example: "M5V 2T6",
    },
    priceDisplay: "tax_added_at_checkout",
    tax: {
      kind: "ca_gst_hst_pst",
      provinces: {
        AB: { totalMilli: 5000, parts: [{ name: "GST", rateMilli: 5000 }] },
        BC: { totalMilli: 12000, parts: [{ name: "GST", rateMilli: 5000 }, { name: "PST", rateMilli: 7000 }] },
        MB: { totalMilli: 12000, parts: [{ name: "GST", rateMilli: 5000 }, { name: "RST", rateMilli: 7000 }] },
        NB: { totalMilli: 15000, parts: [{ name: "HST", rateMilli: 15000 }] },
        NL: { totalMilli: 15000, parts: [{ name: "HST", rateMilli: 15000 }] },
        // Nova Scotia cut HST from 15% to 14% on 2025-04-01.
        NS: { totalMilli: 14000, parts: [{ name: "HST", rateMilli: 14000 }] },
        NT: { totalMilli: 5000, parts: [{ name: "GST", rateMilli: 5000 }] },
        NU: { totalMilli: 5000, parts: [{ name: "GST", rateMilli: 5000 }] },
        ON: { totalMilli: 13000, parts: [{ name: "HST", rateMilli: 13000 }] },
        PE: { totalMilli: 15000, parts: [{ name: "HST", rateMilli: 15000 }] },
        QC: { totalMilli: 14975, parts: [{ name: "GST", rateMilli: 5000 }, { name: "QST", rateMilli: 9975 }] },
        SK: { totalMilli: 11000, parts: [{ name: "GST", rateMilli: 5000 }, { name: "PST", rateMilli: 6000 }] },
        YT: { totalMilli: 5000, parts: [{ name: "GST", rateMilli: 5000 }] },
      },
      note: "Prices are shown before tax. GST/HST/PST is estimated from the first letter of the postal code (province) and labelled 'estimated'. Some items (basic groceries, children's clothing in some provinces) are zero-rated or exempt.",
    },
    shipping: {
      typicalDaysMin: 2,
      typicalDaysMax: 8,
      withdrawalDays: null,
      note: "No general federal right of withdrawal for online goods; returns follow store policy. Remote areas have longer delivery.",
    },
    legal: {
      privacyLaws: ["PIPEDA", "Quebec Law 25", "CASL (anti-spam)"],
      cookieConsentRequired: true,
      cookieModel: "opt_in",
      imprint: { required: false },
      priceReductionReference: "none",
      adDisclosure: "Competition Act (deceptive marketing, drip pricing ban since 2022) + Ad Standards: disclose affiliate relationships.",
      notes: [
        "Quebec Law 25: tracking technologies off by default, named privacy officer, privacy impact assessments.",
        "Charter of the French Language (Bill 96): Quebec users must be able to use the site fully in French.",
        "Competition Act: 'regular price' claims need substantial volume or time at that price.",
      ],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "America/Toronto",
    routing: { pathSegment: "ca", localeSegments: { "fr-CA": "ca-fr" }, futureCcTld: "whichless.ca" },
    travel: { currency: "CAD", defaultOriginIata: "YYZ" },
    sortOrder: 2,
  },

  au: {
    id: "au",
    country: "AU",
    name: "Australia",
    flag: "🇦🇺",
    defaultLocale: "en-AU",
    locales: ["en-AU"],
    currency: "AUD",
    currencyDigits: 2,
    measurement: "metric",
    formats: {
      dateExample: "27 Nov 2026",
      dateOrder: "dmy",
      decimal: ".",
      group: ",",
      addressOrder: ["name", "line1", "line2", "city", "region", "postal", "country"],
      firstDayOfWeek: 1,
      hourCycle: "h12",
    },
    postalCode: { label: "Postcode", pattern: /^\d{4}$/, example: "2000" },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "vat",
      localName: "GST",
      standard: { rateMilli: 10000, appliesTo: "Most goods and services" },
      reduced: [{ rateMilli: 0, appliesTo: "Basic food, some health and education items (GST-free)" }],
      note: "Australian Consumer Law: the single total price including GST must be shown prominently.",
    },
    shipping: {
      typicalDaysMin: 2,
      typicalDaysMax: 8,
      withdrawalDays: null,
      note: "No statutory change-of-mind return; Consumer Guarantees apply to faulty goods. Click & collect is common.",
    },
    legal: {
      privacyLaws: ["Privacy Act 1988 + Australian Privacy Principles", "Spam Act 2003"],
      cookieConsentRequired: false,
      cookieModel: "notice_opt_out",
      imprint: { required: false },
      priceReductionReference: "none",
      adDisclosure: "ACL misleading-conduct rules + AANA Code: affiliate/sponsored content clearly distinguishable.",
      notes: [
        "ACCC: 'was/now' pricing must reflect a genuine recent price; drip pricing is misleading.",
        "Privacy and Other Legislation Amendment Act 2024: statutory tort for serious privacy invasions.",
      ],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "Australia/Sydney",
    routing: { pathSegment: "au", localeSegments: {}, futureCcTld: "whichless.com.au" },
    travel: { currency: "AUD", defaultOriginIata: "SYD" },
    sortOrder: 3,
  },

  de: {
    id: "de",
    country: "DE",
    name: "Germany",
    flag: "🇩🇪",
    defaultLocale: "de-DE",
    locales: ["de-DE"],
    currency: "EUR",
    currencyDigits: 2,
    measurement: "metric",
    formats: EURO_DMY(",", ".", "27.11.2026"),
    postalCode: { label: "PLZ", pattern: /^\d{5}$/, example: "10115" },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "vat",
      localName: "MwSt.",
      standard: { rateMilli: 19000, appliesTo: "Most goods and services" },
      reduced: [{ rateMilli: 7000, appliesTo: "Food, books, newspapers, local public transport" }],
      note: "PAngV: consumer prices are total prices incl. VAT; unit prices (Grundpreis) for goods sold by weight/volume.",
    },
    shipping: EU_SHIPPING(1, 4, "Free shipping thresholds are common; shipping costs must be stated next to the price ('zzgl. Versand')."),
    legal: {
      privacyLaws: ["GDPR (DSGVO)", "TDDDG (cookies)", "BDSG"],
      cookieConsentRequired: true,
      cookieModel: "opt_in",
      imprint: { required: true, pageName: "Impressum", legalBasis: "§ 5 DDG (Digitale-Dienste-Gesetz)" },
      priceReductionReference: "lowest_30_days",
      adDisclosure: "UWG § 5a: commercial intent must be identifiable ('Anzeige', 'Werbung', '*Affiliate-Link').",
      notes: [...EU_GDPR_NOTES, "PAngV § 11: price reductions reference the lowest price of the previous 30 days."],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "Europe/Berlin",
    routing: { pathSegment: "de", localeSegments: {}, futureCcTld: "whichless.de" },
    travel: { currency: "EUR", defaultOriginIata: "FRA" },
    sortOrder: 4,
  },

  fr: {
    id: "fr",
    country: "FR",
    name: "France",
    flag: "🇫🇷",
    defaultLocale: "fr-FR",
    locales: ["fr-FR"],
    currency: "EUR",
    currencyDigits: 2,
    measurement: "metric",
    formats: EURO_DMY(",", " ", "27 nov. 2026"),
    postalCode: { label: "Code postal", pattern: /^\d{5}$/, example: "75001" },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "vat",
      localName: "TVA",
      standard: { rateMilli: 20000, appliesTo: "Most goods and services" },
      reduced: [
        { rateMilli: 10000, appliesTo: "Restaurants, passenger transport, some renovation work" },
        { rateMilli: 5500, appliesTo: "Most food, books, energy-saving works" },
        { rateMilli: 2100, appliesTo: "Reimbursable medicines, press" },
      ],
      note: "Prices to consumers are TTC (toutes taxes comprises).",
    },
    shipping: EU_SHIPPING(2, 5, "Relay-point delivery (point relais) is very common and cheap."),
    legal: {
      privacyLaws: ["GDPR (RGPD)", "Loi Informatique et Libertés", "CNIL cookie guidelines"],
      cookieConsentRequired: true,
      cookieModel: "opt_in",
      imprint: { required: true, pageName: "Mentions légales", legalBasis: "Art. 6 III LCEN (loi n° 2004-575)" },
      priceReductionReference: "lowest_30_days",
      adDisclosure: "Code de la consommation L121-1 + Loi influenceurs 2023: 'Publicité' / 'Lien affilié' labels.",
      notes: [...EU_GDPR_NOTES, "CNIL: 'Tout refuser' must be as easy as 'Tout accepter'; consent renewed at most every 13 months."],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "Europe/Paris",
    routing: { pathSegment: "fr", localeSegments: {}, futureCcTld: "whichless.fr" },
    travel: { currency: "EUR", defaultOriginIata: "CDG" },
    sortOrder: 5,
  },

  es: {
    id: "es",
    country: "ES",
    name: "Spain",
    flag: "🇪🇸",
    defaultLocale: "es-ES",
    locales: ["es-ES"],
    currency: "EUR",
    currencyDigits: 2,
    measurement: "metric",
    formats: EURO_DMY(",", ".", "27 nov 2026"),
    postalCode: { label: "Código postal", pattern: /^(?:0[1-9]|[1-4]\d|5[0-2])\d{3}$/, example: "28013" },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "vat",
      localName: "IVA",
      standard: { rateMilli: 21000, appliesTo: "Most goods and services" },
      reduced: [
        { rateMilli: 10000, appliesTo: "Some food, hospitality, passenger transport" },
        { rateMilli: 4000, appliesTo: "Basic food (bread, milk, eggs, fruit), books, medicines" },
      ],
      note: "Canary Islands, Ceuta and Melilla are outside EU VAT (IGIC/IPSI) — catalog targets the Peninsula + Balearics.",
    },
    shipping: EU_SHIPPING(1, 5, "Canary Islands deliveries often carry extra costs/customs."),
    legal: {
      privacyLaws: ["GDPR (RGPD)", "LOPDGDD (Ley Orgánica 3/2018)", "LSSI-CE (cookies)"],
      cookieConsentRequired: true,
      cookieModel: "opt_in",
      imprint: { required: true, pageName: "Aviso legal", legalBasis: "Art. 10 LSSI-CE (Ley 34/2002)" },
      priceReductionReference: "lowest_30_days",
      adDisclosure: "Ley General de Publicidad + LSSI art. 20: commercial communications identifiable ('Publicidad').",
      notes: [...EU_GDPR_NOTES],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "Europe/Madrid",
    routing: { pathSegment: "es", localeSegments: {}, futureCcTld: "whichless.es" },
    travel: { currency: "EUR", defaultOriginIata: "MAD" },
    sortOrder: 6,
  },

  it: {
    id: "it",
    country: "IT",
    name: "Italy",
    flag: "🇮🇹",
    defaultLocale: "it-IT",
    locales: ["it-IT"],
    currency: "EUR",
    currencyDigits: 2,
    measurement: "metric",
    formats: EURO_DMY(",", ".", "27 nov 2026"),
    postalCode: { label: "CAP", pattern: /^\d{5}$/, example: "00184" },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "vat",
      localName: "IVA",
      standard: { rateMilli: 22000, appliesTo: "Most goods and services" },
      reduced: [
        { rateMilli: 10000, appliesTo: "Hospitality, some food, renovation" },
        { rateMilli: 5000, appliesTo: "Some social services, certain food items" },
        { rateMilli: 4000, appliesTo: "Basic food, books, newspapers" },
      ],
      note: "Consumer prices include IVA.",
    },
    shipping: EU_SHIPPING(2, 6, "Islands and remote areas often have longer delivery."),
    legal: {
      privacyLaws: ["GDPR", "Codice Privacy (D.Lgs. 196/2003)", "Garante cookie guidelines (2021)"],
      cookieConsentRequired: true,
      cookieModel: "opt_in",
      imprint: { required: true, pageName: "Note legali", legalBasis: "Art. 7 D.Lgs. 70/2003 + company data (P.IVA)" },
      priceReductionReference: "lowest_30_days",
      adDisclosure: "Codice del Consumo + IAP code: advertising recognisable ('Pubblicità', 'Link affiliato'); AGCOM influencer rules.",
      notes: [...EU_GDPR_NOTES, "Garante: closing the banner with 'X' must mean no non-essential cookies."],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "Europe/Rome",
    routing: { pathSegment: "it", localeSegments: {}, futureCcTld: "whichless.it" },
    travel: { currency: "EUR", defaultOriginIata: "FCO" },
    sortOrder: 7,
  },

  nl: {
    id: "nl",
    country: "NL",
    name: "Netherlands",
    flag: "🇳🇱",
    defaultLocale: "nl-NL",
    locales: ["nl-NL"],
    currency: "EUR",
    currencyDigits: 2,
    measurement: "metric",
    formats: {
      ...EURO_DMY(",", ".", "27 nov 2026"),
      dateOrder: "dmy",
    },
    postalCode: { label: "Postcode", pattern: /^[1-9]\d{3} ?(?!SA|SD|SS)[A-Z]{2}$/, example: "1012 AB" },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "vat",
      localName: "btw",
      standard: { rateMilli: 21000, appliesTo: "Most goods and services" },
      reduced: [{ rateMilli: 9000, appliesTo: "Food, books, medicines, some culture" }],
      note: "Consumer prices include btw.",
    },
    shipping: EU_SHIPPING(1, 3, "Next-day delivery is the norm (bol.com, Coolblue); parcel points are common."),
    legal: {
      privacyLaws: ["GDPR (AVG)", "Telecommunicatiewet art. 11.7a (cookies)"],
      cookieConsentRequired: true,
      cookieModel: "opt_in",
      imprint: { required: false },
      priceReductionReference: "lowest_30_days",
      adDisclosure: "Nederlandse Reclame Code + ACM guidance: sponsored/affiliate content labelled ('Advertentie').",
      notes: [...EU_GDPR_NOTES, "Company identity (KvK number, address) must be easy to find (Art. 3:15d BW)."],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "Europe/Amsterdam",
    routing: { pathSegment: "nl", localeSegments: {}, futureCcTld: "whichless.nl" },
    travel: { currency: "EUR", defaultOriginIata: "AMS" },
    sortOrder: 8,
  },

  jp: {
    id: "jp",
    country: "JP",
    name: "Japan",
    flag: "🇯🇵",
    defaultLocale: "ja-JP",
    locales: ["ja-JP"],
    currency: "JPY",
    currencyDigits: 0,
    measurement: "metric",
    formats: {
      dateExample: "2026/11/27",
      dateOrder: "ymd",
      decimal: ".",
      group: ",",
      addressOrder: ["postal", "region", "city", "line1", "line2", "name", "country"],
      firstDayOfWeek: 0,
      hourCycle: "h23",
    },
    postalCode: { label: "郵便番号", pattern: /^\d{3}-?\d{4}$/, example: "100-0001" },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "vat",
      localName: "消費税",
      standard: { rateMilli: 10000, appliesTo: "Most goods and services" },
      reduced: [{ rateMilli: 8000, appliesTo: "Food and non-alcoholic drinks (not dining in), newspapers on subscription" }],
      note: "総額表示 (total price display) has been mandatory since 2021-04-01: prices shown include consumption tax.",
    },
    shipping: {
      typicalDaysMin: 1,
      typicalDaysMax: 3,
      withdrawalDays: null,
      note: "No cooling-off for online shopping; stores must state their return policy (特定商取引法). Konbini pickup is common.",
    },
    legal: {
      privacyLaws: ["APPI (個人情報保護法)", "Telecommunications Business Act (external transmission rules for cookies)"],
      cookieConsentRequired: false,
      cookieModel: "notice_opt_out",
      imprint: { required: false },
      priceReductionReference: "none",
      adDisclosure: "Act against Unjustifiable Premiums (景品表示法) stealth-marketing rule since 2023-10: label ads '広告' / 'PR'.",
      notes: [
        "Telecommunications Business Act 2023: notice/publication of what user data third-party tags send.",
        "Dual pricing (二重価格表示) needs a genuine recent reference price.",
      ],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "Asia/Tokyo",
    routing: { pathSegment: "jp", localeSegments: {}, futureCcTld: "whichless.jp" },
    travel: { currency: "JPY", defaultOriginIata: "HND" },
    sortOrder: 9,
  },

  tr: {
    id: "tr",
    country: "TR",
    name: "Turkey",
    flag: "🇹🇷",
    defaultLocale: "tr-TR",
    locales: ["tr-TR"],
    currency: "TRY",
    currencyDigits: 2,
    measurement: "metric",
    formats: EURO_DMY(",", ".", "27 Kas 2026"),
    postalCode: { label: "Posta kodu", pattern: /^(?:0[1-9]|[1-7]\d|8[01])\d{3}$/, example: "34000" },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "vat",
      localName: "KDV",
      standard: { rateMilli: 20000, appliesTo: "Most goods and services" },
      reduced: [
        { rateMilli: 10000, appliesTo: "Some food, textiles, hospitality" },
        { rateMilli: 1000, appliesTo: "Basic food (bread, flour), newspapers and books" },
      ],
      note: "Fiyat Etiketi Yönetmeliği: prices shown to consumers include all taxes (KDV dahil).",
    },
    shipping: {
      typicalDaysMin: 1,
      typicalDaysMax: 4,
      withdrawalDays: 14,
      note: "Mesafeli Sözleşmeler Yönetmeliği: 14-day right of withdrawal (cayma hakkı). Free shipping over a basket threshold is common.",
    },
    legal: {
      privacyLaws: ["KVKK (Law 6698)", "Law 6563 on E-Commerce", "İYS (commercial e-message consent system)"],
      cookieConsentRequired: true,
      cookieModel: "opt_in",
      imprint: { required: false },
      priceReductionReference: "lowest_30_days",
      adDisclosure: "Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği: ads/affiliate links labelled ('Reklam', 'İş birliği').",
      notes: [
        "KVKK: aydınlatma metni + explicit consent for non-essential cookies (KVKK Cookie Guide 2022); VERBİS registration if thresholds apply.",
        "Cross-border data transfer rules (KVKK art. 9, amended 2024): standard contracts notified to the Authority.",
        "Discount claims must reference the lowest price of the previous 30 days (Ticaret Bakanlığı, 2022 regulation).",
      ],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "Europe/Istanbul",
    routing: { pathSegment: "tr", localeSegments: {}, futureCcTld: "whichless.com.tr" },
    travel: { currency: "TRY", defaultOriginIata: "IST" },
    sortOrder: 10,
  },

  br: {
    id: "br",
    country: "BR",
    name: "Brazil",
    flag: "🇧🇷",
    defaultLocale: "pt-BR",
    locales: ["pt-BR"],
    currency: "BRL",
    currencyDigits: 2,
    measurement: "metric",
    formats: EURO_DMY(",", ".", "27 de nov. de 2026"),
    postalCode: { label: "CEP", pattern: /^\d{5}-?\d{3}$/, example: "01310-100" },
    priceDisplay: "tax_inclusive",
    tax: {
      kind: "br_composite",
      note: "Shelf prices include ICMS, PIS/COFINS and IPI (Lei 12.741/2012 requires the approximate tax amount to be disclosed by sellers). CBS/IBS reform phases in 2026–2033; we only show the shelf price.",
    },
    shipping: {
      typicalDaysMin: 2,
      typicalDaysMax: 12,
      withdrawalDays: 7,
      note: "CDC art. 49: 7-day right of withdrawal (direito de arrependimento) for online purchases. Installments (parcelamento sem juros) are a key price signal.",
    },
    legal: {
      privacyLaws: ["LGPD (Lei 13.709/2018)", "Marco Civil da Internet"],
      cookieConsentRequired: true,
      cookieModel: "opt_in",
      imprint: { required: false },
      priceReductionReference: "none",
      adDisclosure: "CDC art. 36 + CONAR code: advertising identifiable ('Publicidade', 'Link de afiliado').",
      notes: [
        "ANPD cookie guidance (2022): consent for non-essential cookies, granular choices, named DPO (encarregado).",
        "Decreto 7.962/2013: clear e-commerce information (company name, CNPJ, address) for sellers.",
      ],
      legalPagesStatus: "draft_needs_legal_review",
    },
    timezone: "America/Sao_Paulo",
    routing: { pathSegment: "br", localeSegments: {}, futureCcTld: "whichless.com.br" },
    travel: { currency: "BRL", defaultOriginIata: "GRU" },
    sortOrder: 11,
  },
};

export const MARKET_LIST: readonly MarketConfig[] = MARKET_IDS.map((id) => MARKETS[id]);

export function isMarketId(value: unknown): value is MarketId {
  return typeof value === "string" && (MARKET_IDS as readonly string[]).includes(value);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/** Market for an id; unknown → default market. Accepts "gb" as an alias for "uk". */
export function getMarket(id: string | null | undefined): MarketConfig {
  const v = (id ?? "").trim().toLowerCase();
  if (v === "gb") return MARKETS.uk;
  return isMarketId(v) ? MARKETS[v] : MARKETS[DEFAULT_MARKET_ID];
}

/** Parse a market id strictly (null when unknown). "gb" → "uk". */
export function parseMarketId(id: string | null | undefined): MarketId | null {
  const v = (id ?? "").trim().toLowerCase();
  if (v === "gb") return "uk";
  return isMarketId(v) ? v : null;
}

export function marketForCountry(country: string | null | undefined): MarketConfig | null {
  const c = (country ?? "").trim().toUpperCase();
  return MARKET_LIST.find((m) => m.country === c) ?? null;
}

/** The locale to use in a market: the requested one when supported there, else the market default. */
export function resolveMarketLocale(market: MarketConfig, locale: string | null | undefined): Locale {
  return isLocale(locale) && market.locales.includes(locale) ? locale : market.defaultLocale;
}

/** Market whose locales include this locale (first match; "fr-CA" → ca, "fr-FR" → fr). */
export function marketForLocale(locale: string | null | undefined): MarketConfig | null {
  if (!isLocale(locale)) return null;
  return MARKET_LIST.find((m) => m.locales.includes(locale)) ?? null;
}

export function currencyDigits(currency: string): 0 | 2 {
  return isCurrencyCode(currency) ? CURRENCY_MINOR_DIGITS[currency] : 2;
}

/** Web path prefix for a market+locale: "" (US root), "/uk", "/ca", "/ca-fr", "/de"… */
export function marketPathPrefix(market: MarketConfig, locale?: Locale): string {
  const seg = locale && locale !== market.defaultLocale ? market.routing.localeSegments[locale] : undefined;
  const s = seg ?? market.routing.pathSegment;
  return s ? "/" + s : "";
}

/** All web path segments → (market, locale). "us" is accepted and redirects to the root. */
export function parseMarketPathSegment(segment: string | null | undefined): { market: MarketConfig; locale: Locale } | null {
  const s = (segment ?? "").toLowerCase();
  if (!s) return null;
  for (const m of MARKET_LIST) {
    if (m.routing.pathSegment === s || (m.id === "us" && s === "us")) return { market: m, locale: m.defaultLocale };
    for (const [loc, seg] of Object.entries(m.routing.localeSegments) as [Locale, string][]) {
      if (seg === s) return { market: m, locale: loc };
    }
  }
  return null;
}

/** Every (market, locale) pair we serve — used for hreflang alternates and per-market sitemaps. */
export function marketLocalePairs(): { market: MarketConfig; locale: Locale; prefix: string }[] {
  return MARKET_LIST.flatMap((m) => m.locales.map((locale) => ({ market: m, locale, prefix: marketPathPrefix(m, locale) })));
}

/** Validates a postal code for a market (input is trimmed + upper-cased). */
export function isValidPostalCode(marketId: MarketId, input: string): boolean {
  return MARKETS[marketId].postalCode.pattern.test(input.trim().toUpperCase());
}

const CA_POSTAL_FIRST_LETTER: Readonly<Record<string, CaProvince>> = {
  A: "NL",
  B: "NS",
  C: "PE",
  E: "NB",
  G: "QC",
  H: "QC",
  J: "QC",
  K: "ON",
  L: "ON",
  M: "ON",
  N: "ON",
  P: "ON",
  R: "MB",
  S: "SK",
  T: "AB",
  V: "BC",
  // X covers both NT and NU; both are GST-only (5%), so the tax result is identical.
  X: "NT",
  Y: "YT",
};

/** Canadian postal code → province (first letter; Canada Post FSA map). */
export function caPostalToProvince(postal: string | null | undefined): CaProvince | null {
  const p = (postal ?? "").trim().toUpperCase();
  if (!MARKETS.ca.postalCode.pattern.test(p)) return null;
  return CA_POSTAL_FIRST_LETTER[p[0] as string] ?? null;
}

export interface MarketTaxEstimate {
  /** Tax already inside the shelf price (VAT markets) — informational. null when not derivable (BR). */
  includedTaxMinor: number | null;
  /** Tax to add on top of the shelf price (US/CA). null when unknown (no/invalid postal code). */
  addedTaxMinor: number | null;
  /** Combined rate in thousandths of a percent, null when unknown. */
  rateMilli: number | null;
  /** Region used (US state / CA province), null otherwise. */
  region: string | null;
  priceDisplay: PriceDisplayRule;
  estimated: boolean;
  /** English machine note; UI renders a localized message keyed on `noteKey`. */
  noteKey:
    | "tax.included"
    | "tax.included_br"
    | "tax.ca_estimated"
    | "tax.ca_need_postal"
    | "tax.us_estimated"
    | "tax.us_need_zip";
}

/**
 * Tax for an amount in a non-US market. US sales tax lives in @pricora/algorithms `computeOfferTotal`
 * (ZIP → state); this function returns `us_*` note keys only so callers can branch on one shape.
 * Inclusive VAT is derived from the standard rate: included = amount − amount / (1 + rate).
 */
export function estimateMarketTax(
  marketId: MarketId,
  amountMinor: number,
  opts: { postalCode?: string | null; vatRateMilli?: number } = {},
): MarketTaxEstimate {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new RangeError("amountMinor must be a non-negative integer");
  const m = MARKETS[marketId];
  const tax = m.tax;
  switch (tax.kind) {
    case "vat": {
      const rate = opts.vatRateMilli ?? tax.standard.rateMilli;
      const included = rate === 0 ? 0 : Math.round(amountMinor - (amountMinor * 100_000) / (100_000 + rate));
      return { includedTaxMinor: included, addedTaxMinor: 0, rateMilli: rate, region: null, priceDisplay: m.priceDisplay, estimated: true, noteKey: "tax.included" };
    }
    case "br_composite":
      return { includedTaxMinor: null, addedTaxMinor: 0, rateMilli: null, region: null, priceDisplay: m.priceDisplay, estimated: true, noteKey: "tax.included_br" };
    case "ca_gst_hst_pst": {
      const prov = caPostalToProvince(opts.postalCode);
      if (!prov) return { includedTaxMinor: 0, addedTaxMinor: null, rateMilli: null, region: null, priceDisplay: m.priceDisplay, estimated: true, noteKey: "tax.ca_need_postal" };
      const rate = tax.provinces[prov].totalMilli;
      return {
        includedTaxMinor: 0,
        addedTaxMinor: Math.round((amountMinor * rate) / 100_000),
        rateMilli: rate,
        region: prov,
        priceDisplay: m.priceDisplay,
        estimated: true,
        noteKey: "tax.ca_estimated",
      };
    }
    case "us_sales_tax":
      return { includedTaxMinor: 0, addedTaxMinor: null, rateMilli: null, region: null, priceDisplay: m.priceDisplay, estimated: true, noteKey: "tax.us_need_zip" };
  }
}
