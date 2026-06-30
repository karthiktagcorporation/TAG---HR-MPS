import { Router } from 'express';
import { PlanStatus } from '@prisma/client';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { idParamSchema } from '../../utils/commonSchemas';
import { paginated, success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';
import { planService } from './plan.service';
import {
  approvalSchema,
  bulkPlanSchema,
  createPlanSchema,
  duplicateSchema,
  planListQuery,
  rejectSchema,
  updatePlanSchema,
} from './plan.validation';

const router = Router();
router.use(authenticate);

// List & read: all roles except scoped USER_MASTER
router.get(
  '/',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'),
  validate({ query: planListQuery }),
  asyncHandler(async (req, res) => {
    const { page = 1, pageSize = 25, sortBy = 'createdAt', sortDir = 'desc', ...filters } = req.query as any;
    const result = await planService.list({ page: Number(page), pageSize: Number(pageSize), sortBy, sortDir, filters });
    return paginated(res, result.rows, result.meta);
  }),
);

router.get(
  '/pending',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'),
  asyncHandler(async (_req, res) => {
    const result = await planService.list({ page: 1, pageSize: 100, sortBy: 'createdAt', sortDir: 'desc', filters: { status: 'PENDING' } });
    return paginated(res, result.rows, result.meta);
  }),
);

router.get(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => success(res, await planService.getById(req.params.id))),
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: createPlanSchema }),
  asyncHandler(async (req, res) => {
    const plan = await planService.create({ ...req.body, createdById: req.user!.id });
    await auditFromRequest(req, { action: 'CREATE', module: 'PLAN', entityType: 'ManpowerPlan', entityId: plan.id, metadata: req.body });
    return success(res, plan, 201);
  }),
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema, body: updatePlanSchema }),
  asyncHandler(async (req, res) => {
    const plan = await planService.update(req.params.id, req.body);
    await auditFromRequest(req, { action: 'UPDATE', module: 'PLAN', entityType: 'ManpowerPlan', entityId: plan.id, metadata: req.body });
    return success(res, plan);
  }),
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await planService.remove(req.params.id);
    await auditFromRequest(req, { action: 'DELETE', module: 'PLAN', entityType: 'ManpowerPlan', entityId: req.params.id });
    return success(res, { message: 'Plan deleted' });
  }),
);

// Workflow transitions
router.post(
  '/:id/submit',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const plan = await planService.transition(req.params.id, PlanStatus.PENDING, req.user!.id, 'Submitted for approval');
    await auditFromRequest(req, { action: 'SUBMIT', module: 'PLAN', entityType: 'ManpowerPlan', entityId: plan.id });
    return success(res, plan);
  }),
);

router.post(
  '/:id/approve',
  authorize('SUPER_ADMIN', 'MANAGEMENT'),
  validate({ params: idParamSchema, body: approvalSchema }),
  asyncHandler(async (req, res) => {
    const plan = await planService.transition(req.params.id, PlanStatus.APPROVED, req.user!.id, req.body.remarks);
    await auditFromRequest(req, { action: 'APPROVE', module: 'PLAN', entityType: 'ManpowerPlan', entityId: plan.id, metadata: req.body });
    return success(res, plan);
  }),
);

router.post(
  '/:id/reject',
  authorize('SUPER_ADMIN', 'MANAGEMENT'),
  validate({ params: idParamSchema, body: rejectSchema }),
  asyncHandler(async (req, res) => {
    const plan = await planService.transition(req.params.id, PlanStatus.REJECTED, req.user!.id, req.body.remarks);
    await auditFromRequest(req, { action: 'REJECT', module: 'PLAN', entityType: 'ManpowerPlan', entityId: plan.id, metadata: req.body });
    return success(res, plan);
  }),
);

// Bulk import
router.post(
  '/bulk',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: bulkPlanSchema }),
  asyncHandler(async (req, res) => {
    const result = await planService.bulkCreate(req.body.rows, req.user!.id);
    await auditFromRequest(req, { action: 'IMPORT', module: 'PLAN', metadata: { created: result.created, skipped: result.skipped } });
    return success(res, result, 201);
  }),
);

// Duplicate previous month
router.post(
  '/duplicate',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: duplicateSchema }),
  asyncHandler(async (req, res) => {
    const { fromYear, fromMonth, toYear, toMonth } = req.body;
    const result = await planService.duplicate(fromYear, fromMonth, toYear, toMonth, req.user!.id);
    await auditFromRequest(req, { action: 'DUPLICATE', module: 'PLAN', metadata: req.body });
    return success(res, result, 201);
  }),
);

export default router;
