-- Accent-insensitive search for the places fallback.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "AirportType" AS ENUM ('large', 'medium', 'small');

-- AlterTable
ALTER TABLE "airports" ADD COLUMN     "cityId" INTEGER,
ADD COLUMN     "metroCode" CHAR(3),
ADD COLUMN     "ourairportsId" INTEGER,
ADD COLUMN     "regionCode" TEXT,
ADD COLUMN     "scheduledService" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "type" "AirportType",
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "countries" (
    "iso2" CHAR(2) NOT NULL,
    "iso3" CHAR(3),
    "name" TEXT NOT NULL,
    "continent" CHAR(2),
    "currency" CHAR(3),
    "capital" TEXT,
    "population" BIGINT,
    "geonameId" INTEGER,
    "nameLocalized" JSONB,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("iso2")
);

-- CreateTable
CREATE TABLE "cities" (
    "geonameId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "asciiName" TEXT NOT NULL,
    "alternateNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "countryIso2" CHAR(2) NOT NULL,
    "admin1Code" TEXT,
    "admin1Name" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "population" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT,
    "iataCityCode" CHAR(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("geonameId")
);

-- CreateIndex
CREATE INDEX "countries_name_idx" ON "countries"("name");

-- CreateIndex
CREATE INDEX "cities_countryIso2_population_idx" ON "cities"("countryIso2", "population");

-- CreateIndex
CREATE INDEX "cities_iataCityCode_idx" ON "cities"("iataCityCode");

-- CreateIndex
CREATE INDEX "cities_asciiName_idx" ON "cities"("asciiName");

-- CreateIndex
CREATE INDEX "airports_cityId_idx" ON "airports"("cityId");

-- CreateIndex
CREATE INDEX "airports_metroCode_idx" ON "airports"("metroCode");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_countryIso2_fkey" FOREIGN KEY ("countryIso2") REFERENCES "countries"("iso2") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigram indexes for place autocomplete fallback (pg_trgm enabled in search_trgm migration).
CREATE INDEX IF NOT EXISTS "cities_ascii_trgm_idx" ON "cities" USING GIN ("asciiName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "airports_name_trgm_idx" ON "airports" USING GIN ("name" gin_trgm_ops);
