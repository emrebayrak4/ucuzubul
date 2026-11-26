-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastTestAt" TIMESTAMPTZ(3),
    "lastTestStatus" TEXT,
    "lastTestMessage" TEXT,
    "lastTestLatencyMs" INTEGER,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_adapterId_key" ON "integration_credentials"("adapterId");

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
