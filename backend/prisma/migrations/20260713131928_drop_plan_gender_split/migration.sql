/*
  Warnings:

  - You are about to drop the column `femalePlan` on the `manpower_plans` table. All the data in the column will be lost.
  - You are about to drop the column `malePlan` on the `manpower_plans` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "manpower_plans" DROP COLUMN "femalePlan",
DROP COLUMN "malePlan";
