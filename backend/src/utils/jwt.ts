import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { RoleCode } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string; // user id
  username: string;
  role: RoleCode;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  } as SignOptions);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Returns expiry as a Date based on the configured refresh duration string (e.g. "7d"). */
export function refreshExpiryDate(): Date {
  const str = env.jwt.refreshExpiresIn;
  const match = /^(\d+)([smhd])$/.exec(str);
  const ms =
    match == null
      ? 7 * 24 * 60 * 60 * 1000
      : Number(match[1]) *
        ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd']);
  return new Date(Date.now() + ms);
}
