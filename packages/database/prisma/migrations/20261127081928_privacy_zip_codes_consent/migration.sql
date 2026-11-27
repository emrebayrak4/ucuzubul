-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('access', 'delete', 'correct', 'opt_out');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('awaiting_verification', 'verified', 'completed', 'rejected');

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "consent" JSONB;

-- CreateTable
CREATE TABLE "zip_codes" (
    "zip" CHAR(5) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "state" CHAR(2),
    "county" TEXT,
    "city" TEXT,
    "population" INTEGER,
    "landAreaKm2" DOUBLE PRECISION,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "zip_codes_pkey" PRIMARY KEY ("zip")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" TEXT NOT NULL,
    "type" "PrivacyRequestType" NOT NULL,
    "email" TEXT NOT NULL,
    "state" CHAR(2),
    "details" TEXT,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'awaiting_verification',
    "verifyTokenHash" TEXT,
    "verifyExpiresAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zip_codes_lat_lng_idx" ON "zip_codes"("lat", "lng");

-- CreateIndex
CREATE INDEX "zip_codes_state_idx" ON "zip_codes"("state");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_requests_verifyTokenHash_key" ON "privacy_requests"("verifyTokenHash");

-- CreateIndex
CREATE INDEX "privacy_requests_email_idx" ON "privacy_requests"("email");

-- CreateIndex
CREATE INDEX "privacy_requests_status_dueAt_idx" ON "privacy_requests"("status", "dueAt");
