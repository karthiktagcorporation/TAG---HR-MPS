import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { DataTable, Column } from '@/components/DataTable';
import { Badge, Card, Input, Select } from '@/components/ui';
import { auditApi } from '@/services/resources';

interface AuditRow {
  id: string; action: string; module: string; entityType?: string; entityId?: string;
  ipAddress?: string; createdAt: string; user?: { name: string; username: string };
}

const MODULES = ['AUTH', 'USER', 'VENDOR', 'UNIT', 'DEPARTMENT', 'COST_CENTER', 'PLAN', 'ACTUAL', 'REPORT', 'SETTINGS'];

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [dateFrom, setDateFrom] = useState('');

  const params = useMemo(
    () => ({ page, pageSize: 15, search: search || undefined, module: module || undefined, dateFrom: dateFrom || undefined }),
    [page, search, module, dateFrom],
  );

  const { data, isLoading } = useQuery({ queryKey: ['audit', params], queryFn: () => auditApi.list(params) });

  const columns: Column<AuditRow>[] = [
    { key: 'createdAt', header: 'Timestamp', render: (r) => dayjs(r.createdAt).format('DD-MM-YYYY HH:mm:ss') },
    { key: 'user', header: 'User', render: (r) => r.user?.name ?? 'System' },
    { key: 'action', header: 'Action', render: (r) => <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{r.action}</Badge> },
    { key: 'module', header: 'Module' },
    { key: 'entityType', header: 'Entity', render: (r) => r.entityType ?? '—' },
    { key: 'ipAddress', header: 'IP', render: (r) => r.ipAddress ?? '—' },
  ];

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="System-wide activity trail" breadcrumbs={['Administration', 'Audit Logs']} />
      <FilterBar search={search} onSearch={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search action / module / entity...">
        <Select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }} className="w-44">
          <option value="">All Modules</option>
          {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-44" />
      </FilterBar>
      <Card>
        <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} meta={data?.meta} onPageChange={setPage} emptyTitle="No audit logs" />
      </Card>
    </div>
  );
}
