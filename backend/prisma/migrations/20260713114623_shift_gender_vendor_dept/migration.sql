-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('DAY', 'NIGHT');

-- AlterTable
ALTER TABLE "cost_centers" ADD COLUMN     "department" TEXT;

-- AlterTable
ALTER TABLE "manpower_actuals" ADD COLUMN     "dayActual" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "femaleActual" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maleActual" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nightActual" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "manpower_plans" ADD COLUMN     "dayPlan" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "femalePlan" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "malePlan" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nightPlan" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "canDeleteActuals" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "actual_vendor_allocations" (
    "id" TEXT NOT NULL,
    "actualId" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "vendorId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "actual_vendor_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actual_vendor_allocations_vendorId_idx" ON "actual_vendor_allocations"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "actual_vendor_allocations_actualId_shift_vendorId_key" ON "actual_vendor_allocations"("actualId", "shift", "vendorId");

-- AddForeignKey
ALTER TABLE "actual_vendor_allocations" ADD CONSTRAINT "actual_vendor_allocations_actualId_fkey" FOREIGN KEY ("actualId") REFERENCES "manpower_actuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_vendor_allocations" ADD CONSTRAINT "actual_vendor_allocations_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
