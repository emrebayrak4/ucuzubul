-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AffiliateNetwork" ADD VALUE 'tradedoubler';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'adtraction';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'webgains';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'tradetracker';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'daisycon';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'effinity';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'commission_factory';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'valuecommerce';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'a8net';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'rakuten_jp';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'moshimo';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'admitad';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'gelir_ortakligi';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'lomadee';
ALTER TYPE "AffiliateNetwork" ADD VALUE 'afilio';

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "marketId" VARCHAR(8) NOT NULL DEFAULT 'us';

-- AlterTable
ALTER TABLE "price_alerts" ADD COLUMN     "marketId" VARCHAR(8) NOT NULL DEFAULT 'us';

-- AlterTable
ALTER TABLE "retailers" ADD COLUMN     "groupSlug" TEXT,
ADD COLUMN     "homeMarketId" VARCHAR(8) NOT NULL DEFAULT 'us';

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "locale" VARCHAR(10),
ADD COLUMN     "marketId" VARCHAR(8),
ADD COLUMN     "postalCode" TEXT;

-- CreateTable
CREATE TABLE "markets" (
    "id" VARCHAR(8) NOT NULL,
    "country" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "defaultLocale" VARCHAR(10) NOT NULL,
    "locales" TEXT[],
    "currency" CHAR(3) NOT NULL,
    "currencyDigits" INTEGER NOT NULL DEFAULT 2,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- Seed the 12 market ids before any foreign key references them (mirrors @pricora/config MARKETS).
INSERT INTO "markets" ("id","country","name","defaultLocale","locales","currency","currencyDigits","timezone","sortOrder","updatedAt") VALUES
 ('us','US','United States','en-US',ARRAY['en-US'],'USD',2,'America/New_York',0,CURRENT_TIMESTAMP),
 ('uk','GB','United Kingdom','en-GB',ARRAY['en-GB'],'GBP',2,'Europe/London',1,CURRENT_TIMESTAMP),
 ('ca','CA','Canada','en-CA',ARRAY['en-CA','fr-CA'],'CAD',2,'America/Toronto',2,CURRENT_TIMESTAMP),
 ('au','AU','Australia','en-AU',ARRAY['en-AU'],'AUD',2,'Australia/Sydney',3,CURRENT_TIMESTAMP),
 ('de','DE','Germany','de-DE',ARRAY['de-DE'],'EUR',2,'Europe/Berlin',4,CURRENT_TIMESTAMP),
 ('fr','FR','France','fr-FR',ARRAY['fr-FR'],'EUR',2,'Europe/Paris',5,CURRENT_TIMESTAMP),
 ('es','ES','Spain','es-ES',ARRAY['es-ES'],'EUR',2,'Europe/Madrid',6,CURRENT_TIMESTAMP),
 ('it','IT','Italy','it-IT',ARRAY['it-IT'],'EUR',2,'Europe/Rome',7,CURRENT_TIMESTAMP),
 ('nl','NL','Netherlands','nl-NL',ARRAY['nl-NL'],'EUR',2,'Europe/Amsterdam',8,CURRENT_TIMESTAMP),
 ('jp','JP','Japan','ja-JP',ARRAY['ja-JP'],'JPY',0,'Asia/Tokyo',9,CURRENT_TIMESTAMP),
 ('tr','TR','Turkey','tr-TR',ARRAY['tr-TR'],'TRY',2,'Europe/Istanbul',10,CURRENT_TIMESTAMP),
 ('br','BR','Brazil','pt-BR',ARRAY['pt-BR'],'BRL',2,'America/Sao_Paulo',11,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- CreateTable
CREATE TABLE "retailer_markets" (
    "retailerId" TEXT NOT NULL,
    "marketId" VARCHAR(8) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "localDomain" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "affiliateNetwork" "AffiliateNetwork",
    "affiliateProgramName" TEXT,
    "affiliateSignupUrl" TEXT,
    "affiliateStatus" "IntegrationStatus" NOT NULL DEFAULT 'pending_configuration',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "retailer_markets_pkey" PRIMARY KEY ("retailerId","marketId")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "base" CHAR(3) NOT NULL,
    "quote" CHAR(3) NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ecb',
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("base","quote","date")
);

-- CreateTable
CREATE TABLE "product_translations" (
    "productId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" "DataSource" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("productId","locale")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "categoryId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "seoText" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("categoryId","locale")
);

-- CreateIndex
CREATE INDEX "retailer_markets_marketId_idx" ON "retailer_markets"("marketId");

-- CreateIndex
CREATE INDEX "fx_rates_quote_date_idx" ON "fx_rates"("quote", "date");

-- CreateIndex
CREATE INDEX "product_translations_locale_idx" ON "product_translations"("locale");

-- CreateIndex
CREATE INDEX "category_translations_locale_idx" ON "category_translations"("locale");

-- CreateIndex
CREATE INDEX "offers_marketId_productId_isActive_priceCents_idx" ON "offers"("marketId", "productId", "isActive", "priceCents");

-- CreateIndex
CREATE INDEX "retailers_homeMarketId_isActive_idx" ON "retailers"("homeMarketId", "isActive");

-- CreateIndex
CREATE INDEX "retailers_groupSlug_idx" ON "retailers"("groupSlug");

-- AddForeignKey
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_homeMarketId_fkey" FOREIGN KEY ("homeMarketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_markets" ADD CONSTRAINT "retailer_markets_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_markets" ADD CONSTRAINT "retailer_markets_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing (US) retailer operates in the US market.
INSERT INTO "retailer_markets" ("retailerId","marketId","isPrimary","localDomain","websiteUrl","updatedAt")
SELECT "id",'us',true,"domain","websiteUrl",CURRENT_TIMESTAMP FROM "retailers"
ON CONFLICT DO NOTHING;
