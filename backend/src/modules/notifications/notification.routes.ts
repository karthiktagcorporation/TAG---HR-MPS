import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { idParamSchema } from '../../utils/commonSchemas';
import { success } from '../../utils/apiResponse';
import { notificationService } from './notification.service';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate({ query: z.object({ unread: z.coerce.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const onlyUnread = String(req.query.unread) === 'true';
    const items = await notificationService.listForUser(req.user!.id, req.user!.role, onlyUnread);
    const unreadCount = await notificationService.unreadCount(req.user!.id, req.user!.role);
    return success(res, { items, unreadCount });
  }),
);

router.post('/:id/read', validate({ params: idParamSchema }), asyncHandler(async (req, res) => success(res, await notificationService.markRead(req.params.id))));

router.post('/read-all', asyncHandler(async (req, res) => {
  await notificationService.markAllRead(req.user!.id, req.user!.role);
  return success(res, { message: 'All notifications marked read' });
}));

// Manually trigger alert generation (admins) — also callable by a scheduler.
router.post('/generate', authorize('SUPER_ADMIN'), asyncHandler(async (_req, res) => success(res, await notificationService.generateAlerts())));

export default router;
