import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Check, Copy, Download, Save, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { PeriodFilters, PeriodValue } from '@/components/PeriodFilters';
import { StatusBadge } from '@/components/CrudPage';
import { Badge, Button, Card, Input, Label, Modal, Textarea } from '@/components/ui';
import { LoadingState } from '@/components/States';
import { MONTHS } from '@/lib/utils';
import { apiErrorMessage } from '@/services/api';
import { planApi } from '@/services/resources';
import { useAuth } from '@/context/AuthContext';
import type { PlanGridRow } from '@/types';

interface Edit {
  dayPlan: number;
  nightPlan: number;
  remarks: string;
}

const numOr = (v: number | null, fallback = 0) => (v === null || v === undefined || Number.isNaN(v) ? fallback : v);

export default function PlansPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [period, setPeriod] = useState<PeriodValue>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [rejecting, setRejecting] = useState<PlanGridRow | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const canEdit = hasRole('SUPER_ADMIN', 'HR_ADMIN');
  const canApprove = hasRole('SUPER_ADMIN', 'HR_ADMIN');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['plan-grid', period],
    queryFn: () => planApi.grid(period.year, period.month, period.unitId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['plan-grid'] });
    qc.invalidateQueries({ queryKey: ['plans'] });
  };

  const baseFor = (row: PlanGridRow): Edit => ({
    dayPlan: numOr(row.dayPlan),
    nightPlan: numOr(row.nightPlan),
    remarks: row.remarks ?? '',
  });
  const editFor = (row: PlanGridRow): Edit => edits[row.costCenterId] ?? baseFor(row);
  const isDirty = (row: PlanGridRow) => {
    const e = edits[row.costCenterId];
    if (!e) return false;
    const b = baseFor(row);
    return e.dayPlan !== b.dayPlan || e.nightPlan !== b.nightPlan || e.remarks !== b.remarks;
  };
  const setEdit = (row: PlanGridRow, patch: Partial<Edit>) =>
    setEdits((prev) => ({ ...prev, [row.costCenterId]: { ...editFor(row), ...patch } }));

  const editedRows = useMemo(
    () =>
      rows
        .filter((r) => isDirty(r))
        .map((r) => {
          const e = edits[r.costCenterId];
          return { costCenterId: r.costCenterId, dayPlan: e.dayPlan, nightPlan: e.nightPlan, remarks: e.remarks || null };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, edits],
  );

  const saveMut = useMutation({
    mutationFn: () => planApi.saveGrid(period.year, period.month, editedRows),
    onSuccess: (r) => {
      toast.success(`Saved ${r.saved} plan(s) — sent for approval${r.unchanged ? ` (${r.unchanged} unchanged)` : ''}`);
      if (r.errors.length) toast.error(`${r.errors.length} row(s) failed`);
      setEdits({});
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { toast.success(msg); invalidate(); }).catch((e) => toast.error(apiErrorMessage(e)));

  const pendingCount = rows.filter((r) => r.status === 'PENDING').length;

  // ---- Excel import / template ----
  const downloadTemplate = () => {
    const data = rows.map((r) => ({
      Unit: r.unit,
      'Cost Code': r.costCode,
      'Cost Centre': r.costCentre,
      'Day Plan': r.dayPlan ?? '',
      'Night Plan': r.nightPlan ?? '',
      Remarks: r.remarks ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 32 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plan');
    XLSX.writeFile(wb, `manpower-plan-${period.year}-${String(period.month).padStart(2, '0')}.xlsx`);
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        const byKey = new Map(rows.map((r) => [`${r.unit}|${r.costCode}`.toUpperCase(), r]));
        let matched = 0;
        let skipped = 0;
        const next: Record<string, Edit> = { ...edits };
        const readNum = (p: Record<string, unknown>, keys: string[]) => {
          for (const k of keys) {
            if (p[k] !== undefined && p[k] !== '') {
              const n = Number(p[k]);
              if (!Number.isNaN(n) && n >= 0) return Math.round(n);
            }
          }
          return 0;
        };
        for (const p of parsed) {
          const unit = String(p.Unit ?? p.unit ?? '').trim().toUpperCase();
          const code = String(p['Cost Code'] ?? p.CostCode ?? p.costCode ?? '').trim().toUpperCase();
          const row = byKey.get(`${unit}|${code}`);
          if (!row) { skipped++; continue; }
          next[row.costCenterId] = {
            dayPlan: readNum(p, ['Day Plan', 'DayPlan', 'Day', 'day']),
            nightPlan: readNum(p, ['Night Plan', 'NightPlan', 'Night', 'night']),
            remarks: String(p.Remarks ?? p.remarks ?? ''),
          };
          matched++;
        }
        setEdits(next);
        toast.success(`Imported ${matched} row(s)${skipped ? `, ${skipped} skipped` : ''}. Review and click Save.`);
      } catch {
        toast.error('Could not read the Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const numCell = (row: PlanGridRow, field: keyof Omit<Edit, 'remarks'>) => (
    <Input
      type="number"
      min={0}
      className="ml-auto w-20 text-right"
      value={editFor(row)[field]}
      onChange={(e) => setEdit(row, { [field]: e.target.value === '' ? 0 : Number(e.target.value) } as Partial<Edit>)}
    />
  );

  return (
    <div>
      <PageHeader
        title="Manpower Plan"
        subtitle="Monthly day/night planned manpower per cost center — every change goes for approval"
        breadcrumbs={['Operations', 'Manpower Plan']}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate} disabled={!rows.length}><Download className="h-4 w-4" /> Template</Button>
            {canEdit && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
                <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import Excel</Button>
                <Button onClick={() => saveMut.mutate()} disabled={!editedRows.length || saveMut.isPending}>
                  <Save className="h-4 w-4" /> {saveMut.isPending ? 'Saving...' : `Save (${editedRows.length})`}
                </Button>
              </>
            )}
          </div>
        }
      />

      <FilterBar>
        <PeriodFilters value={period} onChange={(v) => { setPeriod(v); setEdits({}); }} show={{ unit: true }} />
        {canApprove && pendingCount > 0 && (
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{pendingCount} pending</Badge>
            <Button variant="outline" className="text-emerald-700" onClick={() => act(() => planApi.approveMonth(period.year, period.month), 'All pending plans approved')}>
              <Check className="h-4 w-4" /> Approve All
            </Button>
          </div>
        )}
      </FilterBar>

      <Card>
        {isLoading ? (
          <LoadingState rows={8} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Cost Code</th>
                  <th className="px-3 py-3">Cost Centre</th>
                  <th className="px-3 py-3 text-right">Day Plan</th>
                  <th className="px-3 py-3 text-right">Night Plan</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3">Remarks</th>
                  <th className="px-3 py-3">Status</th>
                  {canApprove && <th className="px-3 py-3 text-right">Approval</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const e = editFor(r);
                  return (
                    <tr key={r.costCenterId} className={`border-b border-border last:border-0 ${isDirty(r) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                      <td className="px-3 py-2 font-medium">{r.unit}</td>
                      <td className="px-3 py-2">{r.costCode}</td>
                      <td className="px-3 py-2">
                        {r.costCentre}
                        {r.department && <span className="block text-xs text-muted-foreground">{r.department}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{canEdit ? numCell(r, 'dayPlan') : <span>{r.dayPlan ?? '—'}</span>}</td>
                      <td className="px-3 py-2 text-right">{canEdit ? numCell(r, 'nightPlan') : <span>{r.nightPlan ?? '—'}</span>}</td>
                      <td className="px-3 py-2 text-right font-semibold">{e.dayPlan + e.nightPlan}</td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <Input className="min-w-28" value={e.remarks} onChange={(ev) => setEdit(r, { remarks: ev.target.value })} />
                        ) : (
                          <span className="text-muted-foreground">{r.remarks ?? ''}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.status ? <StatusBadge status={r.status} /> : <span className="text-xs text-muted-foreground">No plan</span>}
                        {r.status === 'REJECTED' && r.rejectionRemarks && (
                          <div className="mt-1 text-xs text-red-600">{r.rejectionRemarks}</div>
                        )}
                      </td>
                      {canApprove && (
                        <td className="px-3 py-2 text-right">
                          {r.status === 'PENDING' && r.planId && (
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="text-emerald-600" title="Approve" onClick={() => act(() => planApi.approve(r.planId!), 'Approved')}><Check className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600" title="Reject" onClick={() => { setRejecting(r); setRejectRemarks(''); }}><X className="h-4 w-4" /></Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canEdit && (
        <div className="mt-4 flex justify-end">
          <DuplicateButton onDone={invalidate} />
        </div>
      )}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject Plan">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {rejecting && `${rejecting.unit} · ${rejecting.costCode} — ${rejecting.costCentre}`}
          </p>
          <Label>Rejection remarks *</Label>
          <Textarea value={rejectRemarks} onChange={(e) => setRejectRemarks(e.target.value)} placeholder="Reason for rejection" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectRemarks} onClick={() => {
              const r = rejecting!;
              act(() => planApi.reject(r.planId!, rejectRemarks), 'Plan rejected').then(() => setRejecting(null));
            }}>Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DuplicateButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({
    fromYear: now.getFullYear(), fromMonth: now.getMonth() + 1,
    toYear: now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear(),
    toMonth: now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2,
  });
  const mut = useMutation({
    mutationFn: () => planApi.duplicate(form),
    onSuccess: (r: any) => { toast.success(`Copied ${r.created} plan(s), ${r.skipped} skipped`); setOpen(false); onDone(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Copy className="h-4 w-4" /> Copy Month to Month</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Copy Plans to Another Month">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>From Month</Label><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.fromMonth} onChange={(e) => setForm({ ...form, fromMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><Label>From Year</Label><Input type="number" value={form.fromYear} onChange={(e) => setForm({ ...form, fromYear: Number(e.target.value) })} /></div>
          <div><Label>To Month</Label><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.toMonth} onChange={(e) => setForm({ ...form, toMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><Label>To Year</Label><Input type="number" value={form.toYear} onChange={(e) => setForm({ ...form, toYear: Number(e.target.value) })} /></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Copies every plan of the source month into the target month as pending (needs approval). Cost centers that already have a plan in the target month are skipped.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? 'Working...' : 'Copy'}</Button>
        </div>
      </Modal>
    </>
  );
}
