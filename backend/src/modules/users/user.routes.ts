import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/asyncHandler';
import { idParamSchema, listQuerySchema, masterStatus } from '../../utils/commonSchemas';
import { buildPaginationMeta, paginated, parseListQuery, success } from '../../utils/apiResponse';
import { auditFromRequest } from '../../utils/audit';
import { hashPassword } from '../../utils/password';
import { BadRequestError, NotFoundError } from '../../utils/errors';

const router = Router();

const roleCode = z.enum(['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'USER_MASTER']);

const createSchema = z
  .object({
    name: z.string().min(1).max(120),
    username: z.string().min(3).max(60),
    email: z.string().email(),
    password: z.string().min(8),
    role: roleCode,
    status: masterStatus.optional(),
    costCenterIds: z.array(z.string()).optional().default([]),
    canDeleteActuals: z.boolean().optional().default(false),
  })
  .refine((d) => d.role !== 'USER_MASTER' || (d.costCenterIds && d.costCenterIds.length > 0), {
    message: 'User Master role requires at least one assigned cost center',
    path: ['costCenterIds'],
  });

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  username: z.string().min(3).max(60).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: roleCode.optional(),
  status: masterStatus.optional(),
  costCenterIds: z.array(z.string()).optional(),
  canDeleteActuals: z.boolean().optional(),
});

const userInclude = {
  role: true,
  costCenters: { include: { costCenter: { include: { unit: true } } } },
};

function serialize(u: any) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    status: u.status,
    role: u.role.code,
    roleName: u.role.name,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    canDeleteActuals: u.canDeleteActuals,
    costCenters: u.costCenters.map((c: any) => ({
      id: c.costCenter.id,
      costCode: c.costCenter.costCode,
      costCentre: c.costCenter.costCentre,
      unit: c.costCenter.unit.code,
    })),
  };
}

router.use(authenticate, authorize('SUPER_ADMIN'));

router.get(
  '/',
  validate({ query: listQuerySchema.extend({ role: roleCode.optional() }) }),
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query, 'createdAt');
    const where = {
      deletedAt: null,
      ...(req.query.status ? { status: req.query.status as 'ACTIVE' | 'INACTIVE' } : {}),
      ...(req.query.role ? { role: { code: req.query.role as any } } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' as const } },
              { username: { contains: q.search, mode: 'insensitive' as const } },
              { email: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, skip: q.skip, take: q.take, orderBy: { [q.sortBy ?? 'createdAt']: q.sortDir }, include: userInclude }),
      prisma.user.count({ where }),
    ]);
    return paginated(res, rows.map(serialize), buildPaginationMeta(q.page, q.pageSize, total));
  }),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null }, include: userInclude });
    if (!user) throw new NotFoundError('User not found');
    return success(res, serialize(user));
  }),
);

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const { password, role, costCenterIds, ...rest } = req.body;
    const roleRow = await prisma.role.findUniqueOrThrow({ where: { code: role } });
    const user = await prisma.user.create({
      data: {
        ...rest,
        email: rest.email.toLowerCase(),
        passwordHash: await hashPassword(password),
        roleId: roleRow.id,
        costCenters: costCenterIds?.length
          ? { create: costCenterIds.map((id: string) => ({ costCenterId: id })) }
          : undefined,
      },
      include: userInclude,
    });
    await auditFromRequest(req, { action: 'CREATE', module: 'USER', entityType: 'User', entityId: user.id, metadata: { role, costCenterIds } });
    return success(res, serialize(user), 201);
  }),
);

router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const { password, role, costCenterIds, ...rest } = req.body;
    const data: Record<string, unknown> = { ...rest };
    if (rest.email) data.email = rest.email.toLowerCase();
    if (password) data.passwordHash = await hashPassword(password);
    if (role) {
      const roleRow = await prisma.role.findUniqueOrThrow({ where: { code: role } });
      data.roleId = roleRow.id;
    }

    const targetRole = role ?? (await prisma.user.findUniqueOrThrow({ where: { id: req.params.id }, include: { role: true } })).role.code;
    if (costCenterIds !== undefined) {
      if (targetRole === 'USER_MASTER' && costCenterIds.length === 0) {
        throw new BadRequestError('User Master role requires at least one assigned cost center');
      }
      await prisma.userCostCenter.deleteMany({ where: { userId: req.params.id } });
      if (costCenterIds.length) {
        await prisma.userCostCenter.createMany({ data: costCenterIds.map((id: string) => ({ userId: req.params.id, costCenterId: id })) });
      }
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data, include: userInclude });
    await auditFromRequest(req, { action: 'UPDATE', module: 'USER', entityType: 'User', entityId: user.id, metadata: { role, costCenterIds } });
    return success(res, serialize(user));
  }),
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw new BadRequestError('You cannot delete your own account');
    await prisma.user.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await prisma.refreshToken.updateMany({ where: { userId: req.params.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await auditFromRequest(req, { action: 'DELETE', module: 'USER', entityType: 'User', entityId: req.params.id });
    return success(res, { message: 'User deleted' });
  }),
);

export default router;
