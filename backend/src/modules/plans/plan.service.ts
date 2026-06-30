import { Prisma, PlanStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/apiResponse';

const include = {
  unit: true,
  costCenter: { include: { unit: true, department: true } },
  vendor: true,
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
};

interface ListArgs {
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  filters: Record<string, unknown>;
}

export const planService = {
  async list(args: ListArgs) {
    const { page, pageSize, sortBy, sortDir, filters } = args;
    const where: Prisma.ManpowerPlanWhereInput = {
      deletedAt: null,
      ...(filters.year ? { year: Number(filters.year) } : {}),
      ...(filters.month ? { month: Number(filters.month) } : {}),
      ...(filters.unitId ? { unitId: String(filters.unitId) } : {}),
      ...(filters.costCenterId ? { costCenterId: String(filters.costCenterId) } : {}),
      ...(filters.vendorId ? { vendorId: String(filters.vendorId) } : {}),
      ...(filters.status ? { status: filters.status as PlanStatus } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.manpowerPlan.findMany({
        where,
        include,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortBy]: sortDir },
      }),
      prisma.manpowerPlan.count({ where }),
    ]);
    return { rows, meta: buildPaginationMeta(page, pageSize, total) };
  },

  async getById(id: string) {
    const plan = await prisma.manpowerPlan.findFirst({
      where: { id, deletedAt: null },
      include: { ...include, history: { include: { actionBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' } } },
    });
    if (!plan) throw new NotFoundError('Plan not found');
    return plan;
  },

  async create(data: Prisma.ManpowerPlanUncheckedCreateInput) {
    try {
      const plan = await prisma.manpowerPlan.create({ data: { ...data, status: PlanStatus.DRAFT }, include });
      await prisma.planStatusHistory.create({
        data: { planId: plan.id, toStatus: PlanStatus.DRAFT, actionById: data.createdById, remarks: 'Created' },
      });
      return plan;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictError('A plan already exists for this month / unit / cost center / vendor / type');
      }
      throw e;
    }
  },

  async update(id: string, data: Prisma.ManpowerPlanUncheckedUpdateInput) {
    const existing = await prisma.manpowerPlan.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Plan not found');
    if (existing.status === PlanStatus.APPROVED) {
      throw new BadRequestError('Approved plans cannot be edited. Create a revision instead.');
    }
    return prisma.manpowerPlan.update({ where: { id }, data, include });
  },

  async remove(id: string) {
    const existing = await prisma.manpowerPlan.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Plan not found');
    if (existing.status === PlanStatus.APPROVED) throw new BadRequestError('Approved plans cannot be deleted');
    await prisma.manpowerPlan.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async transition(id: string, to: PlanStatus, actionById: string, remarks?: string) {
    const plan = await prisma.manpowerPlan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) throw new NotFoundError('Plan not found');

    const allowed: Record<PlanStatus, PlanStatus[]> = {
      DRAFT: [PlanStatus.PENDING],
      PENDING: [PlanStatus.APPROVED, PlanStatus.REJECTED, PlanStatus.DRAFT],
      APPROVED: [],
      REJECTED: [PlanStatus.DRAFT, PlanStatus.PENDING],
    };
    if (!allowed[plan.status].includes(to)) {
      throw new BadRequestError(`Cannot move a ${plan.status} plan to ${to}`);
    }

    const data: Prisma.ManpowerPlanUncheckedUpdateInput = { status: to };
    if (to === PlanStatus.APPROVED) {
      data.approvedById = actionById;
      data.approvedAt = new Date();
      data.rejectionRemarks = null;
    }
    if (to === PlanStatus.REJECTED) data.rejectionRemarks = remarks ?? null;

    const [updated] = await prisma.$transaction([
      prisma.manpowerPlan.update({ where: { id }, data, include }),
      prisma.planStatusHistory.create({ data: { planId: id, fromStatus: plan.status, toStatus: to, actionById, remarks } }),
    ]);
    return updated;
  },

  async bulkCreate(rows: Prisma.ManpowerPlanUncheckedCreateInput[], createdById: string) {
    const results = { created: 0, skipped: 0, errors: [] as { row: number; message: string }[] };
    for (let i = 0; i < rows.length; i++) {
      try {
        await prisma.manpowerPlan.create({ data: { ...rows[i], createdById, status: PlanStatus.DRAFT } });
        results.created++;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          results.skipped++;
          results.errors.push({ row: i + 1, message: 'Duplicate plan key — skipped' });
        } else {
          results.errors.push({ row: i + 1, message: (e as Error).message });
        }
      }
    }
    return results;
  },

  async duplicate(
    fromYear: number,
    fromMonth: number,
    toYear: number,
    toMonth: number,
    createdById: string,
  ) {
    const source = await prisma.manpowerPlan.findMany({
      where: { year: fromYear, month: fromMonth, deletedAt: null },
    });
    if (source.length === 0) throw new NotFoundError('No plans found for the source month');

    let created = 0;
    let skipped = 0;
    for (const p of source) {
      try {
        await prisma.manpowerPlan.create({
          data: {
            year: toYear,
            month: toMonth,
            unitId: p.unitId,
            costCenterId: p.costCenterId,
            vendorId: p.vendorId,
            genderOrType: p.genderOrType,
            plannedCount: p.plannedCount,
            remarks: p.remarks,
            status: PlanStatus.DRAFT,
            createdById,
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }
    return { created, skipped, total: source.length };
  },

  ensureNotScopedRole(role: string) {
    if (role === 'USER_MASTER') throw new ForbiddenError('User Master role cannot manage plans');
  },
};
