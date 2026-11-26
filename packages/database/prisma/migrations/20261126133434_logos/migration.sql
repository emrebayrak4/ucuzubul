-- CreateEnum
CREATE TYPE "LogoSource" AS ENUM ('official_site', 'admin_upload', 'logo_provider');

-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "logoSource" "LogoSource",
ADD COLUMN     "logoUpdatedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "retailers" ADD COLUMN     "logoSource" "LogoSource",
ADD COLUMN     "logoUpdatedAt" TIMESTAMPTZ(3);
