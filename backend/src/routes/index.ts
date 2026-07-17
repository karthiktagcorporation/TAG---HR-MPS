import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import userRoutes from '../modules/users/user.routes';
import roleRoutes from '../modules/roles/role.routes';
import vendorRoutes from '../modules/vendors/vendor.routes';
import unitRoutes from '../modules/units/unit.routes';
import costCenterRoutes from '../modules/costCenters/costCenter.routes';
import planRoutes from '../modules/plans/plan.routes';
import actualRoutes from '../modules/actuals/actual.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import reportRoutes from '../modules/reports/report.routes';
import notificationRoutes from '../modules/notifications/notification.routes';
import auditLogRoutes from '../modules/auditLogs/auditLog.routes';
import settingsRoutes from '../modules/settings/settings.routes';
import calendarRoutes from '../modules/calendar/calendar.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/vendors', vendorRoutes);
router.use('/units', unitRoutes);
router.use('/cost-centers', costCenterRoutes);
router.use('/plans', planRoutes);
router.use('/actuals', actualRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/settings', settingsRoutes);
router.use('/calendar', calendarRoutes);

export default router;
