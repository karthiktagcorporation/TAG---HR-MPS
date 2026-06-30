import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Check, X, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { DataTable, Column } from '@/components/DataTable';
import { PeriodFilters, PeriodValue } from '@/components/PeriodFilters';
import { StatusBadge } from '@/components/CrudPage';
import { ExportActions } from '@/components/ExportActions';
import { Button, Card, Input, Label, Modal, Select, Textarea } from '@/components/ui';
import { MANPOWER_TYPES, MONTHS } from '@/lib/utils';
import { apiErrorMessage } from '@/services/api';
import { planApi } from '@/services/resources';
import { useAuth } from '@/context/AuthContext';
import { useUnits, useVendors, useCostCenters } from '@/hooks/useMasters';
import type { ManpowerPlan } from '@/types';

export default function PlansPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [period, setPeriod] = useState<PeriodValue>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [rejecting, setRejecting] = useState<ManpowerPlan | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');

  const canEdit = hasRole('SUPER_ADMIN', 'HR_ADMIN');
  const canApprove = hasRole('SUPER_ADMIN', 'MANAGEMENT');

  const params = useMemo(
    () => ({ ...period, status: status || undefined, page, pageSize: 10 }),
    [period, status, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['plans', params],
    queryFn: () => planApi.list(params),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['plans'] });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { toast.success(msg); invalidate(); }).catch((e) => toast.error(apiErrorMessage(e)));

  const columns: Column<ManpowerPlan>[] = [
    { key: 'period', header: 'Period', render: (r) => `${MONTHS[r.month - 1]?.slice(0, 3)} ${r.year}` },
    { key: 'unit', header: 'Unit', render: (r) => r.unit?.code ?? '—' },
    { key: 'cc', header: 'Cost Centre', render: (r) => r.costCenter?.costCentre ?? '—' },
    { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.vendorName ?? '—' },
    { key: 'genderOrType', header: 'Type' },
    { key: 'plannedCount', header: 'Planned', align: 'right' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: '_actions', header: 'Actions', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {canEdit && r.status === 'DRAFT' && (
            <Button variant="ghost" size="icon" title="Submit" onClick={() => act(() => planApi.submit(r.id), 'Submitted for approval')}><Send className="h-4 w-4" /></Button>
          )}
          {canApprove && r.status === 'PENDING' && (
            <>
              <Button variant="ghost" size="icon" className="text-emerald-600" title="Approve" onClick={() => act(() => planApi.approve(r.id), 'Approved')}><Check className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="text-red-600" title="Reject" onClick={() => { setRejecting(r); setRejectRemarks(''); }}><X className="h-4 w-4" /></Button>
            </>
          )}
          {canEdit && r.status !== 'APPROVED' && (
            <Button variant="ghost" size="icon" className="text-red-600" title="Delete" onClick={() => { if (confirm('Delete plan?')) act(() => planApi.remove(r.id), 'Deleted'); }}><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      ),
    },
  ];

  const exportRows = (data?.data ?? []).map((r) => ({
    period: `${MONTHS[r.month - 1]} ${r.year}`, unit: r.unit?.code, costCentre: r.costCenter?.costCentre,
    vendor: r.vendor?.vendorName, type: r.genderOrType, planned: r.plannedCount, status: r.status,
  }));

  return (
    <div>
      <PageHeader
        title="Manpower Plan"
        subtitle="Monthly manpower planning with approval workflow"
        breadcrumbs={['Operations', 'Manpower Plan']}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportActions filename="manpower-plan" title="Manpower Plan" columns={[
              { key: 'period', label: 'Period' }, { key: 'unit', label: 'Unit' }, { key: 'costCentre', label: 'Cost Centre' },
              { key: 'vendor', label: 'Vendor' }, { key: 'type', label: 'Type' }, { key: 'planned', label: 'Planned' }, { key: 'status', label: 'Status' },
            ]} rows={exportRows} disabled={!exportRows.length} />
            {canEdit && <Button variant="outline" onClick={() => setDupOpen(true)}><Copy className="h-4 w-4" /> Duplicate Month</Button>}
            {canEdit && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Plan</Button>}
          </div>
        }
      />

      <FilterBar>
        <PeriodFilters value={period} onChange={(v) => { setPeriod(v); setPage(1); }} show={{ unit: true, costCenter: true, vendor: true }} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-36">
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      </FilterBar>

      <Card>
        <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} meta={data?.meta} onPageChange={setPage} emptyTitle="No plans found" emptyDescription="Create a plan or adjust filters." />
      </Card>

      {createOpen && <CreatePlanModal onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); invalidate(); }} defaultPeriod={period} />}
      {dupOpen && <DuplicateModal onClose={() => setDupOpen(false)} onDone={() => { setDupOpen(false); invalidate(); }} />}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject Plan">
        <div className="space-y-3">
          <Label>Rejection remarks *</Label>
          <Textarea value={rejectRemarks} onChange={(e) => setRejectRemarks(e.target.value)} placeholder="Reason for rejection" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectRemarks} onClick={() => {
              const r = rejecting!;
              act(() => planApi.reject(r.id, rejectRemarks), 'Plan rejected').then(() => setRejecting(null));
            }}>Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CreatePlanModal({ onClose, onSaved, defaultPeriod }: { onClose: () => void; onSaved: () => void; defaultPeriod: PeriodValue }) {
  const { data: units = [] } = useUnits();
  const { data: vendors = [] } = useVendors();
  const [form, setForm] = useState({
    year: defaultPeriod.year, month: defaultPeriod.month, unitId: '', costCenterId: '', vendorId: '',
    genderOrType: 'MALE', plannedCount: 0, remarks: '',
  });
  const { data: costCenters = [] } = useCostCenters(form.unitId || undefined);

  const mut = useMutation({
    mutationFn: () => planApi.create(form as never),
    onSuccess: () => { toast.success('Plan created (Draft)'); onSaved(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const submit = () => {
    if (!form.unitId || !form.costCenterId || !form.vendorId) return toast.error('Unit, cost center and vendor are required');
    mut.mutate();
  };

  return (
    <Modal open onClose={onClose} title="New Manpower Plan" size="lg">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Month</Label><Select value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></div>
        <div><Label>Year</Label><Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} /></div>
        <div><Label>Unit</Label><Select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value, costCenterId: '' })}><option value="">Select...</option>{units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}</Select></div>
        <div><Label>Cost Center</Label><Select value={form.costCenterId} onChange={(e) => setForm({ ...form, costCenterId: e.target.value })}><option value="">Select...</option>{costCenters.map((c) => <option key={c.id} value={c.id}>{c.costCode} — {c.costCentre}</option>)}</Select></div>
        <div><Label>Vendor</Label><Select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}><option value="">Select...</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.vendorName}</option>)}</Select></div>
        <div><Label>Type</Label><Select value={form.genderOrType} onChange={(e) => setForm({ ...form, genderOrType: e.target.value })}>{MANPOWER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
        <div><Label>Planned Count</Label><Input type="number" min={0} value={form.plannedCount} onChange={(e) => setForm({ ...form, plannedCount: Number(e.target.value) })} /></div>
        <div className="col-span-2"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={mut.isPending}>{mut.isPending ? 'Saving...' : 'Create Draft'}</Button>
      </div>
    </Modal>
  );
}

function DuplicateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const now = new Date();
  const [form, setForm] = useState({ fromYear: now.getFullYear(), fromMonth: now.getMonth() + 1, toYear: now.getFullYear(), toMonth: now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2 });
  const mut = useMutation({
    mutationFn: () => planApi.duplicate(form),
    onSuccess: (r: any) => { toast.success(`Duplicated ${r.created} plan(s), ${r.skipped} skipped`); onDone(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  return (
    <Modal open onClose={onClose} title="Duplicate Plans from Previous Month">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>From Month</Label><Select value={form.fromMonth} onChange={(e) => setForm({ ...form, fromMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></div>
        <div><Label>From Year</Label><Input type="number" value={form.fromYear} onChange={(e) => setForm({ ...form, fromYear: Number(e.target.value) })} /></div>
        <div><Label>To Month</Label><Select value={form.toMonth} onChange={(e) => setForm({ ...form, toMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></div>
        <div><Label>To Year</Label><Input type="number" value={form.toYear} onChange={(e) => setForm({ ...form, toYear: Number(e.target.value) })} /></div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Copies all plans from the source month into the target month as new drafts. Existing duplicates are skipped.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? 'Working...' : 'Duplicate'}</Button>
      </div>
    </Modal>
  );
}
