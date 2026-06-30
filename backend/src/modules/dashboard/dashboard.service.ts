import { Prisma, ManpowerType } from '@prisma/client';
import { prisma } from '../../config/prisma';

export interface DashboardFilters {
  year: number;
  month: number;
  dateFrom?: Date;
  dateTo?: Date;
  unitId?: string;
  costCenterId?: string;
  vendorId?: string;
  scopedCostCenterIds?: string[] | null;
}

function planWhere(f: DashboardFilters): Prisma.ManpowerPlanWhereInput {
  return {
    deletedAt: null,
    status: 'APPROVED',
    year: f.year,
    month: f.month,
    ...(f.scopedCostCenterIds ? { costCenterId: { in: f.scopedCostCenterIds } } : {}),
    ...(f.unitId ? { unitId: f.unitId } : {}),
    ...(f.costCenterId ? { costCenterId: f.costCenterId } : {}),
    ...(f.vendorId ? { vendorId: f.vendorId } : {}),
  };
}

function actualDateRange(f: DashboardFilters) {
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
    ...(f.vendorId ? { vendorId: f.vendorId } : {}),
  };
}

export const dashboardService = {
  async kpis(f: DashboardFilters) {
    const [planAgg, actualAgg, vendorCount, unitCount, pendingApprovals] = await Promise.all([
      prisma.manpowerPlan.aggregate({ where: planWhere(f), _sum: { plannedCount: true } }),
      prisma.manpowerActual.aggregate({ where: actualWhere(f), _sum: { actualCount: true, shortage: true, excess: true } }),
      prisma.vendor.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.unit.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.manpowerPlan.count({ where: { status: 'PENDING', deletedAt: null } }),
    ]);

    // Latest day's actual vs the monthly plan for attendance %
    const latest = await prisma.manpowerActual.aggregate({ where: actualWhere(f), _max: { date: true } });
    let attendancePercent = 0;
    if (latest._max.date) {
      const latestActual = await prisma.manpowerActual.aggregate({
        where: { ...actualWhere(f), date: latest._max.date },
        _sum: { actualCount: true },
      });
      const totalPlanned = planAgg._sum.plannedCount ?? 0;
      const dayActual = latestActual._sum.actualCount ?? 0;
      attendancePercent = totalPlanned > 0 ? Math.round((dayActual / totalPlanned) * 1000) / 10 : 0;
    }

    return {
      totalPlanned: planAgg._sum.plannedCount ?? 0,
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
    const [plans, actuals] = await Promise.all([
      prisma.manpowerPlan.groupBy({ by: ['unitId'], where: planWhere(f), _sum: { plannedCount: true } }),
      prisma.manpowerActual.groupBy({ by: ['unitId'], where: { ...actualWhere(f), date: this._latestOrRange(f) }, _sum: { actualCount: true } }),
    ]);
    const planMap = new Map(plans.map((p) => [p.unitId, p._sum.plannedCount ?? 0]));
    const actualMap = new Map(actuals.map((a) => [a.unitId, a._sum.actualCount ?? 0]));
    return units
      .filter((u) => !f.unitId || u.id === f.unitId)
      .map((u) => ({ label: u.code, name: u.name, planned: planMap.get(u.id) ?? 0, actual: actualMap.get(u.id) ?? 0 }));
  },

  _latestOrRange(f: DashboardFilters) {
    // For "current snapshot" charts use the date range/month directly (sum over period).
    return actualDateRange(f);
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

  async vendorPerformance(f: DashboardFilters) {
    const [plans, actuals] = await Promise.all([
      prisma.manpowerPlan.groupBy({ by: ['vendorId'], where: planWhere(f), _sum: { plannedCount: true } }),
      prisma.manpowerActual.groupBy({ by: ['vendorId'], where: actualWhere(f), _sum: { actualCount: true, shortage: true } }),
    ]);
    const ids = [...new Set([...plans.map((p) => p.vendorId), ...actuals.map((a) => a.vendorId)])];
    const vendors = await prisma.vendor.findMany({ where: { id: { in: ids } } });
    const vMap = new Map(vendors.map((v) => [v.id, v.vendorName]));
    const planMap = new Map(plans.map((p) => [p.vendorId, p._sum.plannedCount ?? 0]));
    return actuals
      .map((a) => {
        const planned = planMap.get(a.vendorId) ?? 0;
        const actual = a._sum.actualCount ?? 0;
        return {
          label: vMap.get(a.vendorId) ?? a.vendorId,
          planned,
          actual,
          shortage: a._sum.shortage ?? 0,
          fulfillment: planned > 0 ? Math.round((actual / planned) * 100) : 0,
        };
      })
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 12);
  },

  async genderDistribution(f: DashboardFilters) {
    const grouped = await prisma.manpowerActual.groupBy({ by: ['type'], where: actualWhere(f), _sum: { actualCount: true } });
    return grouped.map((g) => ({ label: g.type, value: g._sum.actualCount ?? 0 }));
  },

  async monthlyTrend(f: DashboardFilters) {
    // Plan totals for each month of the selected year
    const plans = await prisma.manpowerPlan.groupBy({
      by: ['month'],
      where: { deletedAt: null, status: 'APPROVED', year: f.year, ...(f.scopedCostCenterIds ? { costCenterId: { in: f.scopedCostCenterIds } } : {}) },
      _sum: { plannedCount: true },
    });
    const planMap = new Map(plans.map((p) => [p.month, p._sum.plannedCount ?? 0]));
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names.map((label, i) => ({ label, planned: planMap.get(i + 1) ?? 0 }));
  },

  async dailyAttendanceTrend(f: DashboardFilters) {
    const rows = await prisma.manpowerActual.groupBy({
      by: ['date'],
      where: actualWhere(f),
      _sum: { actualCount: true, shortage: true, excess: true },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      actual: r._sum.actualCount ?? 0,
      shortage: r._sum.shortage ?? 0,
      excess: r._sum.excess ?? 0,
    }));
  },

  async shortageHeatmap(f: DashboardFilters) {
    // unit x type shortage matrix
    const grouped = await prisma.manpowerActual.groupBy({
      by: ['unitId', 'type'],
      where: actualWhere(f),
      _sum: { shortage: true },
    });
    const units = await prisma.unit.findMany({ where: { status: 'ACTIVE', deletedAt: null } });
    const uMap = new Map(units.map((u) => [u.id, u.code]));
    return grouped.map((g) => ({ unit: uMap.get(g.unitId) ?? g.unitId, type: g.type, shortage: g._sum.shortage ?? 0 }));
  },

  async vendorAllocation(f: DashboardFilters) {
    const grouped = await prisma.manpowerPlan.groupBy({ by: ['vendorId'], where: planWhere(f), _sum: { plannedCount: true } });
    const vendors = await prisma.vendor.findMany({ where: { id: { in: grouped.map((g) => g.vendorId) } } });
    const vMap = new Map(vendors.map((v) => [v.id, v.vendorName]));
    return grouped
      .map((g) => ({ label: vMap.get(g.vendorId) ?? g.vendorId, value: g._sum.plannedCount ?? 0 }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  },

  async full(f: DashboardFilters) {
    const [
      kpis,
      planVsActual,
      costCenterAnalysis,
      vendorPerformance,
      genderDistribution,
      monthlyTrend,
      dailyAttendanceTrend,
      shortageHeatmap,
      vendorAllocation,
    ] = await Promise.all([
      this.kpis(f),
      this.planVsActualByUnit(f),
      this.costCenterAnalysis(f),
      this.vendorPerformance(f),
      this.genderDistribution(f),
      this.monthlyTrend(f),
      this.dailyAttendanceTrend(f),
      this.shortageHeatmap(f),
      this.vendorAllocation(f),
    ]);
    return {
      kpis,
      charts: {
        planVsActual,
        costCenterAnalysis,
        vendorPerformance,
        genderDistribution,
        monthlyTrend,
        dailyAttendanceTrend,
        shortageHeatmap,
        vendorAllocation,
      },
    };
  },
};
