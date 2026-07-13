import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError } from '../../utils/errors';

export type ReportType =
  | 'cost-center'
  | 'unit'
  | 'daily-attendance'
  | 'daily-summary'
  | 'monthly-summary'
  | 'plan-vs-actual'
  | 'shortage'
  | 'excess'
  | 'consolidated';

export interface ReportFilters {
  year: number;
  month: number;
  dateFrom?: Date;
  dateTo?: Date;
  unitId?: string;
  costCenterId?: string;
  search?: string;
  scopedCostCenterIds?: string[] | null;
}

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportResult {
  type: ReportType;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

function dateRange(f: ReportFilters) {
  if (f.dateFrom || f.dateTo) return { gte: f.dateFrom ?? undefined, lte: f.dateTo ?? undefined };
  const from = new Date(Date.UTC(f.year, f.month - 1, 1));
  const to = new Date(Date.UTC(f.year, f.month, 0));
  return { gte: from, lte: to };
}

function actualWhere(f: ReportFilters): Prisma.ManpowerActualWhereInput {
  return {
    deletedAt: null,
    date: dateRange(f),
    ...(f.scopedCostCenterIds ? { costCenterId: { in: f.scopedCostCenterIds } } : {}),
    ...(f.unitId ? { unitId: f.unitId } : {}),
    ...(f.costCenterId ? { costCenterId: f.costCenterId } : {}),
  };
}

function planWhere(f: ReportFilters): Prisma.ManpowerPlanWhereInput {
  return {
    deletedAt: null,
    status: 'APPROVED',
    year: f.year,
    month: f.month,
    ...(f.scopedCostCenterIds ? { costCenterId: { in: f.scopedCostCenterIds } } : {}),
    ...(f.unitId ? { unitId: f.unitId } : {}),
    ...(f.costCenterId ? { costCenterId: f.costCenterId } : {}),
  };
}

const REPORT_TITLES: Record<ReportType, string> = {
  'cost-center': 'Cost Center Report',
  unit: 'Unit Report',
  'daily-attendance': 'Daily Attendance Report',
  'daily-summary': 'Daily Summary',
  'monthly-summary': 'Monthly Summary',
  'plan-vs-actual': 'Plan vs Actual (by Cost Center)',
  shortage: 'Shortage Report',
  excess: 'Excess Report',
  consolidated: 'Consolidated Report',
};

export const reportService = {
  titles: REPORT_TITLES,

  async build(type: ReportType, f: ReportFilters): Promise<ReportResult> {
    const title = REPORT_TITLES[type];
    if (!title) throw new BadRequestError(`Unknown report type: ${type}`);

    switch (type) {
      case 'cost-center':
        return { type, title, ...(await this.byCostCenter(f)) };
      case 'unit':
        return { type, title, ...(await this.byUnit(f)) };
      case 'daily-attendance':
        return { type, title, ...(await this.dailyAttendance(f)) };
      case 'daily-summary':
        return { type, title, ...(await this.shiftSummary(f, 'daily')) };
      case 'monthly-summary':
        return { type, title, ...(await this.shiftSummary(f, 'monthly')) };
      case 'plan-vs-actual':
        return { type, title, ...(await this.planVsActual(f)) };
      case 'shortage':
        return { type, title, ...(await this.varianceReport(f, 'shortage')) };
      case 'excess':
        return { type, title, ...(await this.varianceReport(f, 'excess')) };
      case 'consolidated':
        return { type, title, ...(await this.consolidated(f)) };
      default:
        throw new BadRequestError(`Unknown report type: ${type}`);
    }
  },

  async byCostCenter(f: ReportFilters) {
    const [grouped, plans] = await Promise.all([
      prisma.manpowerActual.groupBy({
        by: ['costCenterId'],
        where: actualWhere(f),
        _sum: { actualCount: true, shortage: true, excess: true },
      }),
      prisma.manpowerPlan.findMany({ where: planWhere(f), select: { costCenterId: true, plannedCount: true } }),
    ]);
    const planMap = new Map(plans.map((p) => [p.costCenterId, p.plannedCount]));
    const ccs = await prisma.costCenter.findMany({ where: { id: { in: grouped.map((g) => g.costCenterId) } }, include: { unit: true } });
    const map = new Map(ccs.map((c) => [c.id, c]));
    const rows = grouped.map((g) => {
      const cc = map.get(g.costCenterId);
      return {
        unit: cc?.unit.code ?? '',
        costCode: cc?.costCode ?? '',
        costCentre: cc?.costCentre ?? '',
        planned: planMap.get(g.costCenterId) ?? 0,
        actual: g._sum.actualCount ?? 0,
        shortage: g._sum.shortage ?? 0,
        excess: g._sum.excess ?? 0,
      };
    });
    return {
      columns: [
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'planned', label: 'Planned (month)' },
        { key: 'actual', label: 'Actual (period sum)' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async byUnit(f: ReportFilters) {
    const [grouped, plans] = await Promise.all([
      prisma.manpowerActual.groupBy({ by: ['unitId'], where: actualWhere(f), _sum: { actualCount: true, shortage: true, excess: true } }),
      prisma.manpowerPlan.groupBy({ by: ['unitId'], where: planWhere(f), _sum: { plannedCount: true } }),
    ]);
    const planMap = new Map(plans.map((p) => [p.unitId, p._sum.plannedCount ?? 0]));
    const units = await prisma.unit.findMany();
    const map = new Map(units.map((u) => [u.id, u]));
    const rows = grouped.map((g) => ({
      unit: map.get(g.unitId)?.code ?? '',
      name: map.get(g.unitId)?.name ?? '',
      planned: planMap.get(g.unitId) ?? 0,
      actual: g._sum.actualCount ?? 0,
      shortage: g._sum.shortage ?? 0,
      excess: g._sum.excess ?? 0,
    }));
    return {
      columns: [
        { key: 'unit', label: 'Unit' },
        { key: 'name', label: 'Unit Name' },
        { key: 'planned', label: 'Planned (month)' },
        { key: 'actual', label: 'Actual (period sum)' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async dailyAttendance(f: ReportFilters) {
    const records = await prisma.manpowerActual.findMany({
      where: actualWhere(f),
      include: { unit: true, costCenter: true },
      orderBy: [{ date: 'desc' }, { unitId: 'asc' }],
      take: 5000,
    });
    const rows = records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      unit: r.unit.code,
      costCode: r.costCenter.costCode,
      costCentre: r.costCenter.costCentre,
      actual: r.actualCount,
      shortage: r.shortage,
      excess: r.excess,
      remarks: r.remarks ?? '',
    }));
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'actual', label: 'Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  /**
   * Shared day/night/gender summary: one row per cost center + grand total.
   * mode 'monthly' sums the period's actuals; mode 'daily' shows a single date
   * (dateFrom, defaulting to today) against that date's monthly plan.
   */
  async shiftSummary(f: ReportFilters, mode: 'daily' | 'monthly') {
    let aWhere = actualWhere(f);
    let pWhere = planWhere(f);
    let periodLabel = `${f.month}/${f.year}`;
    if (mode === 'daily') {
      const d = f.dateFrom ?? new Date();
      const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      aWhere = { ...aWhere, date };
      pWhere = { ...pWhere, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
      periodLabel = date.toISOString().slice(0, 10);
    }
    const [plans, actuals] = await Promise.all([
      prisma.manpowerPlan.findMany({ where: pWhere, include: { costCenter: { include: { unit: true } } } }),
      prisma.manpowerActual.groupBy({
        by: ['costCenterId'],
        where: aWhere,
        _sum: { actualCount: true, dayActual: true, nightActual: true, maleActual: true, femaleActual: true, shortage: true, excess: true },
      }),
    ]);
    const actualMap = new Map(actuals.map((a) => [a.costCenterId, a._sum]));
    // include cost centers that have actuals but no approved plan
    const planCcIds = new Set(plans.map((p) => p.costCenterId));
    const orphanIds = actuals.map((a) => a.costCenterId).filter((id) => !planCcIds.has(id));
    const orphanCcs = orphanIds.length
      ? await prisma.costCenter.findMany({ where: { id: { in: orphanIds } }, include: { unit: true } })
      : [];

    type Row = {
      unit: string; costCode: string; costCentre: string;
      dayPlan: number; nightPlan: number; planned: number;
      dayActual: number; nightActual: number; actual: number;
      male: number; female: number; shortage: number; excess: number;
    };
    const rows: Row[] = [];
    for (const p of plans) {
      const a = actualMap.get(p.costCenterId);
      rows.push({
        unit: p.costCenter.unit.code,
        costCode: p.costCenter.costCode,
        costCentre: p.costCenter.costCentre,
        dayPlan: p.dayPlan,
        nightPlan: p.nightPlan,
        planned: p.plannedCount,
        dayActual: a?.dayActual ?? 0,
        nightActual: a?.nightActual ?? 0,
        actual: a?.actualCount ?? 0,
        male: a?.maleActual ?? 0,
        female: a?.femaleActual ?? 0,
        shortage: a?.shortage ?? 0,
        excess: a?.excess ?? 0,
      });
    }
    for (const cc of orphanCcs) {
      const a = actualMap.get(cc.id)!;
      rows.push({
        unit: cc.unit.code, costCode: cc.costCode, costCentre: cc.costCentre,
        dayPlan: 0, nightPlan: 0, planned: 0,
        dayActual: a.dayActual ?? 0, nightActual: a.nightActual ?? 0, actual: a.actualCount ?? 0,
        male: a.maleActual ?? 0, female: a.femaleActual ?? 0,
        shortage: a.shortage ?? 0, excess: a.excess ?? 0,
      });
    }
    rows.sort((x, y) => x.unit.localeCompare(y.unit) || x.costCode.localeCompare(y.costCode));
    if (rows.length) {
      const total = rows.reduce(
        (t, r) => ({
          unit: 'TOTAL', costCode: '', costCentre: periodLabel,
          dayPlan: t.dayPlan + r.dayPlan, nightPlan: t.nightPlan + r.nightPlan, planned: t.planned + r.planned,
          dayActual: t.dayActual + r.dayActual, nightActual: t.nightActual + r.nightActual, actual: t.actual + r.actual,
          male: t.male + r.male, female: t.female + r.female,
          shortage: t.shortage + r.shortage, excess: t.excess + r.excess,
        }),
        { unit: 'TOTAL', costCode: '', costCentre: periodLabel, dayPlan: 0, nightPlan: 0, planned: 0, dayActual: 0, nightActual: 0, actual: 0, male: 0, female: 0, shortage: 0, excess: 0 },
      );
      rows.push(total);
    }
    return {
      columns: [
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'dayPlan', label: 'Day Plan' },
        { key: 'nightPlan', label: 'Night Plan' },
        { key: 'planned', label: 'Total Plan' },
        { key: 'dayActual', label: 'Day Actual' },
        { key: 'nightActual', label: 'Night Actual' },
        { key: 'actual', label: 'Total Actual' },
        { key: 'male', label: 'Male' },
        { key: 'female', label: 'Female' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async planVsActual(f: ReportFilters) {
    const plans = await prisma.manpowerPlan.findMany({
      where: planWhere(f),
      include: { costCenter: { include: { unit: true } } },
      orderBy: [{ unitId: 'asc' }],
    });
    const actuals = await prisma.manpowerActual.groupBy({
      by: ['costCenterId'],
      where: actualWhere(f),
      _sum: { actualCount: true },
      _count: { _all: true },
    });
    const actualMap = new Map(actuals.map((a) => [a.costCenterId, a]));
    const rows = plans.map((p) => {
      const a = actualMap.get(p.costCenterId);
      const days = a?._count._all ?? 0;
      const avgActual = days > 0 ? Math.round(((a?._sum.actualCount ?? 0) / days) * 10) / 10 : 0;
      return {
        unit: p.costCenter.unit.code,
        costCode: p.costCenter.costCode,
        costCentre: p.costCenter.costCentre,
        planned: p.plannedCount,
        avgActual,
        variance: Math.round((avgActual - p.plannedCount) * 10) / 10,
        fulfillment: p.plannedCount > 0 ? `${Math.round((avgActual / p.plannedCount) * 100)}%` : '—',
      };
    });
    return {
      columns: [
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'planned', label: 'Planned' },
        { key: 'avgActual', label: 'Avg Daily Actual' },
        { key: 'variance', label: 'Variance' },
        { key: 'fulfillment', label: 'Fulfillment' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async varianceReport(f: ReportFilters, kind: 'shortage' | 'excess') {
    const records = await prisma.manpowerActual.findMany({
      where: { ...actualWhere(f), [kind]: { gt: 0 } },
      include: { unit: true, costCenter: true },
      orderBy: { [kind]: 'desc' },
      take: 5000,
    });
    const rows = records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      unit: r.unit.code,
      costCode: r.costCenter.costCode,
      costCentre: r.costCenter.costCentre,
      actual: r.actualCount,
      [kind]: kind === 'shortage' ? r.shortage : r.excess,
    }));
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'actual', label: 'Actual' },
        { key: kind, label: kind === 'shortage' ? 'Shortage' : 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async consolidated(f: ReportFilters) {
    const plans = await prisma.manpowerPlan.findMany({ where: planWhere(f), select: { costCenterId: true, plannedCount: true } });
    const planMap = new Map(plans.map((p) => [p.costCenterId, p.plannedCount]));
    const records = await prisma.manpowerActual.findMany({
      where: actualWhere(f),
      include: { unit: true, costCenter: true },
      orderBy: [{ date: 'desc' }],
      take: 10000,
    });
    const rows = records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      unit: r.unit.code,
      costCode: r.costCenter.costCode,
      costCentre: r.costCenter.costCentre,
      planned: planMap.get(r.costCenterId) ?? 0,
      actual: r.actualCount,
      shortage: r.shortage,
      excess: r.excess,
      remarks: r.remarks ?? '',
    }));
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'planned', label: 'Planned' },
        { key: 'actual', label: 'Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  applySearch(rows: Record<string, unknown>[], search?: string) {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)));
  },
};
