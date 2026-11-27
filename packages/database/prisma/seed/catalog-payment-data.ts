/**
 * Pay-over-time facts per retailer, researched 2026-11-27 on retailers' and providers' public help pages
 * (each row's sourceUrl is the page it was confirmed on). Empty array = nothing verifiable; unknown fields = null.
 * Medium-confidence rows (provider press releases / blocked retailer pages) keep no order limits, so they never drive
 * a computed pay-in-4 estimate. Zip charges installment fees → interestFree=false.
 * Re-verify periodically; feeds/APIs with per-offer eligibility override these rows.
 */

export interface PaymentOptionFact {
  provider: string;
  planType: "pay_in_4" | "monthly_financing" | "store_card_promo";
  interestFree: boolean;
  minOrderUsd: number | null;
  maxOrderUsd: number | null;
  limitsScope: "retailer" | "provider_general" | null;
  aprMinPct: number | null;
  aprMaxPct: number | null;
  promoDescription: string | null;
  sourceUrl: string;
  confidence: "high" | "medium";
}

export const PAYMENT_OPTIONS_VERIFIED_AT = "2026-11-27T00:00:00.000Z";

export const PAYMENT_OPTIONS_DATA: Record<string, PaymentOptionFact[]> = {
  "amazon": [
    {
      "provider": "Affirm",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 36,
      "promoDescription": null,
      "sourceUrl": "https://www.affirm.com/shopping/stores/amazon",
      "confidence": "medium"
    }
  ],
  "walmart": [
    {
      "provider": "Klarna",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": 25,
      "maxOrderUsd": 6000,
      "limitsScope": "retailer",
      "aprMinPct": 9.99,
      "aprMaxPct": 35.99,
      "promoDescription": null,
      "sourceUrl": "https://www.walmart.com/cp/onepay-later/6982710",
      "confidence": "high"
    }
  ],
  "best-buy": [
    {
      "provider": "Zip",
      "planType": "pay_in_4",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": "Installment fees may apply",
      "sourceUrl": "https://www.bestbuy.com/site/financing-rewards/zip/pcmcat1727878406362.c?id=pcmcat1727878406362",
      "confidence": "high"
    },
    {
      "provider": "My Best Buy Credit Card",
      "planType": "store_card_promo",
      "interestFree": false,
      "minOrderUsd": 299,
      "maxOrderUsd": null,
      "limitsScope": "retailer",
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": "12 month financing on storewide purchases totaling $299 and up.",
      "sourceUrl": "https://www.bestbuy.com/site/misc/financing-rewards/pcmcat102500050032.c?id=pcmcat102500050032",
      "confidence": "high"
    }
  ],
  "target": [
    {
      "provider": "Affirm",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.target.com/help/articles/payment-options/accepted-payment-options",
      "confidence": "high"
    },
    {
      "provider": "PayPal Pay in 4",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": 10,
      "maxOrderUsd": 2000,
      "limitsScope": "provider_general",
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.target.com/help/articles/payment-options/accepted-payment-options",
      "confidence": "high"
    },
    {
      "provider": "Afterpay",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.target.com/help/articles/payment-options/accepted-payment-options",
      "confidence": "medium"
    },
    {
      "provider": "Klarna",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.target.com/help/articles/payment-options/accepted-payment-options",
      "confidence": "medium"
    },
    {
      "provider": "Sezzle",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.target.com/help/articles/payment-options/accepted-payment-options",
      "confidence": "medium"
    },
    {
      "provider": "Zip",
      "planType": "pay_in_4",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": "Installment fees may apply",
      "sourceUrl": "https://www.target.com/help/articles/payment-options/accepted-payment-options",
      "confidence": "medium"
    }
  ],
  "ebay": [
    {
      "provider": "Klarna",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": 35,
      "maxOrderUsd": 30000,
      "limitsScope": "retailer",
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.ebay.com/help/buying/paying-items/paying-klarna?id=5338",
      "confidence": "high"
    },
    {
      "provider": "Klarna",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": 35,
      "maxOrderUsd": 30000,
      "limitsScope": "retailer",
      "aprMinPct": 7.99,
      "aprMaxPct": 35.99,
      "promoDescription": null,
      "sourceUrl": "https://www.ebay.com/help/buying/paying-items/paying-klarna?id=5338",
      "confidence": "high"
    }
  ],
  "costco": [
    {
      "provider": "Affirm",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://investors.affirm.com/news-releases/news-release-details/costco-and-affirm-partner-bring-new-flexible-payment-option",
      "confidence": "medium"
    }
  ],
  "home-depot": [
    {
      "provider": "The Home Depot Consumer Credit Card",
      "planType": "store_card_promo",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": "6 Months Flexible Financing on store-wide purchases of $299 or more",
      "sourceUrl": "https://weeklycirculars.homedepot.com/h/m/homedepotusa/item/1039620337?grid_view=true&locale=en-US&type=2",
      "confidence": "medium"
    }
  ],
  "lowes": [
    {
      "provider": "Affirm",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 36,
      "promoDescription": null,
      "sourceUrl": "https://www.lowes.com/l/Credit/Affirm",
      "confidence": "high"
    },
    {
      "provider": "Lowe's Pay",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": 50,
      "maxOrderUsd": null,
      "limitsScope": "retailer",
      "aprMinPct": 0,
      "aprMaxPct": 34.99,
      "promoDescription": null,
      "sourceUrl": "https://www.lowes.com/l/Credit/lowes-pay",
      "confidence": "high"
    },
    {
      "provider": "MyLowe's Rewards Credit Card",
      "planType": "store_card_promo",
      "interestFree": false,
      "minOrderUsd": 299,
      "maxOrderUsd": null,
      "limitsScope": "retailer",
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": "6 Months Special Financing: No Interest if Paid in Full within 6 Months on purchase or order of $299 or more",
      "sourceUrl": "https://www.lowes.com/l/Credit/lowes-advantage-card-credit-offers",
      "confidence": "high"
    }
  ],
  "newegg": [
    {
      "provider": "Affirm",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": 100,
      "maxOrderUsd": null,
      "limitsScope": "retailer",
      "aprMinPct": 10,
      "aprMaxPct": 36,
      "promoDescription": null,
      "sourceUrl": "https://kb.newegg.com/knowledge-base/accepted-payment-methods",
      "confidence": "high"
    },
    {
      "provider": "PayPal Pay in 4",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://kb.newegg.com/knowledge-base/accepted-payment-methods",
      "confidence": "medium"
    },
    {
      "provider": "Newegg Store Credit Card",
      "planType": "store_card_promo",
      "interestFree": false,
      "minOrderUsd": 199,
      "maxOrderUsd": null,
      "limitsScope": "retailer",
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": "No interest if paid in full within 6 months on orders of $199 or more, or within 12 months on orders of $499 or more",
      "sourceUrl": "https://kb.newegg.com/knowledge-base/accepted-payment-methods",
      "confidence": "high"
    }
  ],
  "bh-photo": [],
  "macys": [
    {
      "provider": "Klarna",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": 10000,
      "limitsScope": "retailer",
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.macys.com/s/klarna/",
      "confidence": "high"
    }
  ],
  "kohls": [
    {
      "provider": "Klarna",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": 10,
      "maxOrderUsd": 10000,
      "limitsScope": "retailer",
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.kohls.com/faq/article/4686",
      "confidence": "high"
    },
    {
      "provider": "Klarna",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.kohls.com/faq/article/4686",
      "confidence": "high"
    },
    {
      "provider": "PayPal Pay in 4",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.kohls.com/faq/article/192",
      "confidence": "medium"
    }
  ],
  "nordstrom": [
    {
      "provider": "Afterpay",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.nordstrom.com/browse/customer-service/frequently-asked-questions",
      "confidence": "high"
    },
    {
      "provider": "Affirm",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.nordstrom.com/browse/customer-service/payment-options",
      "confidence": "medium"
    }
  ],
  "sephora": [
    {
      "provider": "Klarna",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": 4000,
      "limitsScope": "retailer",
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.sephora.com/beauty/shop-now-pay-later-faq",
      "confidence": "high"
    },
    {
      "provider": "Afterpay",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.sephora.com/beauty/shop-now-pay-later-faq",
      "confidence": "high"
    },
    {
      "provider": "PayPal Pay in 4",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": 10,
      "maxOrderUsd": 2000,
      "limitsScope": "provider_general",
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.sephora.com/beauty/shop-now-pay-later-faq",
      "confidence": "high"
    }
  ],
  "ulta": [
    {
      "provider": "Afterpay",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": 35,
      "maxOrderUsd": null,
      "limitsScope": "retailer",
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.ulta.com/guestservices/afterpay",
      "confidence": "high"
    },
    {
      "provider": "Afterpay",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": 400,
      "maxOrderUsd": null,
      "limitsScope": "retailer",
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.ulta.com/guestservices/afterpay",
      "confidence": "high"
    },
    {
      "provider": "Klarna",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.ulta.com/guestservices/klarna",
      "confidence": "high"
    },
    {
      "provider": "Klarna",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.ulta.com/guestservices/klarna",
      "confidence": "high"
    }
  ],
  "chewy": [],
  "dicks": [
    {
      "provider": "Affirm",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://investors.affirm.com/news-releases/news-release-details/dicks-sporting-goods-and-affirm-renew-partnership",
      "confidence": "medium"
    },
    {
      "provider": "Affirm",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://investors.affirm.com/news-releases/news-release-details/dicks-sporting-goods-and-affirm-renew-partnership",
      "confidence": "medium"
    }
  ],
  "staples": [
    {
      "provider": "Klarna",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.klarna.com/international/press/staples-launches-klarna-flexible-payments-helping-consumers-to-work-now-pay-later/",
      "confidence": "medium"
    },
    {
      "provider": "Klarna",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.klarna.com/international/press/staples-launches-klarna-flexible-payments-helping-consumers-to-work-now-pay-later/",
      "confidence": "medium"
    }
  ],
  "wayfair": [
    {
      "provider": "Affirm",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.wayfair.com/pay-over-time",
      "confidence": "high"
    },
    {
      "provider": "Affirm",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 36,
      "promoDescription": null,
      "sourceUrl": "https://www.wayfair.com/pay-over-time",
      "confidence": "high"
    },
    {
      "provider": "Klarna",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.wayfair.com/pay-over-time",
      "confidence": "high"
    },
    {
      "provider": "Klarna",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": null,
      "promoDescription": null,
      "sourceUrl": "https://www.wayfair.com/pay-over-time",
      "confidence": "high"
    },
    {
      "provider": "Afterpay",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://www.wayfair.com/pay-over-time",
      "confidence": "high"
    },
    {
      "provider": "Afterpay",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 6.99,
      "aprMaxPct": 35.99,
      "promoDescription": null,
      "sourceUrl": "https://www.wayfair.com/pay-over-time",
      "confidence": "high"
    },
    {
      "provider": "Wayfair Credit Card",
      "planType": "store_card_promo",
      "interestFree": false,
      "minOrderUsd": 1599,
      "maxOrderUsd": null,
      "limitsScope": "retailer",
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": "Major Purchase Plans (valid through 05/01/2027): 9.99% APR for 36 months on orders over $1,599; 9.99% APR for 48 months on orders over $1,799; 9.99% APR for 60 months on orders over $1,999",
      "sourceUrl": "https://www.wayfair.com/pay-over-time",
      "confidence": "high"
    }
  ],
  "gamestop": [
    {
      "provider": "Zip",
      "planType": "pay_in_4",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": null,
      "aprMaxPct": null,
      "promoDescription": "Installment fees may apply",
      "sourceUrl": "https://gamestop-cs.freshdesk.com/support/solutions/articles/156000190557-ways-to-pay-at-gamestop",
      "confidence": "high"
    }
  ],
  "apple": [
    {
      "provider": "Apple Card Monthly Installments",
      "planType": "store_card_promo",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": "Pay monthly at 0% APR for your new iPhone, iPad, Mac, Apple Watch, Apple Vision Pro, and eligible accessories when you choose to check out with Apple Card Monthly Installments.",
      "sourceUrl": "https://www.apple.com/shop/browse/financing",
      "confidence": "high"
    }
  ],
  "back-market": [
    {
      "provider": "Klarna",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://help.backmarket.com/en-us/articles/844812-paying-in-installments-buy-now-pay-later",
      "confidence": "high"
    },
    {
      "provider": "PayPal Pay in 4",
      "planType": "pay_in_4",
      "interestFree": true,
      "minOrderUsd": 10,
      "maxOrderUsd": 2000,
      "limitsScope": "provider_general",
      "aprMinPct": 0,
      "aprMaxPct": 0,
      "promoDescription": null,
      "sourceUrl": "https://help.backmarket.com/en-us/articles/844812-paying-in-installments-buy-now-pay-later",
      "confidence": "high"
    },
    {
      "provider": "PayPal Pay Monthly",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": 49,
      "maxOrderUsd": 10000,
      "limitsScope": "provider_general",
      "aprMinPct": 0,
      "aprMaxPct": 35.99,
      "promoDescription": null,
      "sourceUrl": "https://help.backmarket.com/en-us/articles/844812-paying-in-installments-buy-now-pay-later",
      "confidence": "high"
    },
    {
      "provider": "Affirm",
      "planType": "monthly_financing",
      "interestFree": false,
      "minOrderUsd": null,
      "maxOrderUsd": null,
      "limitsScope": null,
      "aprMinPct": 10,
      "aprMaxPct": 36,
      "promoDescription": null,
      "sourceUrl": "https://help.backmarket.com/en-us/articles/844812-paying-in-installments-buy-now-pay-later",
      "confidence": "high"
    }
  ]
};
