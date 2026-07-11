import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute, RoleRoute } from './guards';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import VendorsPage from '@/pages/masters/VendorsPage';
import UnitsPage from '@/pages/masters/UnitsPage';
import CostCentersPage from '@/pages/masters/CostCentersPage';
import PlansPage from '@/pages/PlansPage';
import ActualsPage from '@/pages/ActualsPage';
import VariancePage from '@/pages/VariancePage';
import ReportsPage from '@/pages/ReportsPage';
import UsersPage from '@/pages/admin/UsersPage';
import AuditLogsPage from '@/pages/admin/AuditLogsPage';
import NotificationsPage from '@/pages/NotificationsPage';
import SettingsPage from '@/pages/SettingsPage';
import NotFoundPage from '@/pages/NotFoundPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'plans', element: <RoleRoute roles={['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT']}><PlansPage /></RoleRoute> },
      { path: 'actuals', element: <RoleRoute roles={['SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER']}><ActualsPage /></RoleRoute> },
      { path: 'variance', element: <RoleRoute roles={['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT']}><VariancePage /></RoleRoute> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'masters/vendors', element: <RoleRoute roles={['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT']}><VendorsPage /></RoleRoute> },
      { path: 'masters/units', element: <RoleRoute roles={['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT']}><UnitsPage /></RoleRoute> },
      { path: 'masters/cost-centers', element: <RoleRoute roles={['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT']}><CostCentersPage /></RoleRoute> },
      { path: 'admin/users', element: <RoleRoute roles={['SUPER_ADMIN']}><UsersPage /></RoleRoute> },
      { path: 'admin/audit-logs', element: <RoleRoute roles={['SUPER_ADMIN']}><AuditLogsPage /></RoleRoute> },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
