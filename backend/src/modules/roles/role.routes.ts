import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import { success } from '../../utils/apiResponse';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    return success(res, roles);
  }),
);

export default router;
