-- Effective-dated plan revisions: mid-month plan changes apply from a chosen
-- date instead of rewriting the whole month.
CREATE TABLE "plan_revisions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "plannedCount" INTEGER NOT NULL,
    "dayPlan" INTEGER NOT NULL DEFAULT 0,
    "nightPlan" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_revisions_planId_effectiveFrom_key" ON "plan_revisions"("planId", "effectiveFrom");
CREATE INDEX "plan_revisions_planId_idx" ON "plan_revisions"("planId");

ALTER TABLE "plan_revisions" ADD CONSTRAINT "plan_revisions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "manpower_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing plan gets one revision effective from the 1st of
-- its month, carrying its current quantities. Preserves all production data.
INSERT INTO "plan_revisions" ("id", "planId", "effectiveFrom", "plannedCount", "dayPlan", "nightPlan")
SELECT
    'plrev_' || md5(random()::text || clock_timestamp()::text || "id"),
    "id",
    make_date("year", "month", 1),
    "plannedCount",
    "dayPlan",
    "nightPlan"
FROM "manpower_plans";
