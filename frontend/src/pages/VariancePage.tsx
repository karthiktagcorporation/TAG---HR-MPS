import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, TrendingUp, Users, UserCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { PeriodFilters, PeriodValue } from '@/components/PeriodFilters';
import { KpiCard } from '@/components/KpiCard';
import { DataTable, Column } from '@/components/DataTable';
import { ExportActions } from '@/components/ExportActions';
import { Badge, Card } from '@/components/ui';
import { dashboardApi, reportApi } from '@/services/resources';
import { MONTHS } from '@/lib/utils';

export default function VariancePage() {
  const now = new Date();
  const [period, setPeriod] = useState<PeriodValue>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const params = useMemo(
    () => ({ year: period.year, month: period.month, unitId: period.unitId, costCenterId: period.costCenterId }),
    [period],
  );

  const { data: dash } = useQuery({ queryKey: ['variance-kpi', params], queryFn: () => dashboardApi.full(params) });
  const { data: report, isLoading } = useQuery({ queryKey: ['variance-report', params], queryFn: () => reportApi.build('cost-center', params) });

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
        actions={<ExportActions filename="variance" title="Variance Analysis" columns={report?.columns ?? []} rows={report?.rows ?? []} filterSummary={`${MONTHS[period.month - 1]} ${period.year}`} disabled={!report?.rows.length} />}
      />

      <FilterBar>
        <PeriodFilters value={period} onChange={setPeriod} show={{ unit: true, costCenter: true }} />
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
