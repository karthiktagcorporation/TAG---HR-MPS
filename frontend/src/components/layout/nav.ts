import {
  LayoutDashboard,
  Building2,
  Boxes,
  Tags,
  Network,
  ClipboardList,
  CalendarCheck,
  CalendarDays,
  CalendarX2,
  GitCompareArrows,
  FileBarChart,
  Users,
  Bell,
  ScrollText,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { RoleCode } from '@/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: RoleCode[];
  section: string;
}

const ALL: RoleCode[] = ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'USER_MASTER'];

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: ALL, section: 'Overview' },

  { label: 'Manpower Plan', to: '/plans', icon: ClipboardList, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'], section: 'Operations' },
  { label: 'Daily Actual', to: '/actuals', icon: CalendarCheck, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER'], section: 'Operations' },
  { label: 'Variance Analysis', to: '/variance', icon: GitCompareArrows, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'], section: 'Operations' },
  { label: 'Missing Entries', to: '/missing-entries', icon: CalendarX2, roles: ALL, section: 'Operations' },
  { label: 'Reports', to: '/reports', icon: FileBarChart, roles: ALL, section: 'Operations' },

  { label: 'Vendors', to: '/masters/vendors', icon: Building2, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'], section: 'Masters' },
  { label: 'Units', to: '/masters/units', icon: Boxes, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'], section: 'Masters' },
  { label: 'Categories', to: '/masters/categories', icon: Tags, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'], section: 'Masters' },
  { label: 'Cost Centers', to: '/masters/cost-centers', icon: Network, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'], section: 'Masters' },
  { label: 'Calendar', to: '/masters/calendar', icon: CalendarDays, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT'], section: 'Masters' },

  { label: 'Users', to: '/admin/users', icon: Users, roles: ['SUPER_ADMIN'], section: 'Administration' },
  { label: 'Notifications', to: '/notifications', icon: Bell, roles: ALL, section: 'Administration' },
  { label: 'Audit Logs', to: '/admin/audit-logs', icon: ScrollText, roles: ['SUPER_ADMIN'], section: 'Administration' },
  { label: 'Settings', to: '/settings', icon: Settings, roles: ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'USER_MASTER'], section: 'Administration' },
];

export function navForRole(role: RoleCode): Record<string, NavItem[]> {
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role));
  return items.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.section] ??= []).push(item);
    return acc;
  }, {});
}
