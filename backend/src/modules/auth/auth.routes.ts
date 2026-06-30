import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { asyncHandler } from '../../middleware/asyncHandler';
import { changePasswordSchema, loginSchema, refreshSchema } from './auth.validation';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(authController.refresh));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword),
);

export default router;
