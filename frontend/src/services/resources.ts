import { api } from './api';
import type {
  AuthUser,
  CostCenter,
  DashboardData,
  Department,
  LoginResponse,
  ManpowerActual,
  ManpowerPlan,
  PaginationMeta,
  ReportResult,
  Unit,
  Vendor,
} from '@/types';

export interface ListResult<T> {
  data: T[];
  meta: PaginationMeta;
}

async function list<T>(url: string, params?: Record<string, unknown>): Promise<ListResult<T>> {
  const res = await api.get(url, { params });
  return { data: res.data.data, meta: res.data.meta };
}

// ---- Auth ----
export const authApi = {
  login: (identifier: string, password: string) =>
    api.post<{ data: LoginResponse }>('/auth/login', { identifier, password }).then((r) => r.data.data),
  me: () => api.get('/auth/me').then((r) => r.data.data as AuthUser & { roleName: string; costCenters: any[] }),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),
};

// ---- Generic master CRUD factory ----
function crud<T>(base: string) {
  return {
    list: (params?: Record<string, unknown>) => list<T>(base, params),
    get: (id: string) => api.get(`${base}/${id}`).then((r) => r.data.data as T),
    create: (body: Partial<T>) => api.post(base, body).then((r) => r.data.data as T),
    update: (id: string, body: Partial<T>) => api.put(`${base}/${id}`, body).then((r) => r.data.data as T),
    remove: (id: string) => api.delete(`${base}/${id}`).then((r) => r.data),
  };
}

export const vendorApi = crud<Vendor>('/vendors');
export const unitApi = crud<Unit>('/units');
export const departmentApi = crud<Department>('/departments');
export const costCenterApi = crud<CostCenter>('/cost-centers');
export const userApi = crud<any>('/users');
export const rolesApi = { list: () => api.get('/roles').then((r) => r.data.data) };

// ---- Plans ----
export const planApi = {
  ...crud<ManpowerPlan>('/plans'),
  pending: () => list<ManpowerPlan>('/plans/pending'),
  submit: (id: string) => api.post(`/plans/${id}/submit`).then((r) => r.data.data),
  approve: (id: string, remarks?: string) => api.post(`/plans/${id}/approve`, { remarks }).then((r) => r.data.data),
  reject: (id: string, remarks: string) => api.post(`/plans/${id}/reject`, { remarks }).then((r) => r.data.data),
  bulk: (rows: unknown[]) => api.post('/plans/bulk', { rows }).then((r) => r.data.data),
  duplicate: (body: { fromYear: number; fromMonth: number; toYear: number; toMonth: number }) =>
    api.post('/plans/duplicate', body).then((r) => r.data.data),
};

// ---- Actuals ----
export const actualApi = {
  list: (params?: Record<string, unknown>) => list<ManpowerActual>('/actuals', params),
  save: (body: Partial<ManpowerActual>) => api.post('/actuals', body).then((r) => r.data.data as ManpowerActual),
  update: (id: string, body: Partial<ManpowerActual>) => api.put(`/actuals/${id}`, body).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/actuals/${id}`).then((r) => r.data),
  bulk: (rows: unknown[]) => api.post('/actuals/bulk', { rows }).then((r) => r.data.data),
};

// ---- Dashboard ----
export const dashboardApi = {
  full: (params?: Record<string, unknown>) => api.get('/dashboard', { params }).then((r) => r.data.data as DashboardData),
};

// ---- Reports ----
export const reportApi = {
  definitions: () => api.get('/reports').then((r) => r.data.data as { type: string; title: string }[]),
  build: (type: string, params?: Record<string, unknown>) =>
    api.get(`/reports/${type}`, { params }).then((r) => r.data.data as ReportResult),
  exportXlsxUrl: (type: string, params: Record<string, unknown>) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return `${api.defaults.baseURL}/reports/${type}/export.xlsx?${qs}`;
  },
};

// ---- Notifications ----
export const notificationApi = {
  list: (unread = false) => api.get('/notifications', { params: { unread } }).then((r) => r.data.data),
  markRead: (id: string) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/notifications/read-all').then((r) => r.data),
};

// ---- Audit logs ----
export const auditApi = {
  list: (params?: Record<string, unknown>) => list<any>('/audit-logs', params),
};

// ---- Settings ----
export const settingsApi = {
  all: () => api.get('/settings').then((r) => r.data.data as Record<string, any>),
  update: (key: string, value: unknown) => api.put(`/settings/${key}`, { value }).then((r) => r.data.data),
};
