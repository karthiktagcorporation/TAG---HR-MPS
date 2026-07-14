import { z } from 'zod';

export const vendorAllocationSchema = z.object({
  vendorId: z.string().min(1),
  male: z.coerce.number().int().min(0).default(0),
  female: z.coerce.number().int().min(0).default(0),
});

export const actualRowSchema = z.object({
  date: z.coerce.date(),
  costCenterId: z.string().min(1),
  remarks: z.string().max(500).optional().nullable(),
  dayVendors: z.array(vendorAllocationSchema).max(50).default([]),
  nightVendors: z.array(vendorAllocationSchema).max(50).default([]),
});

export const createActualSchema = actualRowSchema;
export const updateActualSchema = z.object({
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
