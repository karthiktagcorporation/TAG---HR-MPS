import { Prisma, PlanStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../utils/apiResponse';
import { notificationService } from '../notifications/notification.service';
import { actualService } from '../actuals/actual.service';

const include = {
  unit: true,
  costCenter: { include: { unit: true } },
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

export interface GridRow {
  costCenterId: string;
  dayPlan: number;
  nightPlan: number;
  remarks?: string | null;
}

async function notifyApprovers(count: number, actorName: string) {
  for (const roleCode of ['HR_ADMIN', 'SUPER_ADMIN'] as const) {
    await notificationService.create({
      title: 'Manpower plan awaiting approval',
      message: `${actorName} submitted ${count} plan row(s) for approval.`,
      type: 'PENDING_APPROVAL',
      severity: 'WARNING',
      roleCode,
      link: '/plans',
    });
  }
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

  /** Every plan row for a month keyed by cost center — powers the grid editor. */
  async grid(year: number, month: number, unitId?: string) {
    const costCenters = await prisma.costCenter.findMany({
      where: { deletedAt: null, status: 'ACTIVE', ...(unitId ? { unitId } : {}) },
      include: { unit: true },
      orderBy: [{ unit: { code: 'asc' } }, { costCode: 'asc' }],
    });
    const plans = await prisma.manpowerPlan.findMany({
      where: { year, month, deletedAt: null, ...(unitId ? { unitId } : {}) },
      include: { approvedBy: { select: { name: true } } },
    });
    const planMap = new Map(plans.map((p) => [p.costCenterId, p]));
    return costCenters.map((cc) => {
      const plan = planMap.get(cc.id);
      return {
        costCenterId: cc.id,
        unit: cc.unit.code,
        unitId: cc.unitId,
        costCode: cc.costCode,
        costCentre: cc.costCentre,
        department: cc.department ?? null,
        planId: plan?.id ?? null,
        plannedCount: plan?.plannedCount ?? null,
        dayPlan: plan?.dayPlan ?? null,
        nightPlan: plan?.nightPlan ?? null,
        remarks: plan?.remarks ?? null,
        status: plan?.status ?? null,
        approvedBy: plan?.approvedBy?.name ?? null,
        rejectionRemarks: plan?.rejectionRemarks ?? null,
      };
    });
  },

  async getById(id: string) {
    const plan = await prisma.manpowerPlan.findFirst({
      where: { id, deletedAt: null },
      include: { ...include, history: { include: { actionBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' } } },
    });
    if (!plan) throw new NotFoundError('Plan not found');
    return plan;
  },

  /**
   * Bulk upsert from the grid editor or Excel import.
   * Every touched row goes to PENDING — approval by HR Admin / Super Admin is
   * always required, including edits to previously approved plans.
   */
  async saveGrid(year: number, month: number, rows: GridRow[], actor: { id: string; name: string }, effectiveFrom?: Date) {
    const results = { saved: 0, unchanged: 0, errors: [] as { row: number; message: string }[] };
    const ccs = await prisma.costCenter.findMany({ where: { id: { in: rows.map((r) => r.costCenterId) } } });
    const ccMap = new Map(ccs.map((c) => [c.id, c]));

    // Effective date for these changes (defaults to the 1st). Clamped to the month.
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    let effDate = monthStart;
    if (effectiveFrom) {
      const d = new Date(Date.UTC(effectiveFrom.getUTCFullYear(), effectiveFrom.getUTCMonth(), effectiveFrom.getUTCDate()));
      if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) {
        throw new BadRequestError('Effective-from date must fall within the plan month');
      }
      effDate = d;
    }
    // An edit adds a revision from the chosen date, keeping earlier revisions
    // (and the variance already computed for those days) intact.
    const upsertRevision = async (planId: string, values: { plannedCount: number; dayPlan: number; nightPlan: number }) => {
      await prisma.planRevision.upsert({
        where: { planId_effectiveFrom: { planId, effectiveFrom: effDate } },
        update: values,
        create: { planId, effectiveFrom: effDate, ...values },
      });
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cc = ccMap.get(row.costCenterId);
      if (!cc) {
        results.errors.push({ row: i + 1, message: 'Unknown cost center' });
        continue;
      }
      const values = {
        plannedCount: row.dayPlan + row.nightPlan,
        dayPlan: row.dayPlan,
        nightPlan: row.nightPlan,
        remarks: row.remarks,
      };
      try {
        const existing = await prisma.manpowerPlan.findUnique({
          where: { plan_unique_key: { year, month, costCenterId: row.costCenterId } },
        });
        if (existing && existing.deletedAt === null) {
          const unchanged =
            existing.dayPlan === row.dayPlan &&
            existing.nightPlan === row.nightPlan &&
            (existing.remarks ?? '') === (row.remarks ?? '');
          if (unchanged) {
            results.unchanged++;
            continue;
          }
          const updated = await prisma.manpowerPlan.update({
            where: { id: existing.id },
            data: { ...values, status: PlanStatus.PENDING, deletedAt: null, approvedById: null, approvedAt: null, rejectionRemarks: null },
          });
          await upsertRevision(updated.id, { plannedCount: values.plannedCount, dayPlan: values.dayPlan, nightPlan: values.nightPlan });
          await prisma.planStatusHistory.create({
            data: { planId: updated.id, fromStatus: existing.status, toStatus: PlanStatus.PENDING, actionById: actor.id, remarks: `Updated (effective ${effDate.toISOString().slice(0, 10)}) — pending approval` },
          });
        } else if (existing) {
          // previously soft-deleted → revive as pending
          await prisma.manpowerPlan.update({
            where: { id: existing.id },
            data: { ...values, status: PlanStatus.PENDING, deletedAt: null, createdById: actor.id, approvedById: null, approvedAt: null, rejectionRemarks: null },
          });
          // Revived plan starts a fresh timeline from the chosen date
          await prisma.planRevision.deleteMany({ where: { planId: existing.id } });
          await upsertRevision(existing.id, { plannedCount: values.plannedCount, dayPlan: values.dayPlan, nightPlan: values.nightPlan });
          await prisma.planStatusHistory.create({
            data: { planId: existing.id, toStatus: PlanStatus.PENDING, actionById: actor.id, remarks: 'Re-created — pending approval' },
          });
        } else {
          const created = await prisma.manpowerPlan.create({
            data: {
              year,
              month,
              unitId: cc.unitId,
              costCenterId: row.costCenterId,
              ...values,
              status: PlanStatus.PENDING,
              createdById: actor.id,
            },
          });
          await upsertRevision(created.id, { plannedCount: values.plannedCount, dayPlan: values.dayPlan, nightPlan: values.nightPlan });
          await prisma.planStatusHistory.create({
            data: { planId: created.id, toStatus: PlanStatus.PENDING, actionById: actor.id, remarks: 'Created — pending approval' },
          });
        }
        results.saved++;
      } catch (e) {
        results.errors.push({ row: i + 1, message: (e as Error).message });
      }
    }

    if (results.saved > 0) await notifyApprovers(results.saved, actor.name);
    return results;
  },

  async remove(id: string) {
    const existing = await prisma.manpowerPlan.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Plan not found');
    await prisma.manpowerPlan.update({ where: { id }, data: { deletedAt: new Date() } });
    if (existing.status === PlanStatus.PENDING) await notificationService.autoClearPendingApproval();
  },

  async transition(id: string, to: PlanStatus, actionById: string, remarks?: string) {
    const plan = await prisma.manpowerPlan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) throw new NotFoundError('Plan not found');

    const allowed: Record<PlanStatus, PlanStatus[]> = {
      DRAFT: [PlanStatus.PENDING],
      PENDING: [PlanStatus.APPROVED, PlanStatus.REJECTED],
      APPROVED: [PlanStatus.PENDING],
      REJECTED: [PlanStatus.PENDING],
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
    // keep stored daily variance in sync with the (newly) approved plan
    if (to === PlanStatus.APPROVED || plan.status === PlanStatus.APPROVED) {
      await actualService.recomputeMonth(plan.year, plan.month);
    }
    await notificationService.autoClearPendingApproval();
    return updated;
  },

  /** Approve (or reject) every pending plan of a month in one action. */
  async transitionMonth(year: number, month: number, to: 'APPROVED' | 'REJECTED', actionById: string, remarks?: string) {
    if (to === 'REJECTED' && !remarks) throw new BadRequestError('Rejection remarks are required');
    const pending = await prisma.manpowerPlan.findMany({ where: { year, month, status: 'PENDING', deletedAt: null } });
    if (pending.length === 0) throw new NotFoundError('No pending plans for this month');

    for (const p of pending) {
      await prisma.$transaction([
        prisma.manpowerPlan.update({
          where: { id: p.id },
          data:
            to === 'APPROVED'
              ? { status: PlanStatus.APPROVED, approvedById: actionById, approvedAt: new Date(), rejectionRemarks: null }
              : { status: PlanStatus.REJECTED, rejectionRemarks: remarks },
        }),
        prisma.planStatusHistory.create({ data: { planId: p.id, fromStatus: PlanStatus.PENDING, toStatus: to as PlanStatus, actionById, remarks } }),
      ]);
    }
    if (to === 'APPROVED') await actualService.recomputeMonth(year, month);
    await notificationService.autoClearPendingApproval();
    return { count: pending.length, to };
  },

  async duplicate(fromYear: number, fromMonth: number, toYear: number, toMonth: number, createdById: string) {
    const source = await prisma.manpowerPlan.findMany({
      where: { year: fromYear, month: fromMonth, deletedAt: null },
    });
    if (source.length === 0) throw new NotFoundError('No plans found for the source month');

    let created = 0;
    let skipped = 0;
    for (const p of source) {
      try {
        const dup = await prisma.manpowerPlan.create({
          data: {
            year: toYear,
            month: toMonth,
            unitId: p.unitId,
            costCenterId: p.costCenterId,
            plannedCount: p.plannedCount,
            dayPlan: p.dayPlan,
            nightPlan: p.nightPlan,
            remarks: p.remarks,
            status: PlanStatus.PENDING,
            createdById,
          },
        });
        await prisma.planRevision.create({
          data: {
            planId: dup.id,
            effectiveFrom: new Date(Date.UTC(toYear, toMonth - 1, 1)),
            plannedCount: p.plannedCount,
            dayPlan: p.dayPlan,
            nightPlan: p.nightPlan,
          },
        });
        created++;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') skipped++;
        else throw e;
      }
    }
    return { created, skipped, total: source.length };
  },

  ensureNotScopedRole(role: string) {
    if (role === 'USER_MASTER') throw new ForbiddenError('User Master role cannot manage plans');
  },
};
