import { Prisma, Shift } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/apiResponse';

const include = {
  unit: true,
  costCenter: { include: { unit: true } },
  createdBy: { select: { id: true, name: true } },
  vendorAllocations: { include: { vendor: { select: { id: true, vendorName: true } } } },
};

export interface VendorAllocationInput {
  vendorId: string;
  count: number;
}

/**
 * Finds the planned count for the cost center's APPROVED monthly plan and
 * returns the variance breakdown:
 *   shortage = max(planned - actual, 0)
 *   excess   = max(actual - planned, 0)
 */
export async function computeVariance(date: Date, costCenterId: string, actualCount: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const plan = await prisma.manpowerPlan.findFirst({
    where: { year, month, costCenterId, status: 'APPROVED', deletedAt: null },
    select: { plannedCount: true },
  });
  const planned = plan?.plannedCount ?? 0;
  return {
    planned,
    shortage: Math.max(planned - actualCount, 0),
    excess: Math.max(actualCount - planned, 0),
  };
}

function sumAllocations(rows: VendorAllocationInput[] | undefined) {
  if (!rows || rows.length === 0) return null;
  return rows.reduce((sum, r) => sum + r.count, 0);
}

interface ListArgs {
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  filters: Record<string, unknown>;
  scopedCostCenterIds: string[] | null;
}

export const actualService = {
  async list(args: ListArgs) {
    const { page, pageSize, sortBy, sortDir, filters, scopedCostCenterIds } = args;
    const where: Prisma.ManpowerActualWhereInput = {
      deletedAt: null,
      ...(scopedCostCenterIds ? { costCenterId: { in: scopedCostCenterIds } } : {}),
      ...(filters.unitId ? { unitId: String(filters.unitId) } : {}),
      ...(filters.costCenterId ? { costCenterId: String(filters.costCenterId) } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            date: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom as Date) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo as Date) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.manpowerActual.findMany({ where, include, skip: (page - 1) * pageSize, take: pageSize, orderBy: { [sortBy]: sortDir } }),
      prisma.manpowerActual.count({ where }),
    ]);
    return { rows, meta: buildPaginationMeta(page, pageSize, total) };
  },

  /**
   * Grid view for a date: one row per cost center (scoped for USER_MASTER),
   * with the approved plan (day/night split) and any existing entry merged in.
   */
  async grid(date: Date, scopedCostCenterIds: string[] | null, unitId?: string) {
    const costCenters = await prisma.costCenter.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(scopedCostCenterIds ? { id: { in: scopedCostCenterIds } } : {}),
        ...(unitId ? { unitId } : {}),
      },
      include: { unit: true },
      orderBy: [{ unit: { code: 'asc' } }, { costCode: 'asc' }],
    });
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const [plans, actuals] = await Promise.all([
      prisma.manpowerPlan.findMany({
        where: { year, month, status: 'APPROVED', deletedAt: null },
        select: { costCenterId: true, plannedCount: true, dayPlan: true, nightPlan: true, malePlan: true, femalePlan: true },
      }),
      prisma.manpowerActual.findMany({
        where: { date, deletedAt: null },
        include: { vendorAllocations: { include: { vendor: { select: { id: true, vendorName: true } } } } },
      }),
    ]);
    const planMap = new Map(plans.map((p) => [p.costCenterId, p]));
    const actualMap = new Map(actuals.map((a) => [a.costCenterId, a]));
    return costCenters.map((cc) => {
      const plan = planMap.get(cc.id);
      const actual = actualMap.get(cc.id);
      const allocationsFor = (shift: Shift) =>
        (actual?.vendorAllocations ?? [])
          .filter((v) => v.shift === shift)
          .map((v) => ({ vendorId: v.vendorId, vendorName: v.vendor.vendorName, count: v.count }));
      return {
        costCenterId: cc.id,
        unit: cc.unit.code,
        unitId: cc.unitId,
        costCode: cc.costCode,
        costCentre: cc.costCentre,
        department: cc.department ?? null,
        planned: plan?.plannedCount ?? 0,
        dayPlan: plan?.dayPlan ?? 0,
        nightPlan: plan?.nightPlan ?? 0,
        malePlan: plan?.malePlan ?? 0,
        femalePlan: plan?.femalePlan ?? 0,
        actualId: actual?.id ?? null,
        actualCount: actual?.actualCount ?? null,
        dayActual: actual?.dayActual ?? null,
        nightActual: actual?.nightActual ?? null,
        maleActual: actual?.maleActual ?? null,
        femaleActual: actual?.femaleActual ?? null,
        shortage: actual?.shortage ?? null,
        excess: actual?.excess ?? null,
        remarks: actual?.remarks ?? null,
        dayVendors: allocationsFor('DAY'),
        nightVendors: allocationsFor('NIGHT'),
      };
    });
  },

  /**
   * Upsert one day+cost-center entry.
   * If vendor allocations are given for a shift, that shift's actual is the sum
   * of the allocation counts (the numbers must reconcile by construction).
   */
  async upsert(input: {
    date: Date;
    costCenterId: string;
    dayActual?: number;
    nightActual?: number;
    maleActual?: number;
    femaleActual?: number;
    remarks?: string | null;
    dayVendors?: VendorAllocationInput[];
    nightVendors?: VendorAllocationInput[];
    createdById: string;
  }) {
    const cc = await prisma.costCenter.findFirst({ where: { id: input.costCenterId, deletedAt: null } });
    if (!cc) throw new BadRequestError('Unknown cost center');
    const date = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate()));

    const dayActual = sumAllocations(input.dayVendors) ?? input.dayActual ?? 0;
    const nightActual = sumAllocations(input.nightVendors) ?? input.nightActual ?? 0;
    const actualCount = dayActual + nightActual;
    const variance = await computeVariance(date, input.costCenterId, actualCount);

    const values = {
      actualCount,
      dayActual,
      nightActual,
      maleActual: input.maleActual ?? 0,
      femaleActual: input.femaleActual ?? 0,
      shortage: variance.shortage,
      excess: variance.excess,
      remarks: input.remarks,
    };

    const actual = await prisma.manpowerActual.upsert({
      where: { actual_unique_key: { date, costCenterId: input.costCenterId } },
      update: { ...values, deletedAt: null },
      create: {
        date,
        unitId: cc.unitId,
        costCenterId: input.costCenterId,
        ...values,
        createdById: input.createdById,
      },
    });

    // Replace vendor allocations when the caller provided them (undefined = leave as-is)
    if (input.dayVendors !== undefined || input.nightVendors !== undefined) {
      const shifts: Shift[] = [];
      if (input.dayVendors !== undefined) shifts.push('DAY');
      if (input.nightVendors !== undefined) shifts.push('NIGHT');
      await prisma.actualVendorAllocation.deleteMany({ where: { actualId: actual.id, shift: { in: shifts } } });
      const rows = [
        ...(input.dayVendors ?? []).map((v) => ({ actualId: actual.id, shift: 'DAY' as Shift, vendorId: v.vendorId, count: v.count })),
        ...(input.nightVendors ?? []).map((v) => ({ actualId: actual.id, shift: 'NIGHT' as Shift, vendorId: v.vendorId, count: v.count })),
      ].filter((r) => r.count > 0);
      if (rows.length) await prisma.actualVendorAllocation.createMany({ data: rows });
    }

    return prisma.manpowerActual.findUniqueOrThrow({ where: { id: actual.id }, include });
  },

  async update(id: string, data: { remarks?: string | null }) {
    const existing = await prisma.manpowerActual.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Actual entry not found');
    return prisma.manpowerActual.update({ where: { id }, data, include });
  },

  async remove(id: string) {
    const existing = await prisma.manpowerActual.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Actual entry not found');
    await prisma.manpowerActual.update({ where: { id }, data: { deletedAt: new Date() } });
    return existing;
  },

  async bulkUpsert(
    rows: {
      date: string | Date;
      costCenterId: string;
      dayActual?: number;
      nightActual?: number;
      maleActual?: number;
      femaleActual?: number;
      remarks?: string | null;
      dayVendors?: VendorAllocationInput[];
      nightVendors?: VendorAllocationInput[];
    }[],
    createdById: string,
  ) {
    const results = { saved: 0, errors: [] as { row: number; message: string }[] };
    for (let i = 0; i < rows.length; i++) {
      try {
        await this.upsert({ ...rows[i], date: new Date(rows[i].date), createdById });
        results.saved++;
      } catch (e) {
        results.errors.push({ row: i + 1, message: (e as Error).message });
      }
    }
    return results;
  },

  /** Recompute stored variance for a month after its plan is (re-)approved. */
  async recomputeMonth(year: number, month: number) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    const actuals = await prisma.manpowerActual.findMany({ where: { date: { gte: from, lte: to }, deletedAt: null } });
    for (const a of actuals) {
      const v = await computeVariance(a.date, a.costCenterId, a.actualCount);
      if (v.shortage !== a.shortage || v.excess !== a.excess) {
        await prisma.manpowerActual.update({ where: { id: a.id }, data: { shortage: v.shortage, excess: v.excess } });
      }
    }
    return { checked: actuals.length };
  },
};
