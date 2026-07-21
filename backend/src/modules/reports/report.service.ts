import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError } from '../../utils/errors';
import { monthlyPlanTotals, dailyPlanOnDate, approvedRevisionsByCostCenter, qtyOnDay, PlanQty } from '../plans/planTimeline';
import { fmtDate } from '../../utils/dateFormat';

export type ReportType =
  | 'cost-center'
  | 'unit'
  | 'daily-attendance'
  | 'daily-summary'
  | 'monthly-summary'
  | 'plan-vs-actual'
  | 'shortage'
  | 'excess'
  | 'consolidated'
  | 'vendor-daily'
  | 'vendor-monthly'
  | 'vendor-consolidated'
  | 'missing-entries';

/** Attendance % of actual vs plan, one decimal; '—' when there is no plan. */
function attendancePct(actual: number, planned: number) {
  return planned > 0 ? `${Math.round((actual / planned) * 1000) / 10}%` : '—';
}

export interface ReportFilters {
  year: number;
  month: number;
  dateFrom?: Date;
  dateTo?: Date;
  unitId?: string;
  costCenterId?: string;
  search?: string;
  scopedCostCenterIds?: string[] | null;
  shift?: 'DAY' | 'NIGHT';
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

/**
 * Plan totals honouring a single-date filter (dateFrom === dateTo): uses the
 * Calendar-Master-aware plan for that exact date, not the whole month's sum.
 * Falls back to the month total otherwise.
 */
async function planTotalsForFilters(f: ReportFilters) {
  if (f.dateFrom && f.dateTo && f.dateFrom.getTime() === f.dateTo.getTime()) {
    const daily = await dailyPlanOnDate(f.dateFrom, f);
    const map = new Map<string, { unitId: string; monthly: PlanQty }>();
    for (const [cc, v] of daily) map.set(cc, { unitId: v.unitId, monthly: v.qty });
    return map;
  }
  return monthlyPlanTotals(f.year, f.month, f);
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
  'vendor-daily': 'Vendor Summary (Daily)',
  'vendor-monthly': 'Vendor Summary (Monthly)',
  'vendor-consolidated': 'Vendor Summary (Consolidated)',
  'missing-entries': 'Missing Daily Actual Entries',
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
      case 'vendor-daily':
        return { type, title, ...(await this.vendorSummary(f, 'daily')) };
      case 'vendor-monthly':
        return { type, title, ...(await this.vendorSummary(f, 'monthly')) };
      case 'vendor-consolidated':
        return { type, title, ...(await this.vendorSummary(f, 'consolidated')) };
      case 'missing-entries':
        return { type, title, ...(await this.missingEntries(f)) };
      default:
        throw new BadRequestError(`Unknown report type: ${type}`);
    }
  },

  async byCostCenter(f: ReportFilters) {
    const [grouped, planTotals] = await Promise.all([
      prisma.manpowerActual.groupBy({
        by: ['costCenterId'],
        where: actualWhere(f),
        _sum: { actualCount: true, shortage: true, excess: true },
      }),
      planTotalsForFilters(f),
    ]);
    // Include cost centers that have a plan but no entries at all — they show
    // actual 0 with the full plan as shortage instead of disappearing.
    const groupedIds = new Set(grouped.map((g) => g.costCenterId));
    const planOnlyIds = [...planTotals.entries()].filter(([id, v]) => !groupedIds.has(id) && v.monthly.plannedCount > 0).map(([id]) => id);
    const allIds = [...groupedIds, ...planOnlyIds];
    const ccs = await prisma.costCenter.findMany({ where: { id: { in: allIds } }, include: { unit: true } });
    const map = new Map(ccs.map((c) => [c.id, c]));
    const rows = [
      ...grouped.map((g) => {
        const cc = map.get(g.costCenterId);
        const actual = g._sum.actualCount ?? 0;
        const shortage = g._sum.shortage ?? 0;
        const excess = g._sum.excess ?? 0;
        const planned = planTotals.get(g.costCenterId)?.monthly.plannedCount ?? 0;
        return {
          unit: cc?.unit.code ?? '',
          costCode: cc?.costCode ?? '',
          costCentre: cc?.costCentre ?? '',
          department: cc?.department ?? '',
          planned,
          actual,
          shortage,
          excess,
        };
      }),
      ...planOnlyIds.map((id) => {
        const cc = map.get(id);
        const planned = planTotals.get(id)!.monthly.plannedCount;
        return {
          unit: cc?.unit.code ?? '',
          costCode: cc?.costCode ?? '',
          costCentre: cc?.costCentre ?? '',
          department: cc?.department ?? '',
          planned,
          actual: 0,
          shortage: planned,
          excess: 0,
        };
      }),
    ].sort((a, b) => a.unit.localeCompare(b.unit) || a.costCode.localeCompare(b.costCode));
    return {
      columns: [
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'department', label: 'Department' },
        { key: 'planned', label: 'Monthly Plan' },
        { key: 'actual', label: 'Total Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async byUnit(f: ReportFilters) {
    const [grouped, planTotals] = await Promise.all([
      prisma.manpowerActual.groupBy({ by: ['unitId'], where: actualWhere(f), _sum: { actualCount: true, shortage: true, excess: true } }),
      planTotalsForFilters(f),
    ]);
    const planMap = new Map<string, number>();
    for (const v of planTotals.values()) planMap.set(v.unitId, (planMap.get(v.unitId) ?? 0) + v.monthly.plannedCount);
    const units = await prisma.unit.findMany();
    const map = new Map(units.map((u) => [u.id, u]));
    const rows = grouped.map((g) => {
      const actual = g._sum.actualCount ?? 0;
      const shortage = g._sum.shortage ?? 0;
      const excess = g._sum.excess ?? 0;
      const planned = planMap.get(g.unitId) ?? 0;
      return {
        unit: map.get(g.unitId)?.code ?? '',
        name: map.get(g.unitId)?.name ?? '',
        planned,
        actual,
        shortage,
        excess,
      };
    });
    return {
      columns: [
        { key: 'unit', label: 'Unit' },
        { key: 'name', label: 'Unit Name' },
        { key: 'planned', label: 'Monthly Plan' },
        { key: 'actual', label: 'Total Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async dailyAttendance(f: ReportFilters) {
    const [records, plans] = await Promise.all([
      prisma.manpowerActual.findMany({
        where: actualWhere(f),
        include: { unit: true, costCenter: true },
        orderBy: [{ date: 'desc' }, { unitId: 'asc' }],
        take: 5000,
      }),
      approvedRevisionsByCostCenter(f.year, f.month, f),
    ]);
    const rows = records.map((r) => {
      // plan in force on the row's own date (effective-dated revisions)
      const revs = plans.get(r.costCenterId)?.revs;
      const dailyPlan = revs ? qtyOnDay(revs, r.date.getUTCFullYear(), r.date.getUTCMonth() + 1, r.date.getUTCDate()).plannedCount : 0;
      return {
        date: fmtDate(r.date),
        unit: r.unit.code,
        costCode: r.costCenter.costCode,
        costCentre: r.costCenter.costCentre,
        department: r.costCenter.department ?? '',
        dailyPlan,
        actual: r.actualCount,
        attendance: attendancePct(r.actualCount, dailyPlan),
        shortage: r.shortage,
        excess: r.excess,
        remarks: r.remarks ?? '',
      };
    });
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'department', label: 'Department' },
        { key: 'dailyPlan', label: 'Daily Plan' },
        { key: 'actual', label: 'Daily Actual' },
        { key: 'attendance', label: 'Attendance %' },
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
    let periodLabel = `${String(f.month).padStart(2, '0')}/${f.year}`;
    // Plan quantities per cost center — revision-aware and Calendar-Master-aware:
    // daily mode = plan in force on the date; monthly mode = Σ over working days.
    let planQty: Map<string, { plannedCount: number; dayPlan: number; nightPlan: number }>;
    if (mode === 'daily') {
      const d = f.dateFrom ?? new Date();
      const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      aWhere = { ...aWhere, date };
      pWhere = { ...pWhere, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
      periodLabel = fmtDate(date);
      const daily = await dailyPlanOnDate(date, f);
      planQty = new Map([...daily.entries()].map(([cc, v]) => [cc, v.qty]));
    } else {
      const totals = await monthlyPlanTotals(f.year, f.month, f);
      planQty = new Map([...totals.entries()].map(([cc, v]) => [cc, v.monthly]));
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
      unit: string; costCode: string; costCentre: string; department: string;
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
        department: p.costCenter.department ?? '',
        dayPlan: planQty.get(p.costCenterId)?.dayPlan ?? 0,
        nightPlan: planQty.get(p.costCenterId)?.nightPlan ?? 0,
        planned: planQty.get(p.costCenterId)?.plannedCount ?? 0,
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
        unit: cc.unit.code, costCode: cc.costCode, costCentre: cc.costCentre, department: cc.department ?? '',
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
          unit: 'TOTAL', costCode: '', costCentre: periodLabel, department: '',
          dayPlan: t.dayPlan + r.dayPlan, nightPlan: t.nightPlan + r.nightPlan, planned: t.planned + r.planned,
          dayActual: t.dayActual + r.dayActual, nightActual: t.nightActual + r.nightActual, actual: t.actual + r.actual,
          male: t.male + r.male, female: t.female + r.female,
          shortage: t.shortage + r.shortage, excess: t.excess + r.excess,
        }),
        { unit: 'TOTAL', costCode: '', costCentre: periodLabel, department: '', dayPlan: 0, nightPlan: 0, planned: 0, dayActual: 0, nightActual: 0, actual: 0, male: 0, female: 0, shortage: 0, excess: 0 },
      );
      rows.push(total);
    }
    const outRows = rows.map((r) => ({
      ...r,
      attendance: attendancePct(r.actual, r.planned),
    }));
    return {
      columns: [
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'department', label: 'Department' },
        { key: 'dayPlan', label: 'Day Plan' },
        { key: 'nightPlan', label: 'Night Plan' },
        { key: 'planned', label: mode === 'monthly' ? 'Monthly Plan' : 'Total Plan' },
        { key: 'dayActual', label: 'Day Actual' },
        { key: 'nightActual', label: 'Night Actual' },
        { key: 'actual', label: 'Total Actual' },
        { key: 'male', label: 'Male' },
        { key: 'female', label: 'Female' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
        { key: 'attendance', label: 'Attendance %' },
      ],
      rows: this.applySearch(outRows, f.search),
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
        department: p.costCenter.department ?? '',
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
        { key: 'department', label: 'Department' },
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
      date: fmtDate(r.date),
      unit: r.unit.code,
      costCode: r.costCenter.costCode,
      costCentre: r.costCenter.costCentre,
      department: r.costCenter.department ?? '',
      actual: r.actualCount,
      [kind]: kind === 'shortage' ? r.shortage : r.excess,
    }));
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'department', label: 'Department' },
        { key: 'actual', label: 'Actual' },
        { key: kind, label: kind === 'shortage' ? 'Shortage' : 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async consolidated(f: ReportFilters) {
    const revMap = await approvedRevisionsByCostCenter(f.year, f.month, f);
    const records = await prisma.manpowerActual.findMany({
      where: actualWhere(f),
      include: { unit: true, costCenter: true },
      orderBy: [{ date: 'desc' }],
      take: 10000,
    });
    const rows = records.map((r) => ({
      date: fmtDate(r.date),
      unit: r.unit.code,
      costCode: r.costCenter.costCode,
      costCentre: r.costCenter.costCentre,
      department: r.costCenter.department ?? '',
      planned: (() => {
        const revs = revMap.get(r.costCenterId)?.revs;
        return revs ? qtyOnDay(revs, r.date.getUTCFullYear(), r.date.getUTCMonth() + 1, r.date.getUTCDate()).plannedCount : 0;
      })(),
      actual: r.actualCount,
      male: r.maleActual,
      female: r.femaleActual,
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
        { key: 'department', label: 'Department' },
        { key: 'planned', label: 'Daily Plan' },
        { key: 'actual', label: 'Actual' },
        { key: 'male', label: 'Male Count' },
        { key: 'female', label: 'Female Count' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  /**
   * Vendor-wise male/female summary.
   *  - daily: a single date (dateFrom, default today)
   *  - monthly: aggregated over the selected month
   *  - consolidated: one row per date + cost center + vendor for the period
   */
  async vendorSummary(f: ReportFilters, mode: 'daily' | 'monthly' | 'consolidated') {
    let aWhere = actualWhere(f);
    if (mode === 'daily') {
      const d = f.dateFrom ?? new Date();
      const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      aWhere = { ...aWhere, date };
    }
    const allocations = await prisma.actualVendorAllocation.findMany({
      where: { actual: aWhere },
      include: {
        vendor: { select: { vendorName: true } },
        actual: { select: { date: true, costCenter: { include: { unit: true } } } },
      },
      take: 20000,
    });
    type Agg = { date: string; unit: string; costCode: string; costCentre: string; department: string; vendor: string; male: number; female: number };
    const byKey = new Map<string, Agg>();
    for (const a of allocations) {
      const cc = a.actual.costCenter;
      const dateKey = mode === 'consolidated' ? a.actual.date.toISOString().slice(0, 10) : '';
      const key = `${dateKey}|${cc.id}|${a.vendorId}`;
      const cur = byKey.get(key) ?? {
        date: dateKey ? fmtDate(a.actual.date) : '',
        unit: cc.unit.code,
        costCode: cc.costCode,
        costCentre: cc.costCentre,
        department: cc.department ?? '',
        vendor: a.vendor.vendorName,
        male: 0,
        female: 0,
      };
      cur.male += a.male;
      cur.female += a.female;
      byKey.set(key, cur);
    }
    const rows = Array.from(byKey.values())
      .sort((x, y) => x.unit.localeCompare(y.unit) || x.costCode.localeCompare(y.costCode) || x.vendor.localeCompare(y.vendor))
      .map((r) => ({ ...r, total: r.male + r.female }));
    if (rows.length) {
      const total = rows.reduce(
        (t, r) => ({ ...t, male: t.male + r.male, female: t.female + r.female, total: t.total + r.total }),
        { date: '', unit: 'TOTAL', costCode: '', costCentre: '', department: '', vendor: '', male: 0, female: 0, total: 0 },
      );
      rows.push(total);
    }
    const columns = [
      ...(mode === 'consolidated' ? [{ key: 'date', label: 'Date' }] : []),
      { key: 'unit', label: 'Unit' },
      { key: 'costCode', label: 'Cost Code' },
      { key: 'costCentre', label: 'Cost Centre' },
      { key: 'department', label: 'Department' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'male', label: 'Male Count' },
      { key: 'female', label: 'Female Count' },
      { key: 'total', label: 'Total Count' },
    ];
    return { columns, rows: this.applySearch(rows, f.search) };
  },

  /**
   * Cost centers whose daily actual has NOT been entered yet, for every date
   * in the selected range (dateFrom..dateTo, default today) — one row per
   * missing shift per date. A shift counts as missing when it has a plan (> 0)
   * in force that day but the entry has no saved vendors for it. Calendar-
   * aware: no plan on a weekly-off/holiday means nothing is expected (unless
   * the cost center is excluded from the calendar). Future dates are skipped.
   */
  async missingEntries(f: ReportFilters) {
    const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const today = utcDay(new Date());
    const from = utcDay(f.dateFrom ?? new Date());
    let to = utcDay(f.dateTo ?? f.dateFrom ?? new Date());
    if (to.getTime() > today.getTime()) to = today; // nothing can be "missing" in the future
    // hard cap: 92 days per request
    const maxTo = new Date(from.getTime() + 91 * 86400000);
    if (to.getTime() > maxTo.getTime()) to = maxTo;

    const actuals = from.getTime() <= to.getTime()
      ? await prisma.manpowerActual.findMany({
          where: { date: { gte: from, lte: to }, deletedAt: null },
          select: { costCenterId: true, date: true, vendorAllocations: { select: { shift: true } } },
        })
      : [];
    const savedByKey = new Map<string, Set<string>>();
    for (const a of actuals) {
      const key = `${a.costCenterId}|${a.date.toISOString().slice(0, 10)}`;
      const set = savedByKey.get(key) ?? new Set<string>();
      for (const v of a.vendorAllocations) set.add(v.shift);
      savedByKey.set(key, set);
    }

    type Row = { unit: string; costCode: string; costCentre: string; department: string; date: string; shift: string; planned: number; actual: string; _sort: string };
    const rows: Row[] = [];
    const ccMap = new Map<string, { unit: { code: string }; costCode: string; costCentre: string; department: string | null }>();
    for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
      const date = new Date(t);
      // plan differs per date (working days + revisions), so compute per date
      const planMap = await dailyPlanOnDate(date, f);
      const newIds = [...planMap.keys()].filter((id) => !ccMap.has(id));
      if (newIds.length) {
        const ccs = await prisma.costCenter.findMany({ where: { id: { in: newIds } }, include: { unit: true } });
        for (const c of ccs) ccMap.set(c.id, c);
      }
      for (const [ccId, v] of planMap) {
        const cc = ccMap.get(ccId);
        if (!cc) continue;
        const savedShifts = savedByKey.get(`${ccId}|${date.toISOString().slice(0, 10)}`) ?? new Set<string>();
        const checkShift = (shift: 'DAY' | 'NIGHT', planned: number) => {
          if (planned <= 0) return; // nothing expected for this shift that day
          if (savedShifts.has(shift)) return; // already entered
          rows.push({
            unit: cc.unit.code,
            costCode: cc.costCode,
            costCentre: cc.costCentre,
            department: cc.department ?? '',
            date: fmtDate(date),
            shift: shift === 'DAY' ? 'Day' : 'Night',
            planned,
            actual: 'Not Entered',
            _sort: date.toISOString().slice(0, 10),
          });
        };
        if (!f.shift || f.shift === 'DAY') checkShift('DAY', v.qty.dayPlan);
        if (!f.shift || f.shift === 'NIGHT') checkShift('NIGHT', v.qty.nightPlan);
      }
    }
    rows.sort((a, b) => a.unit.localeCompare(b.unit) || a.costCode.localeCompare(b.costCode) || a._sort.localeCompare(b._sort) || a.shift.localeCompare(b.shift));
    rows.forEach((r) => delete (r as Partial<Row>)._sort);
    return {
      columns: [
        { key: 'unit', label: 'Unit' },
        { key: 'costCode', label: 'Cost Code' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'department', label: 'Department' },
        { key: 'date', label: 'Date' },
        { key: 'shift', label: 'Shift' },
        { key: 'planned', label: 'Plan' },
        { key: 'actual', label: 'Actual' },
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
