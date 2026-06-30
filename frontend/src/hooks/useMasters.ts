import { useQuery } from '@tanstack/react-query';
import { costCenterApi, departmentApi, unitApi, vendorApi } from '@/services/resources';

export function useUnits() {
  return useQuery({
    queryKey: ['units', 'all'],
    queryFn: () => unitApi.list({ pageSize: 200, status: 'ACTIVE' }),
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

export function useDepartments() {
  return useQuery({
    queryKey: ['departments', 'all'],
    queryFn: () => departmentApi.list({ pageSize: 200, status: 'ACTIVE' }),
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
