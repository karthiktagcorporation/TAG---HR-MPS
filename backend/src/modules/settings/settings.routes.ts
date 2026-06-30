import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';

const router = Router();
router.use(authenticate);

// Any authenticated user can read settings (company profile, theme, thresholds).
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.setting.findMany();
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return success(res, settings);
  }),
);

router.get(
  '/:key',
  validate({ params: z.object({ key: z.string() }) }),
  asyncHandler(async (req, res) => {
    const row = await prisma.setting.findUnique({ where: { key: req.params.key } });
    return success(res, row?.value ?? null);
  }),
);

// Only Super Admin can update settings.
router.put(
  '/:key',
  authorize('SUPER_ADMIN'),
  validate({ params: z.object({ key: z.string() }), body: z.object({ value: z.any() }) }),
  asyncHandler(async (req, res) => {
    const row = await prisma.setting.upsert({
      where: { key: req.params.key },
      update: { value: req.body.value },
      create: { key: req.params.key, value: req.body.value },
    });
    await auditFromRequest(req, { action: 'UPDATE', module: 'SETTINGS', entityType: 'Setting', entityId: req.params.key, metadata: req.body.value });
    return success(res, row.value);
  }),
);

export default router;
