import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download, Plus, Save, Trash2, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { Badge, Button, Card, Input, Label, Modal, Select } from '@/components/ui';
import { LoadingState } from '@/components/States';
import { apiErrorMessage } from '@/services/api';
import { actualApi } from '@/services/resources';
import { useAuth } from '@/context/AuthContext';
import { useUnits, useVendors } from '@/hooks/useMasters';
import type { ActualGridRow, VendorAllocation } from '@/types';

interface Edit {
  dayActual: number;
  nightActual: number;
  maleActual: number;
  femaleActual: number;
  remarks: string;
  dayVendors: VendorAllocation[];
  nightVendors: VendorAllocation[];
}

const n = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? 0 : v);
const vendorSum = (rows: VendorAllocation[]) => rows.reduce((s, r) => s + n(r.count), 0);
const sameVendors = (a: VendorAllocation[], b: VendorAllocation[]) =>
  a.length === b.length && a.every((x, i) => x.vendorId === b[i].vendorId && x.count === b[i].count);

export default function ActualsPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [unitId, setUnitId] = useState('');
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [vendorEditor, setVendorEditor] = useState<{ row: ActualGridRow; shift: 'DAY' | 'NIGHT' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: units = [] } = useUnits();

  const canEnter = hasRole('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER');
  const canDelete = user?.role === 'SUPER_ADMIN' || !!user?.canDeleteActuals;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['actual-grid', date, unitId],
    queryFn: () => actualApi.grid(date, unitId || undefined),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['actual-grid'] });

  const baseFor = (row: ActualGridRow): Edit => ({
    dayActual: n(row.dayActual),
    nightActual: n(row.nightActual),
    maleActual: n(row.maleActual),
    femaleActual: n(row.femaleActual),
    remarks: row.remarks ?? '',
    dayVendors: row.dayVendors ?? [],
    nightVendors: row.nightVendors ?? [],
  });
  const editFor = (row: ActualGridRow): Edit => edits[row.costCenterId] ?? baseFor(row);
  const isDirty = (row: ActualGridRow) => {
    const e = edits[row.costCenterId];
    if (!e) return false;
    const b = baseFor(row);
    return (
      e.dayActual !== b.dayActual || e.nightActual !== b.nightActual ||
      e.maleActual !== b.maleActual || e.femaleActual !== b.femaleActual ||
      e.remarks !== b.remarks ||
      !sameVendors(e.dayVendors, b.dayVendors) || !sameVendors(e.nightVendors, b.nightVendors)
    );
  };
  const setEdit = (row: ActualGridRow, patch: Partial<Edit>) =>
    setEdits((prev) => ({ ...prev, [row.costCenterId]: { ...editFor(row), ...patch } }));

  const editedRows = useMemo(
    () =>
      rows
        .filter((r) => isDirty(r))
        .map((r) => {
          const e = edits[r.costCenterId];
          return {
            date,
            costCenterId: r.costCenterId,
            dayActual: e.dayActual,
            nightActual: e.nightActual,
            maleActual: e.maleActual,
            femaleActual: e.femaleActual,
            remarks: e.remarks || null,
            dayVendors: e.dayVendors.filter((v) => v.vendorId && v.count > 0),
            nightVendors: e.nightVendors.filter((v) => v.vendorId && v.count > 0),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, edits, date],
  );

  const saveMut = useMutation({
    mutationFn: () => actualApi.bulk(editedRows),
    onSuccess: (r) => {
      toast.success(`Saved ${r.saved} entr${r.saved === 1 ? 'y' : 'ies'} — variance auto-calculated`);
      if (r.errors.length) toast.error(`${r.errors.length} row(s) failed: ${r.errors[0].message}`);
      setEdits({});
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => actualApi.remove(id),
    onSuccess: () => { toast.success('Entry deleted'); invalidate(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  // live variance preview against total plan
  const previewVariance = (row: ActualGridRow) => {
    const e = editFor(row);
    const total = e.dayActual + e.nightActual;
    if (!isDirty(row) && row.actualId === null) return { shortage: null, excess: null };
    return { shortage: Math.max(row.planned - total, 0), excess: Math.max(total - row.planned, 0) };
  };

  const totals = useMemo(() => {
    let planned = 0; let actual = 0; let shortage = 0; let excess = 0;
    for (const r of rows) {
      planned += r.planned;
      const e = edits[r.costCenterId];
      const total = e ? e.dayActual + e.nightActual : n(r.actualCount);
      const hasEntry = e ? true : r.actualId !== null;
      if (hasEntry) {
        actual += total;
        shortage += Math.max(r.planned - total, 0);
        excess += Math.max(total - r.planned, 0);
      }
    }
    return { planned, actual, shortage, excess };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, edits]);

  // ---- Excel import / template ----
  const downloadTemplate = () => {
    const data = rows.map((r) => ({
      Date: date,
      Unit: r.unit,
      'Cost Code': r.costCode,
      'Cost Centre': r.costCentre,
      'Day Plan': r.dayPlan,
      'Night Plan': r.nightPlan,
      'Day Actual': r.dayActual ?? '',
      'Night Actual': r.nightActual ?? '',
      Male: r.maleActual ?? '',
      Female: r.femaleActual ?? '',
      Remarks: r.remarks ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 8 }, { wch: 8 }, { wch: 26 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Actual');
    XLSX.writeFile(wb, `daily-actual-${date}.xlsx`);
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
              const num = Number(p[k]);
              if (!Number.isNaN(num) && num >= 0) return Math.round(num);
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
            dayActual: readNum(p, ['Day Actual', 'DayActual', 'Day', 'day']),
            nightActual: readNum(p, ['Night Actual', 'NightActual', 'Night', 'night']),
            maleActual: readNum(p, ['Male', 'male']),
            femaleActual: readNum(p, ['Female', 'female']),
            remarks: String(p.Remarks ?? p.remarks ?? ''),
            dayVendors: [],
            nightVendors: [],
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

  const shiftCell = (row: ActualGridRow, shift: 'DAY' | 'NIGHT') => {
    const e = editFor(row);
    const vendors = shift === 'DAY' ? e.dayVendors : e.nightVendors;
    const value = shift === 'DAY' ? e.dayActual : e.nightActual;
    const locked = vendors.length > 0; // total comes from vendor breakdown
    return (
      <div className="flex items-center justify-end gap-1">
        <Input
          type="number"
          min={0}
          className="w-20 text-right"
          value={value}
          disabled={!canEnter || locked}
          title={locked ? 'Total comes from the vendor breakdown' : undefined}
          onChange={(ev) => setEdit(row, { [shift === 'DAY' ? 'dayActual' : 'nightActual']: ev.target.value === '' ? 0 : Number(ev.target.value) } as Partial<Edit>)}
        />
        {canEnter && (
          <Button
            variant="ghost"
            size="icon"
            className={vendors.length ? 'text-brand-600' : 'text-muted-foreground'}
            title={vendors.length ? `${vendors.length} vendor(s): ${vendors.map((v) => `${v.vendorName ?? ''} ${v.count}`).join(', ')}` : 'Vendor-wise breakdown'}
            onClick={() => setVendorEditor({ row, shift })}
          >
            <Users className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Daily Actual Entry"
        subtitle="Day/night actual per cost center with vendor-wise breakdown — shortage / excess auto-calculated against the approved plan"
        breadcrumbs={['Operations', 'Daily Actual']}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate} disabled={!rows.length}><Download className="h-4 w-4" /> Template</Button>
            {canEnter && (
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
        <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setEdits({}); }} className="w-44" />
        <Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setEdits({}); }} className="w-44">
          <option value="">All Units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Planned <b className="text-foreground">{totals.planned}</b></span>
          <span className="text-muted-foreground">Actual <b className="text-foreground">{totals.actual}</b></span>
          {totals.shortage > 0 && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Shortage {totals.shortage}</Badge>}
          {totals.excess > 0 && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Excess {totals.excess}</Badge>}
        </div>
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
                  <th className="px-3 py-3">Cost Centre</th>
                  <th className="px-3 py-3 text-right">Day Plan</th>
                  <th className="px-3 py-3 text-right">Night Plan</th>
                  <th className="px-3 py-3 text-right">Day Actual</th>
                  <th className="px-3 py-3 text-right">Night Actual</th>
                  <th className="px-3 py-3 text-right">Male</th>
                  <th className="px-3 py-3 text-right">Female</th>
                  <th className="px-3 py-3 text-right">Shortage</th>
                  <th className="px-3 py-3 text-right">Excess</th>
                  <th className="px-3 py-3">Remarks</th>
                  {canDelete && <th className="px-3 py-3" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const e = editFor(r);
                  const v = previewVariance(r);
                  return (
                    <tr key={r.costCenterId} className={`border-b border-border last:border-0 ${isDirty(r) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                      <td className="px-3 py-2 font-medium">{r.unit}</td>
                      <td className="px-3 py-2">
                        <span>{r.costCode}</span>
                        <span className="block text-xs text-muted-foreground">{r.costCentre}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{r.dayPlan}</td>
                      <td className="px-3 py-2 text-right">{r.nightPlan}</td>
                      <td className="px-3 py-2">{shiftCell(r, 'DAY')}</td>
                      <td className="px-3 py-2">{shiftCell(r, 'NIGHT')}</td>
                      <td className="px-3 py-2 text-right">
                        <Input type="number" min={0} className="ml-auto w-16 text-right" value={e.maleActual} disabled={!canEnter}
                          onChange={(ev) => setEdit(r, { maleActual: ev.target.value === '' ? 0 : Number(ev.target.value) })} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input type="number" min={0} className="ml-auto w-16 text-right" value={e.femaleActual} disabled={!canEnter}
                          onChange={(ev) => setEdit(r, { femaleActual: ev.target.value === '' ? 0 : Number(ev.target.value) })} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {v.shortage && v.shortage > 0 ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{v.shortage}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {v.excess && v.excess > 0 ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{v.excess}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Input className="min-w-24" value={e.remarks} disabled={!canEnter} onChange={(ev) => setEdit(r, { remarks: ev.target.value })} />
                      </td>
                      {canDelete && (
                        <td className="px-3 py-2 text-right">
                          {r.actualId && (
                            <Button variant="ghost" size="icon" className="text-red-600" title="Delete this entry"
                              onClick={() => { if (confirm(`Delete the ${date} entry for ${r.costCode}?`)) delMut.mutate(r.actualId!); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && (
              <div className="p-8 text-center text-sm text-muted-foreground">No cost centers available for this filter.</div>
            )}
          </div>
        )}
      </Card>

      {vendorEditor && (
        <VendorAllocationModal
          row={vendorEditor.row}
          shift={vendorEditor.shift}
          initial={vendorEditor.shift === 'DAY' ? editFor(vendorEditor.row).dayVendors : editFor(vendorEditor.row).nightVendors}
          onClose={() => setVendorEditor(null)}
          onSave={(vendors) => {
            const total = vendorSum(vendors);
            if (vendorEditor.shift === 'DAY') setEdit(vendorEditor.row, { dayVendors: vendors, dayActual: vendors.length ? total : editFor(vendorEditor.row).dayActual });
            else setEdit(vendorEditor.row, { nightVendors: vendors, nightActual: vendors.length ? total : editFor(vendorEditor.row).nightActual });
            setVendorEditor(null);
          }}
        />
      )}
    </div>
  );
}

function VendorAllocationModal({
  row, shift, initial, onClose, onSave,
}: {
  row: ActualGridRow;
  shift: 'DAY' | 'NIGHT';
  initial: VendorAllocation[];
  onClose: () => void;
  onSave: (vendors: VendorAllocation[]) => void;
}) {
  const { data: vendors = [] } = useVendors();
  const [items, setItems] = useState<VendorAllocation[]>(initial.length ? initial.map((v) => ({ ...v })) : [{ vendorId: '', count: 0 }]);

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.vendorName ?? '';
  const setItem = (i: number, patch: Partial<VendorAllocation>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const usedIds = new Set(items.map((i) => i.vendorId));
  const total = vendorSum(items.filter((i) => i.vendorId));
  const planned = shift === 'DAY' ? row.dayPlan : row.nightPlan;

  const save = () => {
    const clean = items.filter((i) => i.vendorId && i.count > 0).map((i) => ({ ...i, vendorName: vendorName(i.vendorId) }));
    const ids = clean.map((c) => c.vendorId);
    if (new Set(ids).size !== ids.length) return toast.error('The same vendor is listed twice');
    onSave(clean);
  };

  return (
    <Modal open onClose={onClose} title={`${shift === 'DAY' ? 'Day' : 'Night'} shift — vendor breakdown`} size="lg">
      <p className="mb-3 text-sm text-muted-foreground">
        {row.unit} · {row.costCode} — {row.costCentre} · planned {planned}
      </p>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select value={it.vendorId} onChange={(e) => setItem(i, { vendorId: e.target.value })} className="flex-1">
              <option value="">Select vendor...</option>
              {vendors
                .filter((v) => v.id === it.vendorId || !usedIds.has(v.id))
                .map((v) => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
            </Select>
            <Input
              type="number" min={0} className="w-24 text-right" placeholder="Count"
              value={it.count || ''}
              onChange={(e) => setItem(i, { count: e.target.value === '' ? 0 : Number(e.target.value) })}
            />
            <Button variant="ghost" size="icon" className="text-red-600" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <Button variant="outline" className="mt-3" onClick={() => setItems((prev) => [...prev, { vendorId: '', count: 0 }])}>
        <Plus className="h-4 w-4" /> Add Vendor
      </Button>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Total {shift.toLowerCase()} actual: </span>
          <b>{total}</b>
          {planned > 0 && total !== planned && (
            <span className={`ml-2 text-xs ${total < planned ? 'text-red-600' : 'text-amber-600'}`}>
              ({total < planned ? `${planned - total} short of` : `${total - planned} over`} plan)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Apply</Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        The shift's actual becomes the sum of the vendor counts. Remove all vendors to type the total manually.
      </p>
    </Modal>
  );
}
