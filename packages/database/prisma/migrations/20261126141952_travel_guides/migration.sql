-- CreateEnum
CREATE TYPE "GuideStatus" AS ENUM ('draft', 'published');

-- DropIndex
DROP INDEX "airports_name_trgm_idx";

-- DropIndex
DROP INDEX "cities_ascii_trgm_idx";

-- CreateTable
CREATE TABLE "travel_guides" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cityId" INTEGER,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryIso2" CHAR(2) NOT NULL,
    "iataCityCode" CHAR(3),
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bestTimeToVisit" TEXT,
    "neighborhoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastReviewed" DATE,
    "bodyMarkdown" TEXT NOT NULL,
    "status" "GuideStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMPTZ(3),
    "adminEditedAt" TIMESTAMPTZ(3),
    "sourceHash" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "travel_guides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "travel_guides_slug_key" ON "travel_guides"("slug");

-- CreateIndex
CREATE INDEX "travel_guides_status_countryIso2_idx" ON "travel_guides"("status", "countryIso2");

-- CreateIndex
CREATE INDEX "travel_guides_cityId_idx" ON "travel_guides"("cityId");
