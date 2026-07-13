import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import { asyncHandler } from './asyncHandler';

/** Authenticates the request via Bearer access token and hydrates req.user. */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication token missing');
  }
  const token = header.slice(7);

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
    include: { role: true, costCenters: { select: { costCenterId: true } } },
  });

  if (!user) {
    throw new UnauthorizedError('User no longer active');
  }

  req.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role.code,
    costCenterIds: user.costCenters.map((c) => c.costCenterId),
    canDeleteActuals: user.canDeleteActuals,
  };

  next();
});
