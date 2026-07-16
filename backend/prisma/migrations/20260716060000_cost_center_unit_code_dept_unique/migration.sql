-- Allow the same cost code to repeat within a unit when the department differs
-- (e.g. U1-HRADM-SECURITY-ASO vs U1-HRADM-HK).

-- DropIndex
DROP INDEX "cost_centers_unitId_costCode_key";

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_unitId_costCode_department_key" ON "cost_centers"("unitId", "costCode", "department");
