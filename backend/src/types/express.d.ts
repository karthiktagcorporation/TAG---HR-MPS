import { RoleCode } from '@prisma/client';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: RoleCode;
  /** Cost center ids this user is scoped to. Empty array means "all" for non-restricted roles. */
  costCenterIds: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
