import { z } from 'zod';

export const actualRowSchema = z.object({
  date: z.coerce.date(),
  costCenterId: z.string().min(1),
  actualCount: z.coerce.number().int().min(0, 'Actual count cannot be negative'),
  remarks: z.string().max(500).optional().nullable(),
});

export const createActualSchema = actualRowSchema;
export const updateActualSchema = z.object({
  actualCount: z.coerce.number().int().min(0).optional(),
  remarks: z.string().max(500).optional().nullable(),
});

export const bulkActualSchema = z.object({ rows: z.array(actualRowSchema).min(1).max(5000) });

export const actualGridQuery = z.object({
  date: z.coerce.date(),
  unitId: z.string().optional(),
});

export const actualListQuery = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  unitId: z.string().optional(),
  costCenterId: z.string().optional(),
});
