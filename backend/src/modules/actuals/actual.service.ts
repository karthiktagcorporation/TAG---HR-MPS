import { Prisma, Shift } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { dailyPlanOnDate, planForCostCenterOnDate } from '../plans/planTimeline';

const include = {
  unit: true,
  costCenter: { include: { unit: true } },
  createdBy: { select: { id: true, name: true } },
  vendorAllocations: { include: { vendor: { select: { id: true, vendorName: true } } } },
};

export interface VendorAllocationInput {
  vendorId: string;
  male: number;
  female: number;
}

/**
 * Variance against the plan IN FORCE ON THAT DATE (effective-dated revisions —
 * a mid-month plan change does not rewrite earlier days):
 *   shortage = max(planned - actual, 0)
 *   excess   = max(actual - planned, 0)
 */
export async function computeVariance(date: Date, costCenterId: string, actualCount: number) {
  const { plannedCount: planned } = await planForCostCenterOnDate(costCenterId, date);
  return {
    planned,
    shortage: Math.max(planned - actualCount, 0),
    excess: Math.max(actualCount - planned, 0),
  };
}

function cleanVendors(rows: VendorAllocationInput[] | undefined) {
  // Zero counts are allowed: selecting a vendor with 0/0 records zero attendance
  return (rows ?? []).filter((r) => r.vendorId);
}

function sumShift(rows: VendorAllocationInput[]) {
  return rows.reduce(
    (acc, r) => ({ male: acc.male + r.male, female: acc.female + r.female }),
    { male: 0, female: 0 },
  );
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
    // 'unit' sorts by unit code (for the All Dates view), then date
    const orderBy: Prisma.ManpowerActualOrderByWithRelationInput[] =
      sortBy === 'unit' ? [{ unit: { code: sortDir } }, { date: 'desc' }] : [{ [sortBy]: sortDir }];
    const [rows, total] = await Promise.all([
      prisma.manpowerActual.findMany({ where, include, skip: (page - 1) * pageSize, take: pageSize, orderBy }),
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
    const [planMap, actuals] = await Promise.all([
      // plan in force on THIS date (mid-month changes apply from their effective date)
      dailyPlanOnDate(date),
      prisma.manpowerActual.findMany({
        where: { date, deletedAt: null },
        include: { vendorAllocations: { include: { vendor: { select: { id: true, vendorName: true } } } } },
      }),
    ]);
    const actualMap = new Map(actuals.map((a) => [a.costCenterId, a]));
    return costCenters.map((cc) => {
      const plan = planMap.get(cc.id)?.qty;
      const actual = actualMap.get(cc.id);
      const allocationsFor = (shift: Shift) =>
        (actual?.vendorAllocations ?? [])
          .filter((v) => v.shift === shift)
          .map((v) => ({ vendorId: v.vendorId, vendorName: v.vendor.vendorName, male: v.male, female: v.female, count: v.count }));
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
   * Upsert one day+cost-center entry. Vendor breakdown is mandatory: the
   * day/night/male/female totals are always derived from the vendor rows —
   * there is no way to record an actual without naming at least one vendor.
   */
  async upsert(input: {
    date: Date;
    costCenterId: string;
    remarks?: string | null;
    dayVendors?: VendorAllocationInput[];
    nightVendors?: VendorAllocationInput[];
    createdById: string;
  }) {
    const cc = await prisma.costCenter.findFirst({ where: { id: input.costCenterId, deletedAt: null } });
    if (!cc) throw new BadRequestError('Unknown cost center');

    const dayVendors = cleanVendors(input.dayVendors);
    const nightVendors = cleanVendors(input.nightVendors);
    if (dayVendors.length === 0 && nightVendors.length === 0) {
      throw new BadRequestError('At least one vendor entry (day or night shift) is required to save an actual entry');
    }

    const date = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate()));
    const daySum = sumShift(dayVendors);
    const nightSum = sumShift(nightVendors);
    const dayActual = daySum.male + daySum.female;
    const nightActual = nightSum.male + nightSum.female;
    const actualCount = dayActual + nightActual;
    const variance = await computeVariance(date, input.costCenterId, actualCount);

    const values = {
      actualCount,
      dayActual,
      nightActual,
      maleActual: daySum.male + nightSum.male,
      femaleActual: daySum.female + nightSum.female,
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

    // Vendor allocations are always a full replacement of both shifts.
    await prisma.actualVendorAllocation.deleteMany({ where: { actualId: actual.id } });
    const rows = [
      ...dayVendors.map((v) => ({ actualId: actual.id, shift: 'DAY' as Shift, vendorId: v.vendorId, male: v.male, female: v.female, count: v.male + v.female })),
      ...nightVendors.map((v) => ({ actualId: actual.id, shift: 'NIGHT' as Shift, vendorId: v.vendorId, male: v.male, female: v.female, count: v.male + v.female })),
    ];
    if (rows.length) await prisma.actualVendorAllocation.createMany({ data: rows });

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
