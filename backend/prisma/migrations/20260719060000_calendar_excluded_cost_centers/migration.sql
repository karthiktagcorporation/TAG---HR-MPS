-- Cost centers that ignore a month's weekly offs/holidays (every day is working for them)
ALTER TABLE "calendar_months" ADD COLUMN "excludedCostCenterIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
