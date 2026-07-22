import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { TrendingDown, TrendingUp, Users, UserCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { PeriodFilters, PeriodValue } from '@/components/PeriodFilters';
import { KpiCard } from '@/components/KpiCard';
import { DataTable, Column } from '@/components/DataTable';
import { ExportActions } from '@/components/ExportActions';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { dashboardApi, reportApi } from '@/services/resources';
import { MONTHS, formatDate } from '@/lib/utils';

export default function VariancePage() {
  const now = new Date();
  const [period, setPeriod] = useState<PeriodValue>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  // Optional single-date view: plan narrows to that day's plan, actuals for that day only
  const [date, setDate] = useState('');
  const [shift, setShift] = useState<'' | 'DAY' | 'NIGHT'>('');

  const dashParams = useMemo(
    () => ({ year: period.year, month: period.month, date: date || undefined, unitId: period.unitId, costCenterId: period.costCenterId, categoryId: period.categoryId, shift: shift || undefined }),
    [period, date, shift],
  );
  const reportParams = useMemo(
    () =>
      date
        ? { year: period.year, month: period.month, dateFrom: date, dateTo: date, unitId: period.unitId, costCenterId: period.costCenterId, categoryId: period.categoryId, shift: shift || undefined }
        : { year: period.year, month: period.month, unitId: period.unitId, costCenterId: period.costCenterId, categoryId: period.categoryId, shift: shift || undefined },
    [period, date, shift],
  );

  const { data: dash } = useQuery({ queryKey: ['variance-kpi', dashParams], queryFn: () => dashboardApi.full(dashParams) });
  const { data: report, isLoading } = useQuery({ queryKey: ['variance-report', reportParams], queryFn: () => reportApi.build('cost-center', reportParams) });

  const columns: Column<Record<string, unknown>>[] = (report?.columns ?? []).map((c) => ({
    key: c.key,
    header: c.label,
    align: ['actual', 'shortage', 'excess'].includes(c.key) ? 'right' : 'left',
    render: c.key === 'shortage'
      ? (r) => (Number(r.shortage) > 0 ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{String(r.shortage)}</Badge> : '—')
      : c.key === 'excess'
        ? (r) => (Number(r.excess) > 0 ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{String(r.excess)}</Badge> : '—')
        : undefined,
  }));

  return (
    <div>
      <PageHeader
        title="Variance Analysis"
        subtitle="Planned vs Actual shortage / excess by cost center"
        breadcrumbs={['Operations', 'Variance']}
        actions={<ExportActions filename="variance" title="Variance Analysis" columns={report?.columns ?? []} rows={report?.rows ?? []} filterSummary={date ? formatDate(date) : `${MONTHS[period.month - 1]} ${period.year}`} disabled={!report?.rows.length} />}
      />

      <FilterBar>
        <PeriodFilters value={period} onChange={(v) => { setPeriod(v); }} show={{ unit: true, costCenter: true, category: true }} />
        <Select value={shift} onChange={(e) => setShift(e.target.value as '' | 'DAY' | 'NIGHT')} className="w-36">
          <option value="">All Shift</option>
          <option value="DAY">Day Shift</option>
          <option value="NIGHT">Night Shift</option>
        </Select>
        <Input type="date" value={date} title="Single-date view (clear to see the full month)" onChange={(e) => setDate(e.target.value)} className="w-40" />
        {date && <Button variant="outline" size="sm" onClick={() => setDate('')}>Clear Date</Button>}
      </FilterBar>

      {dash && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard index={0} label="Planned" value={dash.kpis.totalPlanned} icon={Users} tone="brand" />
          <KpiCard index={1} label="Actual" value={dash.kpis.totalActual} icon={UserCheck} tone="green" />
          <KpiCard index={2} label="Shortage" value={dash.kpis.shortage} icon={TrendingDown} tone="red" />
          <KpiCard index={3} label="Excess" value={dash.kpis.excess} icon={TrendingUp} tone="accent" />
        </div>
      )}

      <Card>
        <DataTable columns={columns} data={report?.rows ?? []} loading={isLoading} rowKey={(_, i) => String(i)} emptyTitle="No variance data" />
      </Card>
    </div>
  );
}
