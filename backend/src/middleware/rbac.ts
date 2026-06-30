import { NextFunction, Request, Response } from 'express';
import { RoleCode } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

/** Restricts a route to the given role codes. */
export function authorize(...roles: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Requires role: ${roles.join(', ')}`);
    }
    next();
  };
}

/** True when the role is cost-center scoped (only sees assigned cost centers). */
export function isScopedRole(role: RoleCode): boolean {
  return role === 'USER_MASTER';
}

/**
 * Returns the cost-center ids the user is allowed to act on, or `null` when the
 * user has unrestricted access. Used by services to constrain queries/writes.
 */
export function allowedCostCenterIds(req: Request): string[] | null {
  if (!req.user) throw new UnauthorizedError();
  if (isScopedRole(req.user.role)) {
    return req.user.costCenterIds;
  }
  return null; // unrestricted
}

/** Throws if a scoped user attempts to touch a cost center outside their scope. */
export function assertCostCenterAccess(req: Request, costCenterId: string): void {
  const allowed = allowedCostCenterIds(req);
  if (allowed === null) return;
  if (!allowed.includes(costCenterId)) {
    throw new ForbiddenError('You are not assigned to this cost center');
  }
}
