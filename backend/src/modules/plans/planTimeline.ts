import { prisma } from '../../config/prisma';
import { getWorkingDayNumbersForCostCenters } from '../calendar/calendar.service';

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
  categoryId?: string;
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
      ...(f.categoryId ? { costCenter: { categoryId: f.categoryId } } : {}),
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
 * that day (Calendar Master aware — cost centers in the month's exclusion
 * list count every day as working, ignoring weekly offs/holidays). Also
 * returns the daily quantity currently in force (latest revision).
 */
export async function monthlyPlanTotals(year: number, month: number, f: PlanFilters = {}) {
  const [revMap, wd] = await Promise.all([
    approvedRevisionsByCostCenter(year, month, f),
    getWorkingDayNumbersForCostCenters(year, month),
  ]);
  const totals = new Map<string, { unitId: string; monthly: PlanQty; daily: PlanQty }>();
  for (const [ccId, { unitId, revs }] of revMap) {
    const monthly: PlanQty = { plannedCount: 0, dayPlan: 0, nightPlan: 0 };
    for (const day of wd.forCostCenter(ccId)) {
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

/**
 * Plan totals per cost center over an arbitrary DATE RANGE (may span months):
 * Σ over the range's working days of the quantity in force each day, honouring
 * the Calendar Master and per-month cost-center exclusions. Also returns the
 * latest daily quantity in force (for attendance %).
 */
export async function rangePlanTotals(from: Date, to: Date, f: PlanFilters = {}) {
  const totals = new Map<string, { unitId: string; monthly: PlanQty; daily: PlanQty }>();
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const [revMap, wd] = await Promise.all([
      approvedRevisionsByCostCenter(year, month, f),
      getWorkingDayNumbersForCostCenters(year, month),
    ]);
    const dayLo = year === from.getUTCFullYear() && month === from.getUTCMonth() + 1 ? from.getUTCDate() : 1;
    const dayHi = year === to.getUTCFullYear() && month === to.getUTCMonth() + 1 ? to.getUTCDate() : 31;
    for (const [ccId, { unitId, revs }] of revMap) {
      const cur = totals.get(ccId) ?? { unitId, monthly: { plannedCount: 0, dayPlan: 0, nightPlan: 0 }, daily: { plannedCount: 0, dayPlan: 0, nightPlan: 0 } };
      for (const day of wd.forCostCenter(ccId)) {
        if (day < dayLo || day > dayHi) continue;
        const q = qtyOnDay(revs, year, month, day);
        cur.monthly.plannedCount += q.plannedCount;
        cur.monthly.dayPlan += q.dayPlan;
        cur.monthly.nightPlan += q.nightPlan;
      }
      const last = revs[revs.length - 1];
      cur.daily = { plannedCount: last.plannedCount, dayPlan: last.dayPlan, nightPlan: last.nightPlan };
      totals.set(ccId, cur);
    }
    cursor = new Date(Date.UTC(year, month, 1));
  }
  return totals;
}

/**
 * Daily plan quantities in force on a specific date, per cost center —
 * Calendar-Master aware: on a weekly-off/holiday, plan is 0 UNLESS the cost
 * center is in that month's exclusion list (e.g. Security roles that work
 * every day). Unconfigured months treat every day as working, same as before.
 */
export async function dailyPlanOnDate(date: Date, f: PlanFilters = {}) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const [revMap, wd] = await Promise.all([
    approvedRevisionsByCostCenter(year, month, f),
    getWorkingDayNumbersForCostCenters(year, month),
  ]);
  const out = new Map<string, { unitId: string; qty: PlanQty }>();
  for (const [ccId, { unitId, revs }] of revMap) {
    const isWorkingDay = wd.forCostCenter(ccId).includes(day);
    out.set(ccId, { unitId, qty: isWorkingDay ? qtyOnDay(revs, year, month, day) : ZERO });
  }
  return out;
}

/** Plan in force for ONE cost center on a date (variance computation). */
export async function planForCostCenterOnDate(costCenterId: string, date: Date): Promise<PlanQty> {
  const map = await dailyPlanOnDate(date, { costCenterId });
  return map.get(costCenterId)?.qty ?? ZERO;
}
