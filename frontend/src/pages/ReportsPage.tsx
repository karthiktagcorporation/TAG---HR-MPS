import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, Download } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { DataTable, Column } from '@/components/DataTable';
import { PeriodFilters, PeriodValue } from '@/components/PeriodFilters';
import { ExportActions } from '@/components/ExportActions';
import { Button, Card, Select } from '@/components/ui';
import { ErrorState } from '@/components/States';
import { reportApi } from '@/services/resources';
import { tokenStore } from '@/services/api';
import { apiErrorMessage } from '@/services/api';
import { MONTHS } from '@/lib/utils';

export default function ReportsPage() {
  const now = new Date();
  const [type, setType] = useState('consolidated');
  const [period, setPeriod] = useState<PeriodValue>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [search, setSearch] = useState('');

  const { data: defs = [] } = useQuery({ queryKey: ['report-defs'], queryFn: () => reportApi.definitions() });

  const params = useMemo(
    () => ({ year: period.year, month: period.month, unitId: period.unitId, costCenterId: period.costCenterId, vendorId: period.vendorId, search: search || undefined }),
    [period, search],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['report', type, params],
    queryFn: () => reportApi.build(type, params),
  });

  const columns: Column<Record<string, unknown>>[] = (data?.columns ?? []).map((c) => ({
    key: c.key,
    header: c.label,
    align: ['actual', 'shortage', 'excess', 'planned'].includes(c.key) ? 'right' : 'left',
  }));

  const filterSummary = `Period: ${MONTHS[period.month - 1]} ${period.year}`;

  const downloadServerXlsx = () => {
    // Server-side branded export (authenticated fetch → blob)
    const stringParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
    );
    fetch(reportApi.exportXlsxUrl(type, stringParams), {
      headers: { Authorization: `Bearer ${tokenStore.access}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}-${Date.now()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Filterable, sortable, exportable manpower reports"
        breadcrumbs={['Operations', 'Reports']}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportActions filename={type} title={data?.title ?? 'Report'} columns={data?.columns ?? []} rows={data?.rows ?? []} filterSummary={filterSummary} disabled={!data?.rows.length} />
            <Button variant="primary" onClick={downloadServerXlsx} disabled={!data?.rows.length}>
              <Download className="h-4 w-4" /> Server XLSX
            </Button>
          </div>
        }
      />

      <FilterBar search={search} onSearch={setSearch} searchPlaceholder="Search within report...">
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-56">
          {defs.map((d) => <option key={d.type} value={d.type}>{d.title}</option>)}
        </Select>
        <PeriodFilters value={period} onChange={setPeriod} show={{ unit: true, costCenter: true, vendor: true }} />
      </FilterBar>

      <Card>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <FileBarChart className="h-4 w-4 text-brand-600" />
          <span className="font-semibold">{data?.title ?? 'Report'}</span>
          {data && <span className="text-sm text-muted-foreground">· {data.rows.length} rows</span>}
        </div>
        {isError ? (
          <ErrorState message={apiErrorMessage(error)} onRetry={() => refetch()} />
        ) : (
          <DataTable columns={columns} data={data?.rows ?? []} loading={isLoading} rowKey={(_, i) => String(i)} emptyTitle="No data for the selected filters" />
        )}
      </Card>
    </div>
  );
}
