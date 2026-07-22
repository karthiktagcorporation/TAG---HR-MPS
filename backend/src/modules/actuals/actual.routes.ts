import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { authenticate } from '../../middleware/auth';
import { authorize, allowedCostCenterIds, assertCostCenterAccess } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { idParamSchema } from '../../utils/commonSchemas';
import { paginated, success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';
import { actualService } from './actual.service';
import { actualGridQuery, actualListQuery, bulkActualSchema, createActualSchema, updateActualSchema } from './actual.validation';

const router = Router();
router.use(authenticate);

/**
 * Entry window: non-SUPER_ADMIN users may only enter/edit actuals for the
 * last 3 days (today, yesterday, day before) and never for future dates.
 */
function assertEntryDateAllowed(req: any, date: Date) {
  if (req.user!.role === 'SUPER_ADMIN') return;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diffDays = (todayUtc - dUtc) / 86400000;
  if (diffDays < 0) throw new ForbiddenError('Future dates are not allowed');
  if (diffDays > 2) throw new ForbiddenError('Entries are allowed only for the last 3 days. Contact a Super Admin for older dates.');
}

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

// Grid view for a date: one row per (scoped) cost center with plan + entry merged
router.get(
  '/grid',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER'),
  validate({ query: actualGridQuery }),
  asyncHandler(async (req, res) => {
    const { date, unitId, categoryId } = req.query as any;
    const d = new Date(date);
    const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return success(res, await actualService.grid(utc, allowedCostCenterIds(req), unitId, categoryId));
  }),
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER'),
  validate({ body: createActualSchema }),
  asyncHandler(async (req, res) => {
    assertCostCenterAccess(req, req.body.costCenterId);
    assertEntryDateAllowed(req, new Date(req.body.date));
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
    const current = await prisma.manpowerActual.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { costCenterId: true, date: true } });
    if (!current) throw new NotFoundError('Actual entry not found');
    assertCostCenterAccess(req, current.costCenterId);
    assertEntryDateAllowed(req, current.date);
    const actual = await actualService.update(req.params.id, req.body);
    await auditFromRequest(req, { action: 'UPDATE', module: 'ACTUAL', entityType: 'ManpowerActual', entityId: actual.id, metadata: req.body });
    return success(res, actual);
  }),
);

// Delete: SUPER_ADMIN always; other roles only with the per-user canDeleteActuals grant
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'SUPER_ADMIN' && !req.user!.canDeleteActuals) {
      throw new ForbiddenError('You are not allowed to delete daily actual entries');
    }
    const current = await prisma.manpowerActual.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { costCenterId: true } });
    if (!current) throw new NotFoundError('Actual entry not found');
    assertCostCenterAccess(req, current.costCenterId);
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
    for (const r of req.body.rows) assertEntryDateAllowed(req, new Date(r.date));
    const result = await actualService.bulkUpsert(req.body.rows, req.user!.id);
    await auditFromRequest(req, { action: 'IMPORT', module: 'ACTUAL', metadata: { saved: result.saved } });
    return success(res, result, 201);
  }),
);

export default router;
