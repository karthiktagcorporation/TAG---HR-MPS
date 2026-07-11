import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/apiResponse';

const include = {
  unit: true,
  costCenter: { include: { unit: true } },
  createdBy: { select: { id: true, name: true } },
};

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
   * with the approved plan and any existing entry merged in.
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
      prisma.manpowerPlan.findMany({ where: { year, month, status: 'APPROVED', deletedAt: null }, select: { costCenterId: true, plannedCount: true } }),
      prisma.manpowerActual.findMany({ where: { date, deletedAt: null } }),
    ]);
    const planMap = new Map(plans.map((p) => [p.costCenterId, p.plannedCount]));
    const actualMap = new Map(actuals.map((a) => [a.costCenterId, a]));
    return costCenters.map((cc) => {
      const actual = actualMap.get(cc.id);
      return {
        costCenterId: cc.id,
        unit: cc.unit.code,
        unitId: cc.unitId,
        costCode: cc.costCode,
        costCentre: cc.costCentre,
        planned: planMap.get(cc.id) ?? 0,
        actualId: actual?.id ?? null,
        actualCount: actual?.actualCount ?? null,
        shortage: actual?.shortage ?? null,
        excess: actual?.excess ?? null,
        remarks: actual?.remarks ?? null,
      };
    });
  },

  async upsert(input: { date: Date; costCenterId: string; actualCount: number; remarks?: string | null; createdById: string }) {
    const cc = await prisma.costCenter.findFirst({ where: { id: input.costCenterId, deletedAt: null } });
    if (!cc) throw new BadRequestError('Unknown cost center');
    const date = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate()));
    const variance = await computeVariance(date, input.costCenterId, input.actualCount);
    return prisma.manpowerActual.upsert({
      where: { actual_unique_key: { date, costCenterId: input.costCenterId } },
      update: { actualCount: input.actualCount, shortage: variance.shortage, excess: variance.excess, remarks: input.remarks, deletedAt: null },
      create: {
        date,
        unitId: cc.unitId,
        costCenterId: input.costCenterId,
        actualCount: input.actualCount,
        shortage: variance.shortage,
        excess: variance.excess,
        remarks: input.remarks,
        createdById: input.createdById,
      },
      include,
    });
  },

  async update(id: string, data: { actualCount?: number; remarks?: string | null }) {
    const existing = await prisma.manpowerActual.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Actual entry not found');
    let shortage = existing.shortage;
    let excess = existing.excess;
    if (data.actualCount !== undefined) {
      const v = await computeVariance(existing.date, existing.costCenterId, data.actualCount);
      shortage = v.shortage;
      excess = v.excess;
    }
    return prisma.manpowerActual.update({
      where: { id },
      data: { ...data, shortage, excess },
      include,
    });
  },

  async remove(id: string) {
    const existing = await prisma.manpowerActual.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Actual entry not found');
    await prisma.manpowerActual.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async bulkUpsert(rows: { date: string | Date; costCenterId: string; actualCount: number; remarks?: string | null }[], createdById: string) {
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
