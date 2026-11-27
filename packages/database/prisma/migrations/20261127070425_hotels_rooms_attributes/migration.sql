-- AlterTable
ALTER TABLE "hotels" ADD COLUMN     "accessibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "chain" TEXT,
ADD COLUMN     "cityId" INTEGER,
ADD COLUMN     "faqs" JSONB,
ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "houseRules" JSONB,
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "payAtProperty" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "propertyType" TEXT NOT NULL DEFAULT 'hotel';

-- CreateTable
CREATE TABLE "hotel_rooms" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bedConfig" TEXT NOT NULL,
    "sizeSqm" INTEGER,
    "maxOccupancy" INTEGER NOT NULL DEFAULT 2,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ratePlans" JSONB NOT NULL,
    "demoRatesFrom" DATE,
    "demoNightlyCents" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" "DataSource" NOT NULL,

    CONSTRAINT "hotel_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hotel_rooms_hotelId_code_key" ON "hotel_rooms"("hotelId", "code");

-- CreateIndex
CREATE INDEX "hotels_cityId_idx" ON "hotels"("cityId");

-- AddForeignKey
ALTER TABLE "hotel_rooms" ADD CONSTRAINT "hotel_rooms_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
