import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { DataTable, Column } from '@/components/DataTable';
import { ExportActions } from '@/components/ExportActions';
import { Badge, Button, Card, Input, Label, Modal, Select, Textarea } from '@/components/ui';
import { MANPOWER_TYPES } from '@/lib/utils';
import { apiErrorMessage } from '@/services/api';
import { actualApi } from '@/services/resources';
import { useAuth } from '@/context/AuthContext';
import { useUnits, useVendors, useCostCenters } from '@/hooks/useMasters';
import type { ManpowerActual } from '@/types';

export default function ActualsPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [unitId, setUnitId] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: units = [] } = useUnits();

  const canEnter = hasRole('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER');
  const canDelete = hasRole('SUPER_ADMIN', 'HR_ADMIN');

  const params = useMemo(
    () => ({ dateFrom: date, dateTo: date, unitId: unitId || undefined, page, pageSize: 15 }),
    [date, unitId, page],
  );

  const { data, isLoading } = useQuery({ queryKey: ['actuals', params], queryFn: () => actualApi.list(params) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['actuals'] });

  const delMut = useMutation({
    mutationFn: (id: string) => actualApi.remove(id),
    onSuccess: () => { toast.success('Deleted'); invalidate(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const columns: Column<ManpowerActual>[] = [
    { key: 'unit', header: 'Unit', render: (r) => r.unit?.code ?? '—' },
    { key: 'cc', header: 'Cost Centre', render: (r) => r.costCenter?.costCentre ?? '—' },
    { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.vendorName ?? '—' },
    { key: 'type', header: 'Type' },
    { key: 'actualCount', header: 'Actual', align: 'right' },
    {
      key: 'shortage', header: 'Shortage', align: 'right',
      render: (r) => (r.shortage > 0 ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{r.shortage}</Badge> : '—'),
    },
    {
      key: 'excess', header: 'Excess', align: 'right',
      render: (r) => (r.excess > 0 ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{r.excess}</Badge> : '—'),
    },
    { key: 'remarks', header: 'Remarks' },
    ...(canDelete
      ? [{
          key: '_actions', header: '', align: 'right' as const,
          render: (r: ManpowerActual) => (
            <Button variant="ghost" size="icon" className="text-red-600" onClick={() => { if (confirm('Delete?')) delMut.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
          ),
        }]
      : []),
  ];

  const exportRows = (data?.data ?? []).map((r) => ({
    unit: r.unit?.code, costCentre: r.costCenter?.costCentre, vendor: r.vendor?.vendorName,
    type: r.type, actual: r.actualCount, shortage: r.shortage, excess: r.excess, remarks: r.remarks ?? '',
  }));

  return (
    <div>
      <PageHeader
        title="Daily Actual Entry"
        subtitle="Record daily actual manpower — variance is auto-calculated against the approved plan"
        breadcrumbs={['Operations', 'Daily Actual']}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportActions filename={`daily-actual-${date}`} title={`Daily Actual ${date}`} columns={[
              { key: 'unit', label: 'Unit' }, { key: 'costCentre', label: 'Cost Centre' }, { key: 'vendor', label: 'Vendor' },
              { key: 'type', label: 'Type' }, { key: 'actual', label: 'Actual' }, { key: 'shortage', label: 'Shortage' },
              { key: 'excess', label: 'Excess' }, { key: 'remarks', label: 'Remarks' },
            ]} rows={exportRows} disabled={!exportRows.length} filterSummary={`Date: ${date}`} />
            {canEnter && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add Entry</Button>}
          </div>
        }
      />

      <FilterBar>
        <div>
          <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} className="w-44" />
        </div>
        <Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setPage(1); }} className="w-44">
          <option value="">All Units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
        </Select>
      </FilterBar>

      <Card>
        <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} meta={data?.meta} onPageChange={setPage}
          emptyTitle="No entries for this date" emptyDescription="Add a daily actual entry to begin." />
      </Card>

      {createOpen && <EntryModal date={date} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); invalidate(); }} />}
    </div>
  );
}

function EntryModal({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { data: units = [] } = useUnits();
  const { data: vendors = [] } = useVendors();
  const [form, setForm] = useState({ date, unitId: '', costCenterId: '', vendorId: '', type: 'MALE', actualCount: 0, remarks: '' });
  const { data: allCostCenters = [] } = useCostCenters(form.unitId || undefined);

  // USER_MASTER is restricted to assigned cost centers (backend enforces; we also filter the dropdown)
  const costCenters = user?.role === 'USER_MASTER' && user.costCenterIds.length
    ? allCostCenters.filter((c) => user.costCenterIds.includes(c.id))
    : allCostCenters;

  const mut = useMutation({
    mutationFn: () => actualApi.save(form as never),
    onSuccess: () => { toast.success('Entry saved'); onSaved(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const submit = () => {
    if (!form.unitId || !form.costCenterId || !form.vendorId) return toast.error('Unit, cost center and vendor are required');
    if (form.actualCount < 0) return toast.error('Actual count cannot be negative');
    mut.mutate();
  };

  return (
    <Modal open onClose={onClose} title="Daily Actual Entry" size="lg">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div><Label>Type</Label><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{MANPOWER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
        <div><Label>Unit</Label><Select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value, costCenterId: '' })}><option value="">Select...</option>{units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}</Select></div>
        <div><Label>Cost Center</Label><Select value={form.costCenterId} onChange={(e) => setForm({ ...form, costCenterId: e.target.value })}><option value="">Select...</option>{costCenters.map((c) => <option key={c.id} value={c.id}>{c.costCode} — {c.costCentre}</option>)}</Select></div>
        <div><Label>Vendor</Label><Select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}><option value="">Select...</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.vendorName}</option>)}</Select></div>
        <div><Label>Actual Count</Label><Input type="number" min={0} value={form.actualCount} onChange={(e) => setForm({ ...form, actualCount: Number(e.target.value) })} /></div>
        <div className="col-span-2"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Shortage / excess are computed automatically against the relevant approved monthly plan.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={mut.isPending}>{mut.isPending ? 'Saving...' : 'Save Entry'}</Button>
      </div>
    </Modal>
  );
}
