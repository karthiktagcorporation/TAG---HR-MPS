import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download, Plus, Save, Trash2, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { Badge, Button, Card, Input, Modal, Select } from '@/components/ui';
import { LoadingState } from '@/components/States';
import { apiErrorMessage } from '@/services/api';
import { actualApi } from '@/services/resources';
import { useAuth } from '@/context/AuthContext';
import { useUnits, useVendors } from '@/hooks/useMasters';
import type { ActualGridRow, VendorAllocation } from '@/types';

interface Edit {
  remarks: string;
  dayVendors: VendorAllocation[];
  nightVendors: VendorAllocation[];
}

const n = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? 0 : v);
const shiftTotal = (rows: VendorAllocation[]) => rows.reduce((s, r) => s + n(r.male) + n(r.female), 0);
const shiftMale = (rows: VendorAllocation[]) => rows.reduce((s, r) => s + n(r.male), 0);
const shiftFemale = (rows: VendorAllocation[]) => rows.reduce((s, r) => s + n(r.female), 0);
const sameVendors = (a: VendorAllocation[], b: VendorAllocation[]) =>
  a.length === b.length && a.every((x, i) => x.vendorId === b[i].vendorId && x.male === b[i].male && x.female === b[i].female);

export default function ActualsPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [unitId, setUnitId] = useState('');
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [vendorEditor, setVendorEditor] = useState<{ row: ActualGridRow; shift: 'DAY' | 'NIGHT' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: units = [] } = useUnits();
  const { data: vendors = [] } = useVendors();

  const canEnter = hasRole('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER');
  const canDelete = user?.role === 'SUPER_ADMIN' || !!user?.canDeleteActuals;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['actual-grid', date, unitId],
    queryFn: () => actualApi.grid(date, unitId || undefined),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['actual-grid'] });

  const baseFor = (row: ActualGridRow): Edit => ({
    remarks: row.remarks ?? '',
    dayVendors: row.dayVendors ?? [],
    nightVendors: row.nightVendors ?? [],
  });
  const editFor = (row: ActualGridRow): Edit => edits[row.costCenterId] ?? baseFor(row);
  const isDirty = (row: ActualGridRow) => {
    const e = edits[row.costCenterId];
    if (!e) return false;
    const b = baseFor(row);
    return e.remarks !== b.remarks || !sameVendors(e.dayVendors, b.dayVendors) || !sameVendors(e.nightVendors, b.nightVendors);
  };
  const setEdit = (row: ActualGridRow, patch: Partial<Edit>) =>
    setEdits((prev) => ({ ...prev, [row.costCenterId]: { ...editFor(row), ...patch } }));

  const editedRows = useMemo(() => {
    const skippedNoVendor: string[] = [];
    const out = rows
      .filter((r) => isDirty(r))
      .map((r) => {
        const e = edits[r.costCenterId];
        const dayVendors = e.dayVendors.filter((v) => v.vendorId && (v.male > 0 || v.female > 0)).map((v) => ({ vendorId: v.vendorId, male: v.male, female: v.female }));
        const nightVendors = e.nightVendors.filter((v) => v.vendorId && (v.male > 0 || v.female > 0)).map((v) => ({ vendorId: v.vendorId, male: v.male, female: v.female }));
        if (dayVendors.length === 0 && nightVendors.length === 0) {
          skippedNoVendor.push(r.costCode);
          return null;
        }
        return { date, costCenterId: r.costCenterId, remarks: e.remarks || null, dayVendors, nightVendors };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return { rows: out, skippedNoVendor };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, edits, date]);

  const saveMut = useMutation({
    mutationFn: () => actualApi.bulk(editedRows.rows),
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

  const handleSave = () => {
    if (editedRows.skippedNoVendor.length) {
      toast.error(`Add at least one vendor before saving: ${editedRows.skippedNoVendor.join(', ')}`);
      if (!editedRows.rows.length) return;
    }
    saveMut.mutate();
  };

  // live variance preview against total plan
  const previewVariance = (row: ActualGridRow) => {
    const e = editFor(row);
    const total = shiftTotal(e.dayVendors) + shiftTotal(e.nightVendors);
    if (!isDirty(row) && row.actualId === null) return { shortage: null, excess: null };
    return { shortage: Math.max(row.planned - total, 0), excess: Math.max(total - row.planned, 0) };
  };

  const totals = useMemo(() => {
    let planned = 0; let actual = 0; let shortage = 0; let excess = 0;
    for (const r of rows) {
      planned += r.planned;
      const e = edits[r.costCenterId];
      const total = e ? shiftTotal(e.dayVendors) + shiftTotal(e.nightVendors) : n(r.actualCount);
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
      'Day Vendor': '',
      'Day Male': '',
      'Day Female': '',
      'Night Vendor': '',
      'Night Male': '',
      'Night Female': '',
      Remarks: r.remarks ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 28 }, { wch: 9 }, { wch: 10 }, { wch: 16 }, { wch: 9 }, { wch: 10 }, { wch: 16 }, { wch: 9 }, { wch: 10 }, { wch: 24 }];
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
        const vendorByName = new Map(vendors.map((v) => [v.vendorName.trim().toUpperCase(), v.id]));
        let matched = 0;
        let skipped = 0;
        const next: Record<string, Edit> = { ...edits };
        const readNum = (p: Record<string, unknown>, key: string) => {
          const num = Number(p[key]);
          return !Number.isNaN(num) && num >= 0 ? Math.round(num) : 0;
        };
        for (const p of parsed) {
          const unit = String(p.Unit ?? p.unit ?? '').trim().toUpperCase();
          const code = String(p['Cost Code'] ?? p.CostCode ?? p.costCode ?? '').trim().toUpperCase();
          const row = byKey.get(`${unit}|${code}`);
          if (!row) { skipped++; continue; }
          const dayVendorName = String(p['Day Vendor'] ?? '').trim().toUpperCase();
          const nightVendorName = String(p['Night Vendor'] ?? '').trim().toUpperCase();
          const dayVendorId = vendorByName.get(dayVendorName);
          const nightVendorId = vendorByName.get(nightVendorName);
          const dayVendors = dayVendorId ? [{ vendorId: dayVendorId, male: readNum(p, 'Day Male'), female: readNum(p, 'Day Female') }] : [];
          const nightVendors = nightVendorId ? [{ vendorId: nightVendorId, male: readNum(p, 'Night Male'), female: readNum(p, 'Night Female') }] : [];
          if (!dayVendors.length && !nightVendors.length) { skipped++; continue; }
          next[row.costCenterId] = { remarks: String(p.Remarks ?? p.remarks ?? ''), dayVendors, nightVendors };
          matched++;
        }
        setEdits(next);
        toast.success(`Imported ${matched} row(s)${skipped ? `, ${skipped} skipped (vendor name must match master)` : ''}. Review and click Save.`);
      } catch {
        toast.error('Could not read the Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const shiftCell = (row: ActualGridRow, shift: 'DAY' | 'NIGHT') => {
    const e = editFor(row);
    const vendorRows = shift === 'DAY' ? e.dayVendors : e.nightVendors;
    const total = shiftTotal(vendorRows);
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className={`w-10 text-right tabular-nums ${total > 0 ? 'font-semibold' : 'text-muted-foreground'}`}>{total}</span>
        {canEnter ? (
          <Button
            variant="ghost"
            size="icon"
            className={vendorRows.length ? 'text-brand-600' : 'text-muted-foreground'}
            title={vendorRows.length ? `${vendorRows.length} vendor(s): ${vendorRows.map((v) => `${v.vendorName ?? ''} (M${v.male}/F${v.female})`).join(', ')}` : 'Add vendor breakdown (required)'}
            onClick={() => setVendorEditor({ row, shift })}
          >
            <Users className="h-4 w-4" />
          </Button>
        ) : (
          <Users className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Daily Actual Entry"
        subtitle="Vendor-wise day/night actual with male/female split — a vendor is required to save any entry"
        breadcrumbs={['Operations', 'Daily Actual']}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate} disabled={!rows.length}><Download className="h-4 w-4" /> Template</Button>
            {canEnter && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
                <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import Excel</Button>
                <Button onClick={handleSave} disabled={(!editedRows.rows.length && !editedRows.skippedNoVendor.length) || saveMut.isPending}>
                  <Save className="h-4 w-4" /> {saveMut.isPending ? 'Saving...' : `Save (${editedRows.rows.length})`}
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
                  const male = shiftMale(e.dayVendors) + shiftMale(e.nightVendors);
                  const female = shiftFemale(e.dayVendors) + shiftFemale(e.nightVendors);
                  const needsVendor = isDirty(r) && e.dayVendors.length === 0 && e.nightVendors.length === 0;
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
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{male}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{female}</td>
                      <td className="px-3 py-2 text-right">
                        {v.shortage && v.shortage > 0 ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{v.shortage}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {v.excess && v.excess > 0 ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{v.excess}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Input className="min-w-24" value={e.remarks} disabled={!canEnter} onChange={(ev) => setEdit(r, { remarks: ev.target.value })} />
                        {needsVendor && <span className="mt-0.5 block text-[11px] text-red-600">Add a vendor to save</span>}
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
          onSave={(vendorRows) => {
            if (vendorEditor.shift === 'DAY') setEdit(vendorEditor.row, { dayVendors: vendorRows });
            else setEdit(vendorEditor.row, { nightVendors: vendorRows });
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
  const [items, setItems] = useState<VendorAllocation[]>(
    initial.length ? initial.map((v) => ({ ...v })) : [{ vendorId: '', male: 0, female: 0 }],
  );

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.vendorName ?? '';
  const setItem = (i: number, patch: Partial<VendorAllocation>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const usedIds = new Set(items.map((i) => i.vendorId));
  const cleanItems = items.filter((i) => i.vendorId && (i.male > 0 || i.female > 0));
  const totalMale = cleanItems.reduce((s, i) => s + n(i.male), 0);
  const totalFemale = cleanItems.reduce((s, i) => s + n(i.female), 0);
  const total = totalMale + totalFemale;
  const planned = shift === 'DAY' ? row.dayPlan : row.nightPlan;

  const save = () => {
    const ids = cleanItems.map((c) => c.vendorId);
    if (new Set(ids).size !== ids.length) return toast.error('The same vendor is listed twice');
    onSave(cleanItems.map((i) => ({ vendorId: i.vendorId, vendorName: vendorName(i.vendorId), male: i.male, female: i.female })));
  };

  return (
    <Modal open onClose={onClose} title={`${shift === 'DAY' ? 'Day' : 'Night'} shift — vendor breakdown`} size="lg">
      <p className="mb-3 text-sm text-muted-foreground">
        {row.unit} · {row.costCode} — {row.costCentre} · planned {planned}
      </p>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_5rem_5rem_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
          <span>Vendor</span><span className="text-right">Male</span><span className="text-right">Female</span><span />
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_5rem_2.5rem] items-center gap-2">
            <Select value={it.vendorId} onChange={(e) => setItem(i, { vendorId: e.target.value })}>
              <option value="">Select vendor...</option>
              {vendors
                .filter((v) => v.id === it.vendorId || !usedIds.has(v.id))
                .map((v) => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
            </Select>
            <Input type="number" min={0} className="text-right" value={it.male || ''} placeholder="0"
              onChange={(e) => setItem(i, { male: e.target.value === '' ? 0 : Number(e.target.value) })} />
            <Input type="number" min={0} className="text-right" value={it.female || ''} placeholder="0"
              onChange={(e) => setItem(i, { female: e.target.value === '' ? 0 : Number(e.target.value) })} />
            <Button variant="ghost" size="icon" className="text-red-600" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <Button variant="outline" className="mt-3" onClick={() => setItems((prev) => [...prev, { vendorId: '', male: 0, female: 0 }])}>
        <Plus className="h-4 w-4" /> Add Vendor
      </Button>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Total {shift.toLowerCase()}: </span>
          <b>{total}</b>
          <span className="ml-1.5 text-xs text-muted-foreground">(M {totalMale} / F {totalFemale})</span>
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
        At least one vendor (day or night) is required to save an actual entry. This shift's total is the sum of the male + female counts entered per vendor.
      </p>
    </Modal>
  );
}
