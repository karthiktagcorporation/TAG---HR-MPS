import { Request } from 'express';
import { prisma } from '../config/prisma';
import { logger } from './logger';

export interface AuditInput {
  userId?: string | null;
  action: string;
  module: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/** Fire-and-forget audit log writer. Never throws into the request path. */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata as object) ?? undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log');
  }
}

/** Convenience that pulls actor + request context off the Express request. */
export function auditFromRequest(
  req: Request,
  data: Omit<AuditInput, 'userId' | 'ipAddress' | 'userAgent'>,
): Promise<void> {
  return writeAudit({
    ...data,
    userId: req.user?.id ?? null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });
}
