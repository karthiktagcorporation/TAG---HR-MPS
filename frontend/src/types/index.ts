export type RoleCode = 'SUPER_ADMIN' | 'HR_ADMIN' | 'MANAGEMENT' | 'USER_MASTER';
export type MasterStatus = 'ACTIVE' | 'INACTIVE';
export type PlanStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: RoleCode;
  costCenterIds: string[];
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Vendor {
  id: string;
  vendorCode: string;
  vendorName: string;
  contactPerson?: string | null;
  mobileNumber?: string | null;
  gstNumber?: string | null;
  status: MasterStatus;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  status: MasterStatus;
}

export interface CostCenter {
  id: string;
  costCode: string;
  costCentre: string;
  unitId: string;
  status: MasterStatus;
  unit?: Unit;
}

export interface ManpowerPlan {
  id: string;
  year: number;
  month: number;
  unitId: string;
  costCenterId: string;
  plannedCount: number;
  remarks?: string | null;
  status: PlanStatus;
  approvedAt?: string | null;
  rejectionRemarks?: string | null;
  unit?: Unit;
  costCenter?: CostCenter;
  createdBy?: { id: string; name: string };
  approvedBy?: { id: string; name: string } | null;
}

/** One row of the plan grid editor: a cost center + its plan for the month (if any). */
export interface PlanGridRow {
  costCenterId: string;
  unit: string;
  unitId: string;
  costCode: string;
  costCentre: string;
  planId: string | null;
  plannedCount: number | null;
  remarks: string | null;
  status: PlanStatus | null;
  approvedBy: string | null;
  rejectionRemarks: string | null;
}

export interface ManpowerActual {
  id: string;
  date: string;
  unitId: string;
  costCenterId: string;
  actualCount: number;
  shortage: number;
  excess: number;
  remarks?: string | null;
  unit?: Unit;
  costCenter?: CostCenter;
}

/** One row of the daily actual grid: a cost center + plan + entry for the date (if any). */
export interface ActualGridRow {
  costCenterId: string;
  unit: string;
  unitId: string;
  costCode: string;
  costCentre: string;
  planned: number;
  actualId: string | null;
  actualCount: number | null;
  shortage: number | null;
  excess: number | null;
  remarks: string | null;
}

export interface DashboardData {
  kpis: {
    totalPlanned: number;
    totalActual: number;
    shortage: number;
    excess: number;
    vendorCount: number;
    unitCount: number;
    attendancePercent: number;
    pendingApprovals: number;
  };
  charts: {
    planVsActual: { label: string; name: string; planned: number; actual: number }[];
    costCenterAnalysis: { label: string; name: string; actual: number; shortage: number; excess: number }[];
    planVsActualByCostCenter: { label: string; name: string; planned: number; actual: number }[];
    monthlyTrend: { label: string; planned: number }[];
    dailyAttendanceTrend: { date: string; actual: number; shortage: number; excess: number }[];
  };
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportResult {
  type: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}
