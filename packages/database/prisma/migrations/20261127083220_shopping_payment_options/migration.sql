-- CreateEnum
CREATE TYPE "PaymentPlanType" AS ENUM ('pay_in_4', 'monthly_financing', 'store_card_promo');

-- CreateTable
CREATE TABLE "retailer_payment_options" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "planType" "PaymentPlanType" NOT NULL,
    "installments" INTEGER,
    "minOrderCents" INTEGER,
    "maxOrderCents" INTEGER,
    "limitsScope" TEXT,
    "aprMinBp" INTEGER,
    "aprMaxBp" INTEGER,
    "promoDescription" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'public_help_page',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "retailer_payment_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retailer_payment_options_retailerId_isActive_idx" ON "retailer_payment_options"("retailerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_payment_options_retailerId_provider_planType_key" ON "retailer_payment_options"("retailerId", "provider", "planType");

-- AddForeignKey
ALTER TABLE "retailer_payment_options" ADD CONSTRAINT "retailer_payment_options_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
