import { Prisma, ManpowerType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/apiResponse';

const include = {
  unit: true,
  costCenter: { include: { unit: true, department: true } },
  vendor: true,
  createdBy: { select: { id: true, name: true } },
};

/**
 * Finds the planned count for the relevant APPROVED monthly plan and returns
 * the variance breakdown:
 *   shortage = max(planned - actual, 0)
 *   excess   = max(actual - planned, 0)
 */
export async function computeVariance(
  date: Date,
  unitId: string,
  costCenterId: string,
  vendorId: string,
  type: ManpowerType,
  actualCount: number,
) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const plan = await prisma.manpowerPlan.findFirst({
    where: { year, month, unitId, costCenterId, vendorId, genderOrType: type, status: 'APPROVED', deletedAt: null },
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
      ...(filters.vendorId ? { vendorId: String(filters.vendorId) } : {}),
      ...(filters.type ? { type: filters.type as ManpowerType } : {}),
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

  async upsert(input: {
    date: Date;
    unitId: string;
    costCenterId: string;
    vendorId: string;
    type: ManpowerType;
    actualCount: number;
    remarks?: string | null;
    createdById: string;
  }) {
    const variance = await computeVariance(input.date, input.unitId, input.costCenterId, input.vendorId, input.type, input.actualCount);
    const date = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate()));
    return prisma.manpowerActual.upsert({
      where: {
        actual_unique_key: { date, unitId: input.unitId, costCenterId: input.costCenterId, vendorId: input.vendorId, type: input.type },
      },
      update: { actualCount: input.actualCount, shortage: variance.shortage, excess: variance.excess, remarks: input.remarks },
      create: {
        date,
        unitId: input.unitId,
        costCenterId: input.costCenterId,
        vendorId: input.vendorId,
        type: input.type,
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
      const v = await computeVariance(existing.date, existing.unitId, existing.costCenterId, existing.vendorId, existing.type, data.actualCount);
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

  async bulkUpsert(rows: any[], createdById: string) {
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
};
