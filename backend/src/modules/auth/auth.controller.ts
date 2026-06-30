import { Request, Response } from 'express';
import { authService } from './auth.service';
import { success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';

const REFRESH_COOKIE = 'tagmps_refresh';
const cookieOpts = (req: Request) => ({
  httpOnly: true,
  secure: req.secure || process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export const authController = {
  async login(req: Request, res: Response) {
    const ctx = { ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined };
    const result = await authService.login(req.body, ctx);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts(req));
    await auditFromRequest(req, { action: 'LOGIN', module: 'AUTH', entityType: 'User', entityId: result.user.id });
    return success(res, result);
  },

  async refresh(req: Request, res: Response) {
    const token = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];
    const ctx = { ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined };
    const result = await authService.refresh(token, ctx);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts(req));
    return success(res, result);
  },

  async logout(req: Request, res: Response) {
    const token = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];
    await authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    await auditFromRequest(req, { action: 'LOGOUT', module: 'AUTH' });
    return success(res, { message: 'Logged out' });
  },

  async me(req: Request, res: Response) {
    const result = await authService.me(req.user!.id);
    return success(res, result);
  },

  async changePassword(req: Request, res: Response) {
    await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    await auditFromRequest(req, { action: 'CHANGE_PASSWORD', module: 'AUTH', entityType: 'User', entityId: req.user!.id });
    return success(res, { message: 'Password updated' });
  },
};
