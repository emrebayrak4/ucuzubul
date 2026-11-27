-- CreateEnum
CREATE TYPE "RetailerKind" AS ENUM ('national', 'marketplace', 'local');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "unitPricing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "merchant_accounts" ADD COLUMN     "businessCategory" TEXT,
ADD COLUMN     "businessPhone" TEXT,
ADD COLUMN     "einLast4" CHAR(4),
ADD COLUMN     "isLocalSeller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "submittedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "netQuantity" DOUBLE PRECISION,
ADD COLUMN     "netUnit" VARCHAR(8),
ADD COLUMN     "packCount" INTEGER,
ADD COLUMN     "sizeLabel" TEXT;

-- AlterTable
ALTER TABLE "retailer_feeds" ADD COLUMN     "reviewStatus" "VerificationStatus" NOT NULL DEFAULT 'verified';

-- AlterTable
ALTER TABLE "retailers" ADD COLUMN     "deliveryMinimumCents" INTEGER,
ADD COLUMN     "kind" "RetailerKind" NOT NULL DEFAULT 'national',
ADD COLUMN     "pickupMinimumCents" INTEGER;

-- CreateTable
CREATE TABLE "store_locations" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "merchantAccountId" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "address1" TEXT,
    "city" TEXT,
    "state" CHAR(2),
    "zip" CHAR(5) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geoPrecision" VARCHAR(16) NOT NULL DEFAULT 'zip_centroid',
    "phone" TEXT,
    "hours" JSONB,
    "pickup" BOOLEAN NOT NULL DEFAULT true,
    "deliveryRadiusMiles" INTEGER,
    "pickupMinimumCents" INTEGER,
    "deliveryMinimumCents" INTEGER,
    "source" "DataSource" NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_inventory" (
    "id" TEXT NOT NULL,
    "storeLocationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "retailerSku" TEXT,
    "priceCents" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "stock" "StockStatus" NOT NULL DEFAULT 'unknown',
    "quantity" INTEGER,
    "pickupToday" BOOLEAN NOT NULL DEFAULT false,
    "source" "DataSource" NOT NULL,
    "lastCheckedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_connections" (
    "id" TEXT NOT NULL,
    "merchantAccountId" TEXT NOT NULL,
    "provider" VARCHAR(24) NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'pending_configuration',
    "config" JSONB,
    "ciphertext" TEXT,
    "lastSyncAt" TIMESTAMPTZ(3),
    "nextSyncAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "itemsSynced" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commerce_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_locations_lat_lng_idx" ON "store_locations"("lat", "lng");

-- CreateIndex
CREATE INDEX "store_locations_zip_idx" ON "store_locations"("zip");

-- CreateIndex
CREATE INDEX "store_locations_merchantAccountId_idx" ON "store_locations"("merchantAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "store_locations_retailerId_externalId_key" ON "store_locations"("retailerId", "externalId");

-- CreateIndex
CREATE INDEX "store_inventory_productId_idx" ON "store_inventory"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "store_inventory_storeLocationId_productId_key" ON "store_inventory"("storeLocationId", "productId");

-- CreateIndex
CREATE INDEX "commerce_connections_nextSyncAt_idx" ON "commerce_connections"("nextSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_connections_merchantAccountId_provider_key" ON "commerce_connections"("merchantAccountId", "provider");

-- AddForeignKey
ALTER TABLE "store_locations" ADD CONSTRAINT "store_locations_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_locations" ADD CONSTRAINT "store_locations_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "merchant_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_inventory" ADD CONSTRAINT "store_inventory_storeLocationId_fkey" FOREIGN KEY ("storeLocationId") REFERENCES "store_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_inventory" ADD CONSTRAINT "store_inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_connections" ADD CONSTRAINT "commerce_connections_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "merchant_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
