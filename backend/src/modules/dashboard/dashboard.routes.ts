import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { allowedCostCenterIds } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { success } from '../../utils/apiResponse';
import { dashboardService, DashboardFilters } from './dashboard.service';

const router = Router();
router.use(authenticate);

const filterSchema = z.object({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  date: z.coerce.date().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  unitId: z.string().optional(),
  costCenterId: z.string().optional(),
  shift: z.enum(['DAY', 'NIGHT']).optional(),
});

function buildFilters(req: any): DashboardFilters {
  const now = new Date();
  return {
    year: Number(req.query.year) || now.getFullYear(),
    month: Number(req.query.month) || now.getMonth() + 1,
    date: req.query.date ? new Date(req.query.date) : undefined,
    dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom) : undefined,
    dateTo: req.query.dateTo ? new Date(req.query.dateTo) : undefined,
    unitId: req.query.unitId || undefined,
    costCenterId: req.query.costCenterId || undefined,
    shift: req.query.shift || undefined,
    scopedCostCenterIds: allowedCostCenterIds(req),
  };
}

router.get('/', validate({ query: filterSchema }), asyncHandler(async (req, res) => success(res, await dashboardService.full(buildFilters(req)))));
router.get('/kpis', validate({ query: filterSchema }), asyncHandler(async (req, res) => success(res, await dashboardService.kpis(buildFilters(req)))));

export default router;
