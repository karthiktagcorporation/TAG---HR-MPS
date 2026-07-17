import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { getWorkingDays } from '../calendar/calendar.service';
import { monthlyPlanTotals, dailyPlanOnDate } from '../plans/planTimeline';
import { fmtDate } from '../../utils/dateFormat';

export interface DashboardFilters {
  year: number;
  month: number;
  /** Single-date view: plan = daily plan × 1, actuals for that date only */
  date?: Date;
  dateFrom?: Date;
  dateTo?: Date;
  unitId?: string;
  costCenterId?: string;
  scopedCostCenterIds?: string[] | null;
}

/**
 * Plan totals per cost center for the current view, honouring effective-dated
 * plan revisions and the Calendar Master:
 *  - single-date view: the plan in force on that date
 *  - month view: Σ over working days of the plan in force each day
 * Also returns the current daily plan (for attendance %).
 */
async function planTotals(f: DashboardFilters) {
  if (f.date) {
    const daily = await dailyPlanOnDate(f.date, f);
    const map = new Map<string, { unitId: string; planned: number; daily: number }>();
    for (const [cc, v] of daily) map.set(cc, { unitId: v.unitId, planned: v.qty.plannedCount, daily: v.qty.plannedCount });
    return map;
  }
  const totals = await monthlyPlanTotals(f.year, f.month, f);
  const map = new Map<string, { unitId: string; planned: number; daily: number }>();
  for (const [cc, v] of totals) map.set(cc, { unitId: v.unitId, planned: v.monthly.plannedCount, daily: v.daily.plannedCount });
  return map;
}

function sumPlanned(map: Map<string, { planned: number; daily: number; unitId: string }>) {
  let planned = 0;
  let daily = 0;
  for (const v of map.values()) { planned += v.planned; daily += v.daily; }
  return { planned, daily };
}

function actualDateRange(f: DashboardFilters) {
  if (f.date) {
    const d = new Date(Date.UTC(f.date.getUTCFullYear(), f.date.getUTCMonth(), f.date.getUTCDate()));
    return { gte: d, lte: d };
  }
  if (f.dateFrom || f.dateTo) {
    return { gte: f.dateFrom ?? undefined, lte: f.dateTo ?? undefined };
  }
  // default: the selected month
  const from = new Date(Date.UTC(f.year, f.month - 1, 1));
  const to = new Date(Date.UTC(f.year, f.month, 0));
  return { gte: from, lte: to };
}

function actualWhere(f: DashboardFilters): Prisma.ManpowerActualWhereInput {
  return {
    deletedAt: null,
    date: actualDateRange(f),
    ...(f.scopedCostCenterIds ? { costCenterId: { in: f.scopedCostCenterIds } } : {}),
    ...(f.unitId ? { unitId: f.unitId } : {}),
    ...(f.costCenterId ? { costCenterId: f.costCenterId } : {}),
  };
}

export const dashboardService = {
  async kpis(f: DashboardFilters) {
    const [plan, actualAgg, vendorCount, unitCount, pendingApprovals, wd] = await Promise.all([
      planTotals(f),
      prisma.manpowerActual.aggregate({ where: actualWhere(f), _sum: { actualCount: true, shortage: true, excess: true } }),
      prisma.vendor.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.unit.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.manpowerPlan.count({ where: { status: 'PENDING', deletedAt: null } }),
      f.date ? Promise.resolve(1) : getWorkingDays(f.year, f.month),
    ]);
    const { planned: totalPlanned, daily: dailyPlanned } = sumPlanned(plan);

    // Latest day's actual vs the DAILY plan for attendance %
    const latest = await prisma.manpowerActual.aggregate({ where: actualWhere(f), _max: { date: true } });
    let attendancePercent = 0;
    if (latest._max.date) {
      const latestActual = await prisma.manpowerActual.aggregate({
        where: { ...actualWhere(f), date: latest._max.date },
        _sum: { actualCount: true },
      });
      const dayActual = latestActual._sum.actualCount ?? 0;
      attendancePercent = dailyPlanned > 0 ? Math.round((dayActual / dailyPlanned) * 1000) / 10 : 0;
    }

    return {
      totalPlanned,
      workingDays: wd,
      totalActual: actualAgg._sum.actualCount ?? 0,
      shortage: actualAgg._sum.shortage ?? 0,
      excess: actualAgg._sum.excess ?? 0,
      vendorCount,
      unitCount,
      attendancePercent,
      pendingApprovals,
    };
  },

  /** Plan vs Actual grouped by unit. */
  async planVsActualByUnit(f: DashboardFilters) {
    const units = await prisma.unit.findMany({ where: { status: 'ACTIVE', deletedAt: null }, orderBy: { code: 'asc' } });
    const [plan, actuals] = await Promise.all([
      planTotals(f),
      prisma.manpowerActual.groupBy({ by: ['unitId'], where: actualWhere(f), _sum: { actualCount: true } }),
    ]);
    const planMap = new Map<string, number>();
    for (const v of plan.values()) planMap.set(v.unitId, (planMap.get(v.unitId) ?? 0) + v.planned);
    const actualMap = new Map(actuals.map((a) => [a.unitId, a._sum.actualCount ?? 0]));
    return units
      .filter((u) => !f.unitId || u.id === f.unitId)
      .map((u) => ({ label: u.code, name: u.name, planned: planMap.get(u.id) ?? 0, actual: actualMap.get(u.id) ?? 0 }));
  },

  async costCenterAnalysis(f: DashboardFilters) {
    const grouped = await prisma.manpowerActual.groupBy({
      by: ['costCenterId'],
      where: actualWhere(f),
      _sum: { actualCount: true, shortage: true, excess: true },
    });
    const ccs = await prisma.costCenter.findMany({ where: { id: { in: grouped.map((g) => g.costCenterId) } }, include: { unit: true } });
    const ccMap = new Map(ccs.map((c) => [c.id, c]));
    return grouped
      .map((g) => {
        const cc = ccMap.get(g.costCenterId);
        return {
          label: cc ? `${cc.unit.code}-${cc.costCode}` : g.costCenterId,
          name: cc?.costCentre ?? '',
          actual: g._sum.actualCount ?? 0,
          shortage: g._sum.shortage ?? 0,
          excess: g._sum.excess ?? 0,
        };
      })
      .sort((a, b) => b.shortage - a.shortage)
      .slice(0, 15);
  },

  /** Plan vs Actual for every cost center of the selected month. */
  async planVsActualByCostCenter(f: DashboardFilters) {
    const [plan, actuals] = await Promise.all([
      planTotals(f),
      prisma.manpowerActual.groupBy({ by: ['costCenterId'], where: actualWhere(f), _sum: { actualCount: true } }),
    ]);
    const ccs = await prisma.costCenter.findMany({ where: { id: { in: [...plan.keys()] } }, include: { unit: true } });
    const ccMap = new Map(ccs.map((c) => [c.id, c]));
    const actualMap = new Map(actuals.map((a) => [a.costCenterId, a._sum.actualCount ?? 0]));
    return [...plan.entries()]
      .map(([ccId, v]) => {
        const cc = ccMap.get(ccId);
        return {
          label: cc ? `${cc.unit.code}-${cc.costCode}` : ccId,
          name: cc?.costCentre ?? '',
          planned: v.planned,
          actual: actualMap.get(ccId) ?? 0,
        };
      })
      .sort((a, b) => b.planned - a.planned)
      .slice(0, 15);
  },

  async monthlyTrend(f: DashboardFilters) {
    // Revision-aware plan totals for each month of the selected year
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const out: { label: string; planned: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const totals = await monthlyPlanTotals(f.year, m, { scopedCostCenterIds: f.scopedCostCenterIds });
      let planned = 0;
      for (const v of totals.values()) planned += v.monthly.plannedCount;
      out.push({ label: names[m - 1], planned });
    }
    return out;
  },

  async dailyAttendanceTrend(f: DashboardFilters) {
    const rows = await prisma.manpowerActual.groupBy({
      by: ['date'],
      where: actualWhere(f),
      _sum: { actualCount: true, shortage: true, excess: true },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      date: fmtDate(r.date),
      actual: r._sum.actualCount ?? 0,
      shortage: r._sum.shortage ?? 0,
      excess: r._sum.excess ?? 0,
    }));
  },

  async full(f: DashboardFilters) {
    const [kpis, planVsActual, costCenterAnalysis, planVsActualByCostCenter, monthlyTrend, dailyAttendanceTrend] = await Promise.all([
      this.kpis(f),
      this.planVsActualByUnit(f),
      this.costCenterAnalysis(f),
      this.planVsActualByCostCenter(f),
      this.monthlyTrend(f),
      this.dailyAttendanceTrend(f),
    ]);
    return {
      kpis,
      charts: {
        planVsActual,
        costCenterAnalysis,
        planVsActualByCostCenter,
        monthlyTrend,
        dailyAttendanceTrend,
      },
    };
  },
};
