import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { idParamSchema, listQuerySchema, masterStatus } from '../../utils/commonSchemas';
import { buildPaginationMeta, paginated, parseListQuery, success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';
import { NotFoundError } from '../../utils/errors';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(60),
  status: masterStatus.optional(),
});
const updateSchema = createSchema.partial();

router.use(authenticate);

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, 'name');
    const where = {
      deletedAt: null,
      ...(req.query.status ? { status: req.query.status as 'ACTIVE' | 'INACTIVE' } : {}),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.category.findMany({ where, skip: q.skip, take: q.take, orderBy: { [q.sortBy ?? 'name']: q.sortDir } }),
      prisma.category.count({ where }),
    ]);
    return paginated(res, rows, buildPaginationMeta(q.page, q.pageSize, total));
  }),
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const category = await prisma.category.create({ data: req.body });
    await auditFromRequest(req, { action: 'CREATE', module: 'CATEGORY', entityType: 'Category', entityId: category.id, metadata: req.body });
    return success(res, category, 201);
  }),
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const category = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
    await auditFromRequest(req, { action: 'UPDATE', module: 'CATEGORY', entityType: 'Category', entityId: category.id, metadata: req.body });
    return success(res, category);
  }),
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const inUse = await prisma.costCenter.count({ where: { categoryId: req.params.id, deletedAt: null } });
    if (inUse > 0) throw new NotFoundError('Cannot delete a category that is still linked to cost centers');
    await prisma.category.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await auditFromRequest(req, { action: 'DELETE', module: 'CATEGORY', entityType: 'Category', entityId: req.params.id });
    return success(res, { message: 'Category deleted' });
  }),
);

export default router;
