import { Prisma, ManpowerType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError } from '../../utils/errors';

export type ReportType =
  | 'cost-center'
  | 'vendor'
  | 'unit'
  | 'department'
  | 'daily-attendance'
  | 'monthly-summary'
  | 'shortage'
  | 'excess'
  | 'shift-wise'
  | 'vendor-deployment'
  | 'consolidated';

export interface ReportFilters {
  year: number;
  month: number;
  dateFrom?: Date;
  dateTo?: Date;
  unitId?: string;
  costCenterId?: string;
  vendorId?: string;
  type?: ManpowerType;
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
    ...(f.vendorId ? { vendorId: f.vendorId } : {}),
    ...(f.type ? { type: f.type } : {}),
  };
}

const REPORT_TITLES: Record<ReportType, string> = {
  'cost-center': 'Cost Center Report',
  vendor: 'Vendor Report',
  unit: 'Unit Report',
  department: 'Department Report',
  'daily-attendance': 'Daily Attendance Report',
  'monthly-summary': 'Monthly Summary',
  shortage: 'Shortage Report',
  excess: 'Excess Report',
  'shift-wise': 'Shift-wise Report (by manpower type)',
  'vendor-deployment': 'Vendor Deployment Report',
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
      case 'vendor':
        return { type, title, ...(await this.byVendor(f)) };
      case 'unit':
        return { type, title, ...(await this.byUnit(f)) };
      case 'department':
        return { type, title, ...(await this.byDepartment(f)) };
      case 'daily-attendance':
        return { type, title, ...(await this.dailyAttendance(f)) };
      case 'monthly-summary':
        return { type, title, ...(await this.monthlySummary(f)) };
      case 'shortage':
        return { type, title, ...(await this.varianceReport(f, 'shortage')) };
      case 'excess':
        return { type, title, ...(await this.varianceReport(f, 'excess')) };
      case 'shift-wise':
        return { type, title, ...(await this.shiftWise(f)) };
      case 'vendor-deployment':
        return { type, title, ...(await this.vendorDeployment(f)) };
      case 'consolidated':
        return { type, title, ...(await this.consolidated(f)) };
      default:
        throw new BadRequestError(`Unknown report type: ${type}`);
    }
  },

  async byCostCenter(f: ReportFilters) {
    const grouped = await prisma.manpowerActual.groupBy({
      by: ['costCenterId'],
      where: actualWhere(f),
      _sum: { actualCount: true, shortage: true, excess: true },
    });
    const ccs = await prisma.costCenter.findMany({ where: { id: { in: grouped.map((g) => g.costCenterId) } }, include: { unit: true, department: true } });
    const map = new Map(ccs.map((c) => [c.id, c]));
    const rows = grouped.map((g) => {
      const cc = map.get(g.costCenterId);
      return {
        unit: cc?.unit.code ?? '',
        costCode: cc?.costCode ?? '',
        costCentre: cc?.costCentre ?? '',
        department: cc?.department?.name ?? '',
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
        { key: 'department', label: 'Department' },
        { key: 'actual', label: 'Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async byVendor(f: ReportFilters) {
    const grouped = await prisma.manpowerActual.groupBy({ by: ['vendorId'], where: actualWhere(f), _sum: { actualCount: true, shortage: true, excess: true } });
    const vendors = await prisma.vendor.findMany({ where: { id: { in: grouped.map((g) => g.vendorId) } } });
    const map = new Map(vendors.map((v) => [v.id, v]));
    const rows = grouped.map((g) => ({
      vendorCode: map.get(g.vendorId)?.vendorCode ?? '',
      vendorName: map.get(g.vendorId)?.vendorName ?? '',
      actual: g._sum.actualCount ?? 0,
      shortage: g._sum.shortage ?? 0,
      excess: g._sum.excess ?? 0,
    }));
    return {
      columns: [
        { key: 'vendorCode', label: 'Vendor Code' },
        { key: 'vendorName', label: 'Vendor Name' },
        { key: 'actual', label: 'Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async byUnit(f: ReportFilters) {
    const grouped = await prisma.manpowerActual.groupBy({ by: ['unitId'], where: actualWhere(f), _sum: { actualCount: true, shortage: true, excess: true } });
    const units = await prisma.unit.findMany();
    const map = new Map(units.map((u) => [u.id, u]));
    const rows = grouped.map((g) => ({
      unit: map.get(g.unitId)?.code ?? '',
      name: map.get(g.unitId)?.name ?? '',
      actual: g._sum.actualCount ?? 0,
      shortage: g._sum.shortage ?? 0,
      excess: g._sum.excess ?? 0,
    }));
    return {
      columns: [
        { key: 'unit', label: 'Unit' },
        { key: 'name', label: 'Unit Name' },
        { key: 'actual', label: 'Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async byDepartment(f: ReportFilters) {
    // Group actuals by cost center, then roll up to department.
    const grouped = await prisma.manpowerActual.groupBy({ by: ['costCenterId'], where: actualWhere(f), _sum: { actualCount: true, shortage: true, excess: true } });
    const ccs = await prisma.costCenter.findMany({ where: { id: { in: grouped.map((g) => g.costCenterId) } }, include: { department: true } });
    const ccMap = new Map(ccs.map((c) => [c.id, c]));
    const agg = new Map<string, { department: string; actual: number; shortage: number; excess: number }>();
    for (const g of grouped) {
      const dep = ccMap.get(g.costCenterId)?.department?.name ?? 'Unassigned';
      const cur = agg.get(dep) ?? { department: dep, actual: 0, shortage: 0, excess: 0 };
      cur.actual += g._sum.actualCount ?? 0;
      cur.shortage += g._sum.shortage ?? 0;
      cur.excess += g._sum.excess ?? 0;
      agg.set(dep, cur);
    }
    return {
      columns: [
        { key: 'department', label: 'Department' },
        { key: 'actual', label: 'Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows: this.applySearch([...agg.values()], f.search),
    };
  },

  async dailyAttendance(f: ReportFilters) {
    const records = await prisma.manpowerActual.findMany({
      where: actualWhere(f),
      include: { unit: true, costCenter: true, vendor: true },
      orderBy: [{ date: 'desc' }, { unitId: 'asc' }],
      take: 5000,
    });
    const rows = records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      unit: r.unit.code,
      costCentre: r.costCenter.costCentre,
      vendor: r.vendor.vendorName,
      type: r.type,
      actual: r.actualCount,
      shortage: r.shortage,
      excess: r.excess,
      remarks: r.remarks ?? '',
    }));
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'unit', label: 'Unit' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'type', label: 'Type' },
        { key: 'actual', label: 'Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
        { key: 'remarks', label: 'Remarks' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async monthlySummary(f: ReportFilters) {
    const plan = await prisma.manpowerPlan.aggregate({ where: { deletedAt: null, status: 'APPROVED', year: f.year, month: f.month }, _sum: { plannedCount: true } });
    const actual = await prisma.manpowerActual.aggregate({ where: actualWhere(f), _sum: { actualCount: true, shortage: true, excess: true } });
    const rows = [
      {
        period: `${f.month}/${f.year}`,
        planned: plan._sum.plannedCount ?? 0,
        actual: actual._sum.actualCount ?? 0,
        shortage: actual._sum.shortage ?? 0,
        excess: actual._sum.excess ?? 0,
      },
    ];
    return {
      columns: [
        { key: 'period', label: 'Period' },
        { key: 'planned', label: 'Planned' },
        { key: 'actual', label: 'Actual (period sum)' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows,
    };
  },

  async varianceReport(f: ReportFilters, kind: 'shortage' | 'excess') {
    const records = await prisma.manpowerActual.findMany({
      where: { ...actualWhere(f), [kind]: { gt: 0 } },
      include: { unit: true, costCenter: true, vendor: true },
      orderBy: { [kind]: 'desc' },
      take: 5000,
    });
    const rows = records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      unit: r.unit.code,
      costCentre: r.costCenter.costCentre,
      vendor: r.vendor.vendorName,
      type: r.type,
      actual: r.actualCount,
      [kind]: kind === 'shortage' ? r.shortage : r.excess,
    }));
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'unit', label: 'Unit' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'type', label: 'Type' },
        { key: 'actual', label: 'Actual' },
        { key: kind, label: kind === 'shortage' ? 'Shortage' : 'Excess' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async shiftWise(f: ReportFilters) {
    // No dedicated shift dimension; "type" (gender/skill class) is the practical shift equivalent.
    const grouped = await prisma.manpowerActual.groupBy({ by: ['type'], where: actualWhere(f), _sum: { actualCount: true, shortage: true, excess: true } });
    const rows = grouped.map((g) => ({ type: g.type, actual: g._sum.actualCount ?? 0, shortage: g._sum.shortage ?? 0, excess: g._sum.excess ?? 0 }));
    return {
      columns: [
        { key: 'type', label: 'Type / Shift Class' },
        { key: 'actual', label: 'Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
      ],
      rows,
    };
  },

  async vendorDeployment(f: ReportFilters) {
    const grouped = await prisma.manpowerActual.groupBy({ by: ['vendorId', 'unitId'], where: actualWhere(f), _sum: { actualCount: true } });
    const [vendors, units] = await Promise.all([prisma.vendor.findMany(), prisma.unit.findMany()]);
    const vMap = new Map(vendors.map((v) => [v.id, v.vendorName]));
    const uMap = new Map(units.map((u) => [u.id, u.code]));
    const rows = grouped.map((g) => ({ vendor: vMap.get(g.vendorId) ?? '', unit: uMap.get(g.unitId) ?? '', actual: g._sum.actualCount ?? 0 }));
    return {
      columns: [
        { key: 'vendor', label: 'Vendor' },
        { key: 'unit', label: 'Unit' },
        { key: 'actual', label: 'Deployed (Actual)' },
      ],
      rows: this.applySearch(rows, f.search),
    };
  },

  async consolidated(f: ReportFilters) {
    const records = await prisma.manpowerActual.findMany({
      where: actualWhere(f),
      include: { unit: true, costCenter: { include: { department: true } }, vendor: true },
      orderBy: [{ date: 'desc' }],
      take: 10000,
    });
    const rows = records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      unit: r.unit.code,
      department: r.costCenter.department?.name ?? '',
      costCentre: r.costCenter.costCentre,
      vendor: r.vendor.vendorName,
      type: r.type,
      actual: r.actualCount,
      shortage: r.shortage,
      excess: r.excess,
    }));
    return {
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'unit', label: 'Unit' },
        { key: 'department', label: 'Department' },
        { key: 'costCentre', label: 'Cost Centre' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'type', label: 'Type' },
        { key: 'actual', label: 'Actual' },
        { key: 'shortage', label: 'Shortage' },
        { key: 'excess', label: 'Excess' },
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
