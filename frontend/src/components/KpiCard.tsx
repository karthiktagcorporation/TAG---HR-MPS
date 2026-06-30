import { motion } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';
import { Card } from './ui';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils';

const tones = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-100',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  accent: 'bg-orange-50 text-accent dark:bg-orange-900/30 dark:text-orange-300',
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  suffix,
  index = 0,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  suffix?: string;
  index?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">
              {typeof value === 'number' ? formatNumber(value) : value}
              {suffix && <span className="ml-1 text-base font-medium text-muted-foreground">{suffix}</span>}
            </p>
          </div>
          <div className={cn('rounded-xl p-2.5', tones[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
