-- CreateEnum
CREATE TYPE "ConditionGrade" AS ENUM ('like_new', 'very_good', 'good', 'acceptable');

-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('retailer', 'marketplace');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductCondition" ADD VALUE 'for_parts';
ALTER TYPE "ProductCondition" ADD VALUE 'unknown';

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "conditionGrade" "ConditionGrade",
ADD COLUMN     "refurbishedBy" TEXT,
ADD COLUMN     "returnPolicy" TEXT,
ADD COLUMN     "sellerName" TEXT,
ADD COLUMN     "sellerType" "SellerType";

-- AlterTable
ALTER TABLE "price_alerts" ADD COLUMN     "condition" "ProductCondition" NOT NULL DEFAULT 'new';
