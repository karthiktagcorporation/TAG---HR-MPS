import { z } from 'zod';

export const gridRowSchema = z.object({
  costCenterId: z.string().min(1),
  dayPlan: z.coerce.number().int().min(0).default(0),
  nightPlan: z.coerce.number().int().min(0).default(0),
  remarks: z.string().max(500).optional().nullable(),
});

export const saveGridSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  rows: z.array(gridRowSchema).min(1).max(2000),
  // Mid-month plan change: new quantities apply from this date (default: the 1st)
  effectiveFrom: z.coerce.date().optional(),
});

export const gridQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  unitId: z.string().optional(),
  categoryId: z.string().optional(),
});

export const duplicateSchema = z.object({
  fromYear: z.coerce.number().int(),
  fromMonth: z.coerce.number().int().min(1).max(12),
  toYear: z.coerce.number().int(),
  toMonth: z.coerce.number().int().min(1).max(12),
});

export const approvalSchema = z.object({ remarks: z.string().max(500).optional() });
export const rejectSchema = z.object({ remarks: z.string().min(1, 'Rejection remarks are required').max(500) });

export const monthActionSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  remarks: z.string().max(500).optional(),
});

export const planListQuery = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  year: z.coerce.number().optional(),
  month: z.coerce.number().optional(),
  unitId: z.string().optional(),
  costCenterId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
});
