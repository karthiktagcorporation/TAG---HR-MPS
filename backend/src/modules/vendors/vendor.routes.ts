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
import { NotFoundError } from '../../utils/errors';

const router = Router();

const createSchema = z.object({
  vendorCode: z.string().min(1).max(30),
  vendorName: z.string().min(1).max(150),
  contactPerson: z.string().max(120).optional().nullable(),
  mobileNumber: z.string().max(20).optional().nullable(),
  gstNumber: z.string().max(20).optional().nullable(),
  status: masterStatus.optional(),
});
const updateSchema = createSchema.partial();

router.use(authenticate);

// List (all authenticated users may read masters for dropdowns)
router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = parseListQuery(req.query);
    const where = {
      deletedAt: null,
      ...(req.query.status ? { status: req.query.status as 'ACTIVE' | 'INACTIVE' } : {}),
      ...(q.search
        ? {
            OR: [
              { vendorName: { contains: q.search, mode: 'insensitive' as const } },
              { vendorCode: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.vendor.findMany({ where, skip: q.skip, take: q.take, orderBy: { [q.sortBy ?? 'vendorName']: q.sortDir } }),
      prisma.vendor.count({ where }),
    ]);
    return paginated(res, rows, buildPaginationMeta(q.page, q.pageSize, total));
  }),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!vendor) throw new NotFoundError('Vendor not found');
    return success(res, vendor);
  }),
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.create({ data: req.body });
    await auditFromRequest(req, { action: 'CREATE', module: 'VENDOR', entityType: 'Vendor', entityId: vendor.id, metadata: req.body });
    return success(res, vendor, 201);
  }),
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'HR_ADMIN'),
  validate({ params: idParamSchema, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data: req.body });
    await auditFromRequest(req, { action: 'UPDATE', module: 'VENDOR', entityType: 'Vendor', entityId: vendor.id, metadata: req.body });
    return success(res, vendor);
  }),
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await prisma.vendor.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await auditFromRequest(req, { action: 'DELETE', module: 'VENDOR', entityType: 'Vendor', entityId: req.params.id });
    return success(res, { message: 'Vendor deleted' });
  }),
);

export default router;
