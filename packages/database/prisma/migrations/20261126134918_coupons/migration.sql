-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('percent', 'amount', 'free_shipping', 'bogo', 'other');

-- CreateEnum
CREATE TYPE "CouponSource" AS ENUM ('api', 'feed', 'affiliate', 'merchant', 'community', 'admin', 'demo');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('active', 'expired', 'unverified', 'reported', 'pending_approval', 'rejected');

-- AlterEnum
ALTER TYPE "ClickKind" ADD VALUE 'coupon';

-- AlterTable
ALTER TABLE "affiliate_clicks" ADD COLUMN     "couponId" TEXT;

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" INTEGER,
    "minSpendCents" INTEGER,
    "categoryId" TEXT,
    "productId" TEXT,
    "startsAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "source" "CouponSource" NOT NULL,
    "affiliateUrl" TEXT,
    "status" "CouponStatus" NOT NULL DEFAULT 'unverified',
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "merchantAccountId" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_follows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_votes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "worked" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupon_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupons_retailerId_status_idx" ON "coupons"("retailerId", "status");

-- CreateIndex
CREATE INDEX "coupons_status_expiresAt_idx" ON "coupons"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "coupons_productId_idx" ON "coupons"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_source_externalId_key" ON "coupons"("source", "externalId");

-- CreateIndex
CREATE INDEX "coupon_follows_retailerId_idx" ON "coupon_follows"("retailerId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_follows_userId_retailerId_key" ON "coupon_follows"("userId", "retailerId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_votes_userId_couponId_key" ON "coupon_votes"("userId", "couponId");

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "merchant_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_follows" ADD CONSTRAINT "coupon_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_follows" ADD CONSTRAINT "coupon_follows_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_votes" ADD CONSTRAINT "coupon_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_votes" ADD CONSTRAINT "coupon_votes_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
