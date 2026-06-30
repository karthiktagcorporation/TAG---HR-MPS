import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';
import { authenticate } from '../../middleware/auth';
import { authorize, allowedCostCenterIds, assertCostCenterAccess } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { idParamSchema } from '../../utils/commonSchemas';
import { paginated, success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';
import { actualService } from './actual.service';
import { actualListQuery, bulkActualSchema, createActualSchema, updateActualSchema } from './actual.validation';

const router = Router();
router.use(authenticate);

// All roles may read (USER_MASTER constrained to assigned cost centers)
router.get(
  '/',
  validate({ query: actualListQuery }),
  asyncHandler(async (req, res) => {
    const { page = 1, pageSize = 25, sortBy = 'date', sortDir = 'desc', ...filters } = req.query as any;
    const result = await actualService.list({
      page: Number(page),
      pageSize: Number(pageSize),
      sortBy,
      sortDir,
      filters,
      scopedCostCenterIds: allowedCostCenterIds(req),
    });
    return paginated(res, result.rows, result.meta);
  }),
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER'),
  validate({ body: createActualSchema }),
  asyncHandler(async (req, res) => {
    assertCostCenterAccess(req, req.body.costCenterId);
    const actual = await actualService.upsert({ ...req.body, createdById: req.user!.id });
    await auditFromRequest(req, { action: 'UPSERT', module: 'ACTUAL', entityType: 'ManpowerActual', entityId: actual.id, metadata: req.body });
    return success(res, actual, 201);
  }),
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER'),
  validate({ params: idParamSchema, body: updateActualSchema }),
  asyncHandler(async (req, res) => {
    // Verify scope against the existing record's cost center before mutating
    const current = await prisma.manpowerActual.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { costCenterId: true } });
    if (!current) throw new NotFoundError('Actual entry not found');
    assertCostCenterAccess(req, current.costCenterId);
    const actual = await actualService.update(req.params.id, req.body);
    await auditFromRequest(req, { action: 'UPDATE', module: 'ACTUAL', entityType: 'ManpowerActual', entityId: actual.id, metadata: req.body });
    return success(res, actual);
  }),
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await actualService.remove(req.params.id);
    await auditFromRequest(req, { action: 'DELETE', module: 'ACTUAL', entityType: 'ManpowerActual', entityId: req.params.id });
    return success(res, { message: 'Actual entry deleted' });
  }),
);

router.post(
  '/bulk',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER'),
  validate({ body: bulkActualSchema }),
  asyncHandler(async (req, res) => {
    const allowed = allowedCostCenterIds(req);
    if (allowed) {
      const invalid = req.body.rows.find((r: any) => !allowed.includes(r.costCenterId));
      if (invalid) assertCostCenterAccess(req, invalid.costCenterId);
    }
    const result = await actualService.bulkUpsert(req.body.rows, req.user!.id);
    await auditFromRequest(req, { action: 'IMPORT', module: 'ACTUAL', metadata: { saved: result.saved } });
    return success(res, result, 201);
  }),
);

export default router;
