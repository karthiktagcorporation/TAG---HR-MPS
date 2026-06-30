import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function success<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function paginated<T>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
  extra?: Record<string, unknown>,
) {
  return res.status(200).json({ success: true, data, meta, ...(extra ? { filters: extra } : {}) });
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface ListQuery {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  search?: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

export function parseListQuery(query: Record<string, unknown>, defaultSortBy = 'createdAt'): ListQuery {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(query.pageSize) || 25));
  const sortDir = String(query.sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    search: query.search ? String(query.search).trim() : undefined,
    sortBy: query.sortBy ? String(query.sortBy) : defaultSortBy,
    sortDir,
  };
}
