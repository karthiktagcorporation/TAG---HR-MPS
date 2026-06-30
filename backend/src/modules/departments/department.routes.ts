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

const router = Router();

const createSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  status: masterStatus.optional(),
});
const updateSchema = createSchema.partial();

router.use(authenticate);

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, 'code');
    const where = {
      deletedAt: null,
      ...(req.query.status ? { status: req.query.status as 'ACTIVE' | 'INACTIVE' } : {}),
      ...(q.search ? { OR: [{ code: { contains: q.search, mode: 'insensitive' as const } }, { name: { contains: q.search, mode: 'insensitive' as const } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.department.findMany({ where, skip: q.skip, take: q.take, orderBy: { [q.sortBy ?? 'code']: q.sortDir }, include: { _count: { select: { costCenters: true } } } }),
      prisma.department.count({ where }),
    ]);
    return paginated(res, rows, buildPaginationMeta(q.page, q.pageSize, total));
  }),
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const dept = await prisma.department.create({ data: req.body });
    await auditFromRequest(req, { action: 'CREATE', module: 'DEPARTMENT', entityType: 'Department', entityId: dept.id, metadata: req.body });
    return success(res, dept, 201);
  }),
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const dept = await prisma.department.update({ where: { id: req.params.id }, data: req.body });
    await auditFromRequest(req, { action: 'UPDATE', module: 'DEPARTMENT', entityType: 'Department', entityId: dept.id, metadata: req.body });
    return success(res, dept);
  }),
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await prisma.department.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await auditFromRequest(req, { action: 'DELETE', module: 'DEPARTMENT', entityType: 'Department', entityId: req.params.id });
    return success(res, { message: 'Department deleted' });
  }),
);

export default router;
