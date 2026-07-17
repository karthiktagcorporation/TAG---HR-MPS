import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';
import { computeWorkingDays, daysInMonth, HolidayEntry } from './calendar.service';

const router = Router();
router.use(authenticate);

const listQuery = z.object({ year: z.coerce.number().int() });

const upsertSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  holidays: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().min(1).max(100) }))
    .max(31)
    .default([]),
  remarks: z.string().max(500).optional().nullable(),
});

// All roles may read (reports/dashboard math is visible to everyone)
router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year);
    const rows = await prisma.calendarMonth.findMany({ where: { year }, orderBy: { month: 'asc' } });
    const byMonth = new Map(rows.map((r) => [r.month, r]));
    // Return all 12 months; unconfigured months fall back to every day = working
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const row = byMonth.get(month);
      return row ?? { id: null, year, month, weeklyOffDays: [], holidays: [], workingDays: daysInMonth(year, month), remarks: null, configured: false };
    }).map((r: any) => ({ ...r, configured: r.id !== null }));
    return success(res, months);
  }),
);

router.put(
  '/',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: upsertSchema }),
  asyncHandler(async (req, res) => {
    const { year, month, weeklyOffDays, holidays, remarks } = req.body;
    const workingDays = computeWorkingDays(year, month, weeklyOffDays, holidays as HolidayEntry[]);
    const row = await prisma.calendarMonth.upsert({
      where: { year_month: { year, month } },
      update: { weeklyOffDays, holidays, workingDays, remarks },
      create: { year, month, weeklyOffDays, holidays, workingDays, remarks },
    });
    await auditFromRequest(req, { action: 'UPSERT', module: 'CALENDAR', entityType: 'CalendarMonth', entityId: row.id, metadata: { year, month, workingDays } });
    return success(res, row);
  }),
);

export default router;
