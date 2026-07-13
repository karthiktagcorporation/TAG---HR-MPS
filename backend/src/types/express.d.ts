import { RoleCode } from '@prisma/client';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: RoleCode;
  /** Cost center ids this user is scoped to. Empty array means "all" for non-restricted roles. */
  costCenterIds: string[];
  /** Per-user grant to delete daily actual entries (SUPER_ADMIN always can). */
  canDeleteActuals: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
