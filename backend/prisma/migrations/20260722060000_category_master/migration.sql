-- Category master (Security, Housekeeping, Job Work, CNC Operator, Inspectors, NDT - QC, CL)
-- linked optionally to Cost Centers.
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");
CREATE INDEX "categories_status_idx" ON "categories"("status");

ALTER TABLE "cost_centers" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "cost_centers_categoryId_idx" ON "cost_centers"("categoryId");
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the standard category list
INSERT INTO "categories" ("id", "name", "status", "updatedAt") VALUES
    ('cat_cl000000000000000000', 'CL', 'ACTIVE', CURRENT_TIMESTAMP),
    ('cat_security00000000000', 'Security', 'ACTIVE', CURRENT_TIMESTAMP),
    ('cat_housekeeping0000000', 'Housekeeping', 'ACTIVE', CURRENT_TIMESTAMP),
    ('cat_jobwork00000000000', 'Job Work', 'ACTIVE', CURRENT_TIMESTAMP),
    ('cat_cncoperator0000000', 'CNC Operator', 'ACTIVE', CURRENT_TIMESTAMP),
    ('cat_inspectors0000000', 'Inspectors', 'ACTIVE', CURRENT_TIMESTAMP),
    ('cat_ndtqc00000000000', 'NDT - QC', 'ACTIVE', CURRENT_TIMESTAMP);
