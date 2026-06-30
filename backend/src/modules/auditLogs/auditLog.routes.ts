import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { buildPaginationMeta, paginated, parseListQuery } from '../../utils/apiResponse';

const router = Router();
router.use(authenticate, authorize('SUPER_ADMIN'));

const query = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

router.get(
  '/',
  validate({ query }),
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, 'createdAt');
    const where: Prisma.AuditLogWhereInput = {
      ...(req.query.module ? { module: String(req.query.module) } : {}),
      ...(req.query.action ? { action: String(req.query.action) } : {}),
      ...(req.query.userId ? { userId: String(req.query.userId) } : {}),
      ...(req.query.dateFrom || req.query.dateTo
        ? { createdAt: { gte: req.query.dateFrom ? new Date(req.query.dateFrom as any) : undefined, lte: req.query.dateTo ? new Date(req.query.dateTo as any) : undefined } }
        : {}),
      ...(q.search
        ? { OR: [{ action: { contains: q.search, mode: 'insensitive' } }, { module: { contains: q.search, mode: 'insensitive' } }, { entityType: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { user: { select: { name: true, username: true } } }, skip: q.skip, take: q.take, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);
    return paginated(res, rows, buildPaginationMeta(q.page, q.pageSize, total));
  }),
);

export default router;
