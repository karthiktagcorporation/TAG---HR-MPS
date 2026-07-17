-- Calendar master: per-month working days / weekly offs / holidays
CREATE TABLE "calendar_months" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "weeklyOffDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "holidays" JSONB NOT NULL DEFAULT '[]',
    "workingDays" INTEGER NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_months_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_months_year_month_key" ON "calendar_months"("year", "month");
