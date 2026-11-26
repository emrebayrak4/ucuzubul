-- CreateEnum
CREATE TYPE "CouponEventType" AS ENUM ('created', 'activated', 'worked', 'failed', 'expired', 'reported', 'status_changed');

-- CreateEnum
CREATE TYPE "CouponChannel" AS ENUM ('web', 'extension', 'mobile', 'system', 'admin');

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "avgSavingsCents" INTEGER,
ADD COLUMN     "lastFailedAt" TIMESTAMPTZ(3),
ADD COLUMN     "lastWorkedAt" TIMESTAMPTZ(3),
ADD COLUMN     "successRateBp" INTEGER;

-- CreateTable
CREATE TABLE "coupon_events" (
    "id" TEXT NOT NULL,
    "couponId" TEXT,
    "retailerId" TEXT NOT NULL,
    "type" "CouponEventType" NOT NULL,
    "channel" "CouponChannel",
    "userId" TEXT,
    "fingerprintHash" TEXT,
    "orderTotalCents" INTEGER,
    "savingsCents" INTEGER,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_checkout_configs" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "hostPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkoutUrlPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "couponInputSelector" TEXT,
    "applyButtonSelector" TEXT,
    "totalSelector" TEXT,
    "successIndicatorSelector" TEXT,
    "errorIndicatorSelector" TEXT,
    "removeButtonSelector" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "retailer_checkout_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_events_couponId_createdAt_idx" ON "coupon_events"("couponId", "createdAt");

-- CreateIndex
CREATE INDEX "coupon_events_retailerId_createdAt_idx" ON "coupon_events"("retailerId", "createdAt");

-- CreateIndex
CREATE INDEX "coupon_events_fingerprintHash_couponId_idx" ON "coupon_events"("fingerprintHash", "couponId");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_checkout_configs_retailerId_key" ON "retailer_checkout_configs"("retailerId");

-- AddForeignKey
ALTER TABLE "coupon_events" ADD CONSTRAINT "coupon_events_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_events" ADD CONSTRAINT "coupon_events_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_events" ADD CONSTRAINT "coupon_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_checkout_configs" ADD CONSTRAINT "retailer_checkout_configs_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
