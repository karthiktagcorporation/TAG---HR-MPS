import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { CalendarX2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { KpiCard } from '@/components/KpiCard';
import { DataTable, Column } from '@/components/DataTable';
import { ExportActions } from '@/components/ExportActions';
import { Badge, Card, Input, Select } from '@/components/ui';
import { reportApi } from '@/services/resources';
import { useUnits, useCostCenters } from '@/hooks/useMasters';
import { MONTHS, formatDate } from '@/lib/utils';

export default function MissingEntriesPage() {
  const today = dayjs().format('YYYY-MM-DD');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [unitId, setUnitId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [search, setSearch] = useState('');
  const { data: units = [] } = useUnits();
  const { data: costCenters = [] } = useCostCenters(unitId || undefined);

  // Month quick-pick: sets the from/to range to that whole month (capped at today)
  const [month, setMonth] = useState('');
  const pickMonth = (value: string) => {
    setMonth(value);
    if (!value) return;
    const [y, m] = value.split('-').map(Number);
    const start = dayjs(new Date(y, m - 1, 1));
    const end = start.endOf('month');
    setDateFrom(start.format('YYYY-MM-DD'));
    setDateTo((end.isAfter(dayjs()) ? dayjs() : end).format('YYYY-MM-DD'));
  };
  // Last 12 months as quick-pick options
  const monthOptions = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, 'month')).map((d) => ({
    value: d.format('YYYY-M'),
    label: `${MONTHS[d.month()]} ${d.year()}`,
  }));

  const params = useMemo(
    () => ({ dateFrom, dateTo, unitId: unitId || undefined, costCenterId: costCenterId || undefined, search: search || undefined }),
    [dateFrom, dateTo, unitId, costCenterId, search],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['missing-entries', params],
    queryFn: () => reportApi.build('missing-entries', params),
  });

  const columns: Column<Record<string, unknown>>[] = (data?.columns ?? []).map((c) => ({
    key: c.key,
    header: c.label,
    align: c.key === 'planned' ? 'right' : 'left',
    render:
      c.key === 'actual'
        ? () => <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Not Entered</Badge>
        : c.key === 'shift'
          ? (r) => (
              <Badge className={r.shift === 'Day' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'}>
                {String(r.shift)}
              </Badge>
            )
          : undefined,
  }));

  return (
    <div>
      <PageHeader
        title="Missing Entries"
        subtitle="Cost centers with a plan for the day but no daily actual entered yet"
        breadcrumbs={['Operations', 'Missing Entries']}
        actions={<ExportActions filename="missing-entries" title="Missing Daily Actual Entries" columns={data?.columns ?? []} rows={data?.rows ?? []} filterSummary={`Range: ${formatDate(dateFrom)} - ${formatDate(dateTo)}`} disabled={!data?.rows.length} />}
      />

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search unit, cost centre...">
        <Select value={month} onChange={(e) => pickMonth(e.target.value)} className="w-44" title="Quick-pick a whole month">
          <option value="">Select Month...</option>
          {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">From</span>
          <Input type="date" value={dateFrom} max={dateTo} onChange={(e) => { setDateFrom(e.target.value); setMonth(''); }} className="w-40" />
          <span className="text-sm text-muted-foreground">To</span>
          <Input type="date" value={dateTo} min={dateFrom} max={today} onChange={(e) => { setDateTo(e.target.value); setMonth(''); }} className="w-40" />
        </div>
        <Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setCostCenterId(''); }} className="w-44">
          <option value="">All Units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
        </Select>
        <Select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className="w-56">
          <option value="">All Cost Centers</option>
          {costCenters.map((c) => <option key={c.id} value={c.id}>{c.costCode} — {c.costCentre}{c.department ? ` - ${c.department}` : ''}</option>)}
        </Select>
      </FilterBar>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:max-w-xs">
        <KpiCard
          index={0}
          label={dateFrom === dateTo ? `Pending Entries (${formatDate(dateFrom)})` : `Pending Entries (${formatDate(dateFrom)} - ${formatDate(dateTo)})`}
          value={data?.rows.length ?? 0}
          icon={CalendarX2}
          tone="red"
        />
      </div>

      <Card>
        <DataTable columns={columns} data={data?.rows ?? []} loading={isLoading} rowKey={(_, i) => String(i)} emptyTitle="All planned cost centers have entries for this date 🎉" />
      </Card>
    </div>
  );
}
