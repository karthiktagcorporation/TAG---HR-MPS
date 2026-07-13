import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize, allowedCostCenterIds } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { idParamSchema, listQuerySchema, masterStatus } from '../../utils/commonSchemas';
import { buildPaginationMeta, paginated, parseListQuery, success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';
import { NotFoundError } from '../../utils/errors';

const router = Router();

const createSchema = z.object({
  costCode: z.string().min(1).max(30),
  costCentre: z.string().min(1).max(150),
  unitId: z.string().min(1),
  department: z.string().max(120).optional().nullable(),
  status: masterStatus.optional(),
});
const updateSchema = createSchema.partial();

const include = { unit: true };

router.use(authenticate);

router.get(
  '/',
  validate({ query: listQuerySchema.extend({ unitId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, 'costCode');
    const scoped = allowedCostCenterIds(req); // null = unrestricted
    const where = {
      deletedAt: null,
      ...(scoped ? { id: { in: scoped } } : {}),
      ...(req.query.status ? { status: req.query.status as 'ACTIVE' | 'INACTIVE' } : {}),
      ...(req.query.unitId ? { unitId: String(req.query.unitId) } : {}),
      ...(q.search
        ? { OR: [{ costCode: { contains: q.search, mode: 'insensitive' as const } }, { costCentre: { contains: q.search, mode: 'insensitive' as const } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.costCenter.findMany({ where, skip: q.skip, take: q.take, orderBy: { [q.sortBy ?? 'costCode']: q.sortDir }, include }),
      prisma.costCenter.count({ where }),
    ]);
    return paginated(res, rows, buildPaginationMeta(q.page, q.pageSize, total));
  }),
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const cc = await prisma.costCenter.create({ data: req.body, include });
    await auditFromRequest(req, { action: 'CREATE', module: 'COST_CENTER', entityType: 'CostCenter', entityId: cc.id, metadata: req.body });
    return success(res, cc, 201);
  }),
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const cc = await prisma.costCenter.update({ where: { id: req.params.id }, data: req.body, include });
    await auditFromRequest(req, { action: 'UPDATE', module: 'COST_CENTER', entityType: 'CostCenter', entityId: cc.id, metadata: req.body });
    return success(res, cc);
  }),
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.costCenter.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Cost center not found');
    await prisma.costCenter.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await auditFromRequest(req, { action: 'DELETE', module: 'COST_CENTER', entityType: 'CostCenter', entityId: req.params.id });
    return success(res, { message: 'Cost center deleted' });
  }),
);

export default router;
