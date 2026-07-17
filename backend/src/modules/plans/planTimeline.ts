import { prisma } from '../../config/prisma';
import { getWorkingDayNumbers } from '../calendar/calendar.service';

/**
 * Effective-dated plan math. A plan's quantities can change mid-month via
 * PlanRevision rows; the value in force on a date is the latest revision with
 * effectiveFrom <= that date (0 before the first revision).
 */

export interface PlanQty {
  plannedCount: number;
  dayPlan: number;
  nightPlan: number;
}

interface Rev extends PlanQty {
  effectiveFrom: Date;
}

interface PlanFilters {
  unitId?: string;
  costCenterId?: string;
  scopedCostCenterIds?: string[] | null;
}

const ZERO: PlanQty = { plannedCount: 0, dayPlan: 0, nightPlan: 0 };

/** Sorted revisions per cost center for a month's APPROVED plans. */
export async function approvedRevisionsByCostCenter(year: number, month: number, f: PlanFilters = {}) {
  const plans = await prisma.manpowerPlan.findMany({
    where: {
      year,
      month,
      status: 'APPROVED',
      deletedAt: null,
      ...(f.scopedCostCenterIds ? { costCenterId: { in: f.scopedCostCenterIds } } : {}),
      ...(f.unitId ? { unitId: f.unitId } : {}),
      ...(f.costCenterId ? { costCenterId: f.costCenterId } : {}),
    },
    select: {
      costCenterId: true,
      unitId: true,
      plannedCount: true,
      dayPlan: true,
      nightPlan: true,
      revisions: { orderBy: { effectiveFrom: 'asc' } },
    },
  });
  const map = new Map<string, { unitId: string; revs: Rev[] }>();
  for (const p of plans) {
    // Plans created before the revision feature have no revision rows — treat
    // the base row as a single revision from day 1.
    const revs: Rev[] = p.revisions.length
      ? p.revisions
      : [{ effectiveFrom: new Date(Date.UTC(year, month - 1, 1)), plannedCount: p.plannedCount, dayPlan: p.dayPlan, nightPlan: p.nightPlan }];
    map.set(p.costCenterId, { unitId: p.unitId, revs });
  }
  return map;
}

/** Value in force on a specific day-of-month. */
export function qtyOnDay(revs: Rev[], year: number, month: number, day: number): PlanQty {
  const target = Date.UTC(year, month - 1, day);
  let current: PlanQty = ZERO;
  for (const r of revs) {
    if (r.effectiveFrom.getTime() <= target) current = r;
    else break;
  }
  return { plannedCount: current.plannedCount, dayPlan: current.dayPlan, nightPlan: current.nightPlan };
}

/**
 * Month totals per cost center: Σ over WORKING days of the quantity in force
 * that day (Calendar Master aware). Also returns the daily quantity currently
 * in force (latest revision) for daily-plan displays.
 */
export async function monthlyPlanTotals(year: number, month: number, f: PlanFilters = {}) {
  const [revMap, workingDays] = await Promise.all([
    approvedRevisionsByCostCenter(year, month, f),
    getWorkingDayNumbers(year, month),
  ]);
  const totals = new Map<string, { unitId: string; monthly: PlanQty; daily: PlanQty }>();
  for (const [ccId, { unitId, revs }] of revMap) {
    const monthly: PlanQty = { plannedCount: 0, dayPlan: 0, nightPlan: 0 };
    for (const day of workingDays) {
      const q = qtyOnDay(revs, year, month, day);
      monthly.plannedCount += q.plannedCount;
      monthly.dayPlan += q.dayPlan;
      monthly.nightPlan += q.nightPlan;
    }
    const last = revs[revs.length - 1];
    totals.set(ccId, { unitId, monthly, daily: { plannedCount: last.plannedCount, dayPlan: last.dayPlan, nightPlan: last.nightPlan } });
  }
  return totals;
}

/** Daily plan quantities in force on a specific date, per cost center. */
export async function dailyPlanOnDate(date: Date, f: PlanFilters = {}) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const revMap = await approvedRevisionsByCostCenter(year, month, f);
  const out = new Map<string, { unitId: string; qty: PlanQty }>();
  for (const [ccId, { unitId, revs }] of revMap) {
    out.set(ccId, { unitId, qty: qtyOnDay(revs, year, month, date.getUTCDate()) });
  }
  return out;
}

/** Plan in force for ONE cost center on a date (variance computation). */
export async function planForCostCenterOnDate(costCenterId: string, date: Date): Promise<PlanQty> {
  const map = await dailyPlanOnDate(date, { costCenterId });
  return map.get(costCenterId)?.qty ?? ZERO;
}
