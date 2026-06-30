import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().min(1) });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(500).optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const masterStatus = z.enum(['ACTIVE', 'INACTIVE']);
