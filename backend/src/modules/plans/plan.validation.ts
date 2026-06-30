import { z } from 'zod';

export const manpowerType = z.enum(['MALE', 'FEMALE', 'SKILLED', 'SEMI_SKILLED', 'UNSKILLED', 'STAFF', 'GENERAL']);

export const planRowSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  unitId: z.string().min(1),
  costCenterId: z.string().min(1),
  vendorId: z.string().min(1),
  genderOrType: manpowerType,
  plannedCount: z.coerce.number().int().min(0),
  remarks: z.string().max(500).optional().nullable(),
});

export const createPlanSchema = planRowSchema;
export const updatePlanSchema = z.object({
  plannedCount: z.coerce.number().int().min(0).optional(),
  remarks: z.string().max(500).optional().nullable(),
  vendorId: z.string().optional(),
  genderOrType: manpowerType.optional(),
});

export const bulkPlanSchema = z.object({ rows: z.array(planRowSchema).min(1).max(2000) });

export const duplicateSchema = z.object({
  fromYear: z.coerce.number().int(),
  fromMonth: z.coerce.number().int().min(1).max(12),
  toYear: z.coerce.number().int(),
  toMonth: z.coerce.number().int().min(1).max(12),
});

export const approvalSchema = z.object({ remarks: z.string().max(500).optional() });
export const rejectSchema = z.object({ remarks: z.string().min(1, 'Rejection remarks are required').max(500) });

export const planListQuery = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  year: z.coerce.number().optional(),
  month: z.coerce.number().optional(),
  unitId: z.string().optional(),
  costCenterId: z.string().optional(),
  vendorId: z.string().optional(),
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
});
