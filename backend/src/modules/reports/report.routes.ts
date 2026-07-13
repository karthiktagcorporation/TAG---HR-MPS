import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { allowedCostCenterIds } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';
import { reportService, ReportType, ReportFilters } from './report.service';
import { streamReportXlsx } from './export.util';

const router = Router();
router.use(authenticate);

const REPORT_TYPES = [
  'cost-center', 'unit', 'daily-summary', 'daily-attendance', 'monthly-summary',
  'plan-vs-actual', 'shortage', 'excess', 'consolidated',
] as const;

const typeParam = z.object({ type: z.enum(REPORT_TYPES) });
const filterSchema = z.object({
  year: z.coerce.number().optional(),
  month: z.coerce.number().min(1).max(12).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  unitId: z.string().optional(),
  costCenterId: z.string().optional(),
  search: z.string().optional(),
});

function buildFilters(req: any): ReportFilters {
  const now = new Date();
  return {
    year: Number(req.query.year) || now.getFullYear(),
    month: Number(req.query.month) || now.getMonth() + 1,
    dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom) : undefined,
    dateTo: req.query.dateTo ? new Date(req.query.dateTo) : undefined,
    unitId: req.query.unitId || undefined,
    costCenterId: req.query.costCenterId || undefined,
    search: req.query.search || undefined,
    scopedCostCenterIds: allowedCostCenterIds(req),
  };
}

function filterSummary(f: ReportFilters) {
  const parts = [`Period: ${f.month}/${f.year}`];
  if (f.dateFrom || f.dateTo) parts.push(`Range: ${f.dateFrom?.toISOString().slice(0, 10) ?? '...'} - ${f.dateTo?.toISOString().slice(0, 10) ?? '...'}`);
  if (f.unitId) parts.push('Unit filtered');
  return parts.join('  |  ');
}

// List available report definitions
router.get(
  '/',
  asyncHandler(async (_req, res) =>
    success(res, REPORT_TYPES.map((t) => ({ type: t, title: reportService.titles[t as ReportType] }))),
  ),
);

// Report data (JSON) — frontend renders the table and does client-side xlsx/csv/pdf export
router.get(
  '/:type',
  validate({ params: typeParam, query: filterSchema }),
  asyncHandler(async (req, res) => {
    const report = await reportService.build(req.params.type as ReportType, buildFilters(req));
    return success(res, report);
  }),
);

// Server-side XLSX export (branded)
router.get(
  '/:type/export.xlsx',
  validate({ params: typeParam, query: filterSchema }),
  asyncHandler(async (req, res) => {
    const f = buildFilters(req);
    const report = await reportService.build(req.params.type as ReportType, f);
    await auditFromRequest(req, { action: 'EXPORT', module: 'REPORT', entityType: req.params.type, metadata: { format: 'xlsx' } });
    await streamReportXlsx(res, report, filterSummary(f));
  }),
);

export default router;
