import { NotificationSeverity, NotificationType, Prisma, RoleCode } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const notificationService = {
  /** Notifications visible to a user: directly targeted OR targeted to their role. */
  async listForUser(userId: string, role: RoleCode, onlyUnread = false) {
    const where: Prisma.NotificationWhereInput = {
      OR: [{ userId }, { roleCode: role }],
      ...(onlyUnread ? { isRead: false } : {}),
    };
    return prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  },

  async unreadCount(userId: string, role: RoleCode) {
    return prisma.notification.count({ where: { OR: [{ userId }, { roleCode: role }], isRead: false } });
  },

  async markRead(id: string) {
    return prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
  },

  async markAllRead(userId: string, role: RoleCode) {
    await prisma.notification.updateMany({ where: { OR: [{ userId }, { roleCode: role }], isRead: false }, data: { isRead: true, readAt: new Date() } });
  },

  /** If no manpower plans are pending anymore, auto-clear any unread pending-approval notifications. */
  async autoClearPendingApproval() {
    const pending = await prisma.manpowerPlan.count({ where: { status: 'PENDING', deletedAt: null } });
    if (pending === 0) {
      await prisma.notification.updateMany({ where: { type: 'PENDING_APPROVAL', isRead: false }, data: { isRead: true, readAt: new Date() } });
    }
    return { pending };
  },

  async create(data: {
    title: string;
    message: string;
    type?: NotificationType;
    severity?: NotificationSeverity;
    userId?: string;
    roleCode?: RoleCode;
    link?: string;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.notification.create({
      data: {
        title: data.title,
        message: data.message,
        type: data.type ?? 'SYSTEM',
        severity: data.severity ?? 'INFO',
        userId: data.userId,
        roleCode: data.roleCode,
        link: data.link,
        metadata: (data.metadata as object) ?? undefined,
      },
    });
  },

  /**
   * Generates alert notifications from current data. Designed to be invoked by a
   * scheduler (cron) or manually by an admin. Idempotency is best-effort.
   */
  async generateAlerts() {
    const created: string[] = [];

    // Pending approvals → HR_ADMIN + SUPER_ADMIN (the approvers)
    const pending = await prisma.manpowerPlan.count({ where: { status: 'PENDING', deletedAt: null } });
    if (pending > 0) {
      for (const roleCode of ['HR_ADMIN', 'SUPER_ADMIN'] as RoleCode[]) {
        await this.create({
          title: 'Plans pending approval',
          message: `${pending} manpower plan(s) are awaiting approval.`,
          type: 'PENDING_APPROVAL',
          severity: 'WARNING',
          roleCode,
          link: '/plans?status=PENDING',
        });
      }
      created.push('pending-approvals');
    }

    // Critical shortage today → MANAGEMENT
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const thresholds = (await prisma.setting.findUnique({ where: { key: 'thresholds' } }))?.value as any;
    const criticalLevel = thresholds?.shortageCritical ?? 15;
    const shortageAgg = await prisma.manpowerActual.aggregate({ where: { date: start, deletedAt: null }, _sum: { shortage: true } });
    const totalShortage = shortageAgg._sum.shortage ?? 0;
    if (totalShortage >= criticalLevel) {
      await this.create({
        title: 'Critical shortage today',
        message: `Total shortage today is ${totalShortage} (threshold ${criticalLevel}).`,
        type: 'CRITICAL_SHORTAGE',
        severity: 'CRITICAL',
        roleCode: 'MANAGEMENT',
      });
      created.push('critical-shortage');
    }

    return { created };
  },
};
