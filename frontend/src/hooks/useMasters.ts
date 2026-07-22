import { useQuery } from '@tanstack/react-query';
import { categoryApi, costCenterApi, unitApi, vendorApi } from '@/services/resources';

export function useUnits() {
  return useQuery({
    queryKey: ['units', 'all'],
    queryFn: () => unitApi.list({ pageSize: 200, status: 'ACTIVE' }),
    select: (r) => r.data,
    staleTime: 5 * 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => categoryApi.list({ pageSize: 200, status: 'ACTIVE' }),
    select: (r) => r.data,
    staleTime: 5 * 60_000,
  });
}

export function useVendors() {
  return useQuery({
    queryKey: ['vendors', 'all'],
    queryFn: () => vendorApi.list({ pageSize: 500, status: 'ACTIVE' }),
    select: (r) => r.data,
    staleTime: 5 * 60_000,
  });
}

export function useCostCenters(unitId?: string) {
  return useQuery({
    queryKey: ['cost-centers', 'all', unitId ?? 'any'],
    queryFn: () => costCenterApi.list({ pageSize: 500, status: 'ACTIVE', ...(unitId ? { unitId } : {}) }),
    select: (r) => r.data,
    staleTime: 5 * 60_000,
  });
}
