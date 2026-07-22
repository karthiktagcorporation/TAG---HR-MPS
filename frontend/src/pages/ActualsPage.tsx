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
import { useCostCenters, useUnits, useVendors, useCategories } from '@/hooks/useMasters';
import { formatDate } from '@/lib/utils';
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
  const [costCenterId, setCostCenterId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [vendorEditor, setVendorEditor] = useState<{ row: ActualGridRow; shift: 'DAY' | 'NIGHT' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: units = [] } = useUnits();
  const { data: costCenters = [] } = useCostCenters(unitId || undefined);
  const { data: categories = [] } = useCategories();
  const { data: vendors = [] } = useVendors();

  const canEnter = hasRole('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER');
  const canDelete = user?.role === 'SUPER_ADMIN' || !!user?.canDeleteActuals;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  // Once a SHIFT already has saved vendor data, only SUPER_ADMIN or a user
  // granted canDeleteActuals may edit/reapply it. Day and night are saved
  // independently within the same actual entry, so a saved Day shift must not
  // block a still-empty Night shift (or vice versa) for a normal user.
  const savedVendorsFor = (row: ActualGridRow, shift: 'DAY' | 'NIGHT') => (shift === 'DAY' ? row.dayVendors : row.nightVendors) ?? [];
  const canModifyShift = (row: ActualGridRow, shift: 'DAY' | 'NIGHT') => canEnter && (savedVendorsFor(row, shift).length === 0 || canDelete);
  const canModifyRow = (row: ActualGridRow) => canModifyShift(row, 'DAY') || canModifyShift(row, 'NIGHT');
  // Non-admin entry window: last 3 days including today, no future dates
  const minDate = isSuperAdmin ? undefined : dayjs().subtract(2, 'day').format('YYYY-MM-DD');
  const maxDate = isSuperAdmin ? undefined : dayjs().format('YYYY-MM-DD');

  // 'single' = entry grid for one date; 'all' = read-only list across all dates, sorted by unit
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const allDates = viewMode === 'all';
  // Day/Night/All shift filter — hides the other shift's columns and narrows the totals
  const [shiftFilter, setShiftFilter] = useState<'ALL' | 'DAY' | 'NIGHT'>('ALL');
  const showDay = shiftFilter !== 'NIGHT';
  const showNight = shiftFilter !== 'DAY';

  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ['actual-grid', date, unitId, categoryId],
    queryFn: () => actualApi.grid(date, unitId || undefined, categoryId || undefined),
    enabled: !allDates,
  });

  const { data: allList, isLoading: listLoading } = useQuery({
    queryKey: ['actual-list-all', unitId, costCenterId, categoryId],
    queryFn: () => actualApi.list({ page: 1, pageSize: 1000, sortBy: 'unit', sortDir: 'asc', unitId: unitId || undefined, costCenterId: costCenterId || undefined, categoryId: categoryId || undefined }),
    enabled: allDates,
  });
  const rows = useMemo(
    () => (costCenterId ? allRows.filter((r) => r.costCenterId === costCenterId) : allRows),
    [allRows, costCenterId],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['actual-grid'] });
    qc.invalidateQueries({ queryKey: ['actual-list-all'] });
  };

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
        // zero counts allowed — a vendor with 0/0 records zero attendance
        const dayVendors = e.dayVendors.filter((v) => v.vendorId).map((v) => ({ vendorId: v.vendorId, male: v.male, female: v.female }));
        const nightVendors = e.nightVendors.filter((v) => v.vendorId).map((v) => ({ vendorId: v.vendorId, male: v.male, female: v.female }));
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

  // planned/actual for a row, narrowed to the selected shift (ALL = combined)
  const shiftPlanned = (row: ActualGridRow) =>
    shiftFilter === 'DAY' ? row.dayPlan : shiftFilter === 'NIGHT' ? row.nightPlan : row.planned;
  const shiftActualFromEdit = (e: Edit) =>
    shiftFilter === 'DAY' ? shiftTotal(e.dayVendors) : shiftFilter === 'NIGHT' ? shiftTotal(e.nightVendors) : shiftTotal(e.dayVendors) + shiftTotal(e.nightVendors);
  const shiftActualFromRow = (row: ActualGridRow) =>
    shiftFilter === 'DAY' ? n(row.dayActual) : shiftFilter === 'NIGHT' ? n(row.nightActual) : n(row.actualCount);

  // live variance preview against total plan
  const previewVariance = (row: ActualGridRow) => {
    const e = editFor(row);
    const total = shiftActualFromEdit(e);
    const planned = shiftPlanned(row);
    if (!isDirty(row) && row.actualId === null) return { shortage: null, excess: null };
    return { shortage: Math.max(planned - total, 0), excess: Math.max(total - planned, 0) };
  };

  const totals = useMemo(() => {
    let planned = 0; let actual = 0; let shortage = 0; let excess = 0;
    for (const r of rows) {
      planned += shiftPlanned(r);
      const e = edits[r.costCenterId];
      const total = e ? shiftActualFromEdit(e) : shiftActualFromRow(r);
      const hasEntry = e ? true : r.actualId !== null;
      if (hasEntry) {
        actual += total;
        shortage += Math.max(shiftPlanned(r) - total, 0);
        excess += Math.max(total - shiftPlanned(r), 0);
      }
    }
    return { planned, actual, shortage, excess };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, edits, shiftFilter]);

  // ---- Excel import / template ----
  const downloadTemplate = () => {
    const data = rows.map((r) => ({
      Date: date,
      Unit: r.unit,
      'Cost Code': r.costCode,
      'Cost Centre': r.costCentre,
      Department: r.department ?? '',
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
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 9 }, { wch: 10 }, { wch: 16 }, { wch: 9 }, { wch: 10 }, { wch: 16 }, { wch: 9 }, { wch: 10 }, { wch: 24 }];
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
        // department disambiguates duplicate cost codes within a unit
        const byKey = new Map(rows.map((r) => [`${r.unit}|${r.costCode}|${r.department ?? ''}`.toUpperCase(), r]));
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
          const dept = String(p.Department ?? p.department ?? '').trim().toUpperCase();
          const row = byKey.get(`${unit}|${code}|${dept}`);
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
    const locked = savedVendorsFor(row, shift).length > 0 && !canModifyShift(row, shift);
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className={`w-10 text-right tabular-nums ${total > 0 ? 'font-semibold' : 'text-muted-foreground'}`}>{total}</span>
        {canModifyShift(row, shift) ? (
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
          <span title={locked ? 'Already saved — only Super Admin or a user with delete access can edit this' : undefined}>
            <Users className="h-4 w-4 text-muted-foreground/40" />
          </span>
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
          allDates ? null : (
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
          )
        }
      />

      <FilterBar>
        <Select value={viewMode} onChange={(e) => { setViewMode(e.target.value as 'single' | 'all'); setEdits({}); }} className="w-36">
          <option value="single">Single Date</option>
          <option value="all">All Dates</option>
        </Select>
        {!allDates && (
          <Input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => { setDate(e.target.value); setEdits({}); }} className="w-44" />
        )}
        <Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setCostCenterId(''); setEdits({}); }} className="w-44">
          <option value="">All Units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
        </Select>
        <Select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className="w-56">
          <option value="">All Cost Centers</option>
          {costCenters.map((c) => <option key={c.id} value={c.id}>{c.costCode} — {c.costCentre}{c.department ? ` - ${c.department}` : ''}</option>)}
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-44">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {!allDates && (
          <Select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value as 'ALL' | 'DAY' | 'NIGHT')} className="w-36">
            <option value="ALL">All Shift</option>
            <option value="DAY">Day Shift</option>
            <option value="NIGHT">Night Shift</option>
          </Select>
        )}
        {!allDates && (
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Planned <b className="text-foreground">{totals.planned}</b></span>
          <span className="text-muted-foreground">Actual <b className="text-foreground">{totals.actual}</b></span>
          {totals.shortage > 0 && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Shortage {totals.shortage}</Badge>}
          {totals.excess > 0 && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Excess {totals.excess}</Badge>}
        </div>
        )}
      </FilterBar>

      {allDates && (
        <Card>
          {listLoading ? (
            <LoadingState rows={8} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-3">Unit</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Cost Centre</th>
                    <th className="px-3 py-3">Department</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3 text-right">Day</th>
                    <th className="px-3 py-3 text-right">Night</th>
                    <th className="px-3 py-3 text-right">Male</th>
                    <th className="px-3 py-3 text-right">Female</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3 text-right">Shortage</th>
                    <th className="px-3 py-3 text-right">Excess</th>
                    <th className="px-3 py-3">Remarks</th>
                    {canDelete && <th className="px-3 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {(allList?.data ?? []).map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{a.unit?.code ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{formatDate(a.date)}</td>
                      <td className="px-3 py-2">
                        <span>{a.costCenter?.costCode}</span>
                        <span className="block text-xs text-muted-foreground">{a.costCenter?.costCentre}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{a.costCenter?.department ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{a.costCenter?.category?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.dayActual}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.nightActual}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.maleActual}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.femaleActual}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{a.actualCount}</td>
                      <td className="px-3 py-2 text-right">
                        {a.shortage > 0 ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{a.shortage}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {a.excess > 0 ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{a.excess}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{a.remarks ?? ''}</td>
                      {canDelete && (
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="icon" className="text-red-600" title="Delete this entry"
                            onClick={() => { if (confirm(`Delete the ${formatDate(a.date)} entry for ${a.costCenter?.costCode}?`)) delMut.mutate(a.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!allList?.data.length && (
                <div className="p-8 text-center text-sm text-muted-foreground">No entries found for this filter.</div>
              )}
            </div>
          )}
        </Card>
      )}

      {!allDates && (

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
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Category</th>
                  {showDay && <th className="px-3 py-3 text-right">Day Plan</th>}
                  {showNight && <th className="px-3 py-3 text-right">Night Plan</th>}
                  {showDay && <th className="px-3 py-3 text-right">Day Actual</th>}
                  {showNight && <th className="px-3 py-3 text-right">Night Actual</th>}
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
                      <td className="px-3 py-2 text-muted-foreground">{r.department ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.category ?? '—'}</td>
                      {showDay && <td className="px-3 py-2 text-right">{r.dayPlan}</td>}
                      {showNight && <td className="px-3 py-2 text-right">{r.nightPlan}</td>}
                      {showDay && <td className="px-3 py-2">{shiftCell(r, 'DAY')}</td>}
                      {showNight && <td className="px-3 py-2">{shiftCell(r, 'NIGHT')}</td>}
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{male}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{female}</td>
                      <td className="px-3 py-2 text-right">
                        {v.shortage && v.shortage > 0 ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{v.shortage}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {v.excess && v.excess > 0 ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{v.excess}</Badge> : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Input className="min-w-24" value={e.remarks} disabled={!canModifyRow(r)} onChange={(ev) => setEdit(r, { remarks: ev.target.value })} />
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
      )}

      {vendorEditor && (
        <VendorAllocationModal
          row={vendorEditor.row}
          shift={vendorEditor.shift}
          initial={vendorEditor.shift === 'DAY' ? editFor(vendorEditor.row).dayVendors : editFor(vendorEditor.row).nightVendors}
          canDelete={canDelete}
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
  row, shift, initial, canDelete, onClose, onSave,
}: {
  row: ActualGridRow;
  shift: 'DAY' | 'NIGHT';
  initial: VendorAllocation[];
  canDelete: boolean;
  onClose: () => void;
  onSave: (vendors: VendorAllocation[]) => void;
}) {
  const { data: vendors = [] } = useVendors();
  const [items, setItems] = useState<VendorAllocation[]>(
    initial.length ? initial.map((v) => ({ ...v })) : [{ vendorId: '', male: 0, female: 0 }],
  );
  // Vendor rows already applied/saved can only be removed with the delete-actuals grant;
  // freshly added, not-yet-applied rows stay freely removable.
  const savedVendorIds = new Set(initial.map((v) => v.vendorId));

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.vendorName ?? '';
  const setItem = (i: number, patch: Partial<VendorAllocation>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => {
    const it = items[i];
    if (it.vendorId && savedVendorIds.has(it.vendorId) && !canDelete) {
      toast.error('You do not have permission to delete a saved actual entry');
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };
  const usedIds = new Set(items.map((i) => i.vendorId));
  // zero counts allowed — keeping a vendor at 0/0 records zero attendance
  const cleanItems = items.filter((i) => i.vendorId);
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
            <Button
              variant="ghost"
              size="icon"
              className={it.vendorId && savedVendorIds.has(it.vendorId) && !canDelete ? 'text-muted-foreground/40' : 'text-red-600'}
              title={it.vendorId && savedVendorIds.has(it.vendorId) && !canDelete ? 'Delete-actuals permission required to remove a saved entry' : 'Remove'}
              onClick={() => removeItem(i)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
