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
  duplicateSchema,
  gridQuerySchema,
  monthActionSchema,
  planListQuery,
  rejectSchema,
  saveGridSchema,
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

// Grid view: one row per active cost center for a month (plan values merged in)
router.get(
  '/grid',
  authorize('SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'),
  validate({ query: gridQuerySchema }),
  asyncHandler(async (req, res) => {
    const { year, month, unitId, categoryId } = req.query as any;
    return success(res, await planService.grid(Number(year), Number(month), unitId, categoryId));
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

// Grid save / Excel import — every touched row becomes PENDING and needs approval
router.post(
  '/grid',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: saveGridSchema }),
  asyncHandler(async (req, res) => {
    const { year, month, rows, effectiveFrom } = req.body;
    const result = await planService.saveGrid(year, month, rows, { id: req.user!.id, name: req.user!.username }, effectiveFrom ? new Date(effectiveFrom) : undefined);
    await auditFromRequest(req, { action: 'SAVE_GRID', module: 'PLAN', metadata: { year, month, effectiveFrom, saved: result.saved, unchanged: result.unchanged } });
    return success(res, result, 201);
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

// Approval workflow — HR Admin or Super Admin
router.post(
  '/:id/approve',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema, body: approvalSchema }),
  asyncHandler(async (req, res) => {
    const plan = await planService.transition(req.params.id, PlanStatus.APPROVED, req.user!.id, req.body.remarks);
    await auditFromRequest(req, { action: 'APPROVE', module: 'PLAN', entityType: 'ManpowerPlan', entityId: plan.id, metadata: req.body });
    return success(res, plan);
  }),
);

router.post(
  '/:id/reject',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema, body: rejectSchema }),
  asyncHandler(async (req, res) => {
    const plan = await planService.transition(req.params.id, PlanStatus.REJECTED, req.user!.id, req.body.remarks);
    await auditFromRequest(req, { action: 'REJECT', module: 'PLAN', entityType: 'ManpowerPlan', entityId: plan.id, metadata: req.body });
    return success(res, plan);
  }),
);

// Approve / reject every pending plan of a month in one action
router.post(
  '/approve-month',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: monthActionSchema }),
  asyncHandler(async (req, res) => {
    const { year, month, remarks } = req.body;
    const result = await planService.transitionMonth(year, month, 'APPROVED', req.user!.id, remarks);
    await auditFromRequest(req, { action: 'APPROVE_MONTH', module: 'PLAN', metadata: { year, month, count: result.count } });
    return success(res, result);
  }),
);

router.post(
  '/reject-month',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: monthActionSchema.extend({ remarks: rejectSchema.shape.remarks }) }),
  asyncHandler(async (req, res) => {
    const { year, month, remarks } = req.body;
    const result = await planService.transitionMonth(year, month, 'REJECTED', req.user!.id, remarks);
    await auditFromRequest(req, { action: 'REJECT_MONTH', module: 'PLAN', metadata: { year, month, count: result.count } });
    return success(res, result);
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
