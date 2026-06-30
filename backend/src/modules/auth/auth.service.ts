import { prisma } from '../../config/prisma';
import { comparePassword, hashPassword } from '../../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshExpiryDate,
} from '../../utils/jwt';
import { UnauthorizedError, BadRequestError } from '../../utils/errors';
import { LoginInput } from './auth.validation';
import crypto from 'crypto';

function toAuthUser(user: {
  id: string;
  name: string;
  username: string;
  email: string;
  role: { code: string };
  costCenters: { costCenterId: string }[];
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role.code,
    costCenterIds: user.costCenters.map((c) => c.costCenterId),
  };
}

export interface TokenContext {
  ipAddress?: string;
  userAgent?: string;
}

export const authService = {
  async login(input: LoginInput, ctx: TokenContext) {
    const identifier = input.identifier.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: identifier }, { username: input.identifier.trim() }],
      },
      include: { role: true, costCenters: { select: { costCenterId: true } } },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Invalid credentials');
    }

    const ok = await comparePassword(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Invalid credentials');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokens = await this.issueTokens(user.id, user.username, user.role.code, ctx);
    return { user: toAuthUser(user), ...tokens };
  },

  async issueTokens(userId: string, username: string, role: string, ctx: TokenContext) {
    const jti = crypto.randomUUID();
    const accessToken = signAccessToken({ sub: userId, username, role: role as never });
    const refreshToken = signRefreshToken({ sub: userId, jti });

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiryDate(),
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    });

    return { accessToken, refreshToken };
  },

  async refresh(refreshToken: string | undefined, ctx: TokenContext) {
    if (!refreshToken) throw new UnauthorizedError('Refresh token missing');

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired or revoked');
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
      include: { role: true, costCenters: { select: { costCenterId: true } } },
    });
    if (!user) throw new UnauthorizedError('User no longer active');

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const tokens = await this.issueTokens(user.id, user.username, user.role.code, ctx);
    return { user: toAuthUser(user), ...tokens };
  },

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async me(userId: string) {
    const user = await prisma.user.findFirstOrThrow({
      where: { id: userId },
      include: { role: true, costCenters: { include: { costCenter: { include: { unit: true } } } } },
    });
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role.code,
      roleName: user.role.name,
      lastLoginAt: user.lastLoginAt,
      costCenters: user.costCenters.map((c) => ({
        id: c.costCenter.id,
        costCode: c.costCenter.costCode,
        costCentre: c.costCenter.costCentre,
        unit: c.costCenter.unit.code,
      })),
    };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findFirstOrThrow({ where: { id: userId } });
    const ok = await comparePassword(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestError('Current password is incorrect');
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
    // Revoke all refresh tokens to force re-login on other devices
    await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },
};
