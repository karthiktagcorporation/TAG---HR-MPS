import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** App-wide standard date format: DD/MM/YYYY. Accepts Date, ISO string or YYYY-MM-DD. */
export function formatDate(d: Date | string | null | undefined) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  if (Number.isNaN(dt.getTime())) return String(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

export function formatNumber(n: number | null | undefined) {
  return new Intl.NumberFormat('en-IN').format(n ?? 0);
}

export function classForStatus(status: string) {
  switch (status) {
    case 'APPROVED':
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'PENDING':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    case 'REJECTED':
    case 'INACTIVE':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}
