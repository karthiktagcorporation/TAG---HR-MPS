import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Download, Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { LoadingState } from '@/components/States';
import { apiErrorMessage } from '@/services/api';
import { actualApi } from '@/services/resources';
import { useAuth } from '@/context/AuthContext';
import { useUnits } from '@/hooks/useMasters';
import type { ActualGridRow } from '@/types';

interface Edit {
  actualCount: number | null;
  remarks: string;
}

export default function ActualsPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [unitId, setUnitId] = useState('');
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: units = [] } = useUnits();

  const canEnter = hasRole('SUPER_ADMIN', 'HR_ADMIN', 'USER_MASTER');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['actual-grid', date, unitId],
    queryFn: () => actualApi.grid(date, unitId || undefined),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['actual-grid'] });

  const editedRows = useMemo(
    () =>
      Object.entries(edits)
        .filter(([, e]) => e.actualCount !== null && !Number.isNaN(e.actualCount))
        .map(([costCenterId, e]) => ({ date, costCenterId, actualCount: e.actualCount as number, remarks: e.remarks || null })),
    [edits, date],
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

  const setEdit = (row: ActualGridRow, patch: Partial<Edit>) =>
    setEdits((prev) => ({
      ...prev,
      [row.costCenterId]: {
        actualCount: prev[row.costCenterId]?.actualCount ?? row.actualCount,
        remarks: prev[row.costCenterId]?.remarks ?? (row.remarks ?? ''),
        ...patch,
      },
    }));

  const valueFor = (row: ActualGridRow) => edits[row.costCenterId]?.actualCount ?? row.actualCount;
  const remarksFor = (row: ActualGridRow) => edits[row.costCenterId]?.remarks ?? (row.remarks ?? '');
  const isDirty = (row: ActualGridRow) =>
    edits[row.costCenterId] !== undefined &&
    (edits[row.costCenterId].actualCount !== row.actualCount || edits[row.costCenterId].remarks !== (row.remarks ?? ''));

  // live variance preview for edited rows
  const previewVariance = (row: ActualGridRow) => {
    const v = valueFor(row);
    if (v === null) return { shortage: row.shortage, excess: row.excess };
    return { shortage: Math.max(row.planned - v, 0), excess: Math.max(v - row.planned, 0) };
  };

  const totals = useMemo(() => {
    let planned = 0; let actual = 0; let shortage = 0; let excess = 0;
    for (const r of rows) {
      planned += r.planned;
      const v = valueFor(r);
      if (v !== null) {
        actual += v;
        shortage += Math.max(r.planned - v, 0);
        excess += Math.max(v - r.planned, 0);
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
      Planned: r.planned,
      Actual: r.actualCount ?? '',
      Remarks: r.remarks ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 32 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
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
        for (const p of parsed) {
          const unit = String(p.Unit ?? p.unit ?? '').trim().toUpperCase();
          const code = String(p['Cost Code'] ?? p.CostCode ?? p.costCode ?? '').trim().toUpperCase();
          const actual = Number(p.Actual ?? p.actual ?? p['Actual Count']);
          const row = byKey.get(`${unit}|${code}`);
          if (!row || Number.isNaN(actual) || actual < 0) { skipped++; continue; }
          next[row.costCenterId] = { actualCount: Math.round(actual), remarks: String(p.Remarks ?? p.remarks ?? '') };
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

  return (
    <div>
      <PageHeader
        title="Daily Actual Entry"
        subtitle="Enter the day's actual manpower per cost center — shortage / excess is auto-calculated against the approved plan"
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
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Cost Code</th>
                  <th className="px-4 py-3">Cost Centre</th>
                  <th className="px-4 py-3 text-right">Planned</th>
                  <th className="px-4 py-3 text-right">Actual</th>
                  <th className="px-4 py-3 text-right">Shortage</th>
                  <th className="px-4 py-3 text-right">Excess</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const v = previewVariance(r);
                  return (
                    <tr key={r.costCenterId} className={`border-b border-border last:border-0 ${isDirty(r) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                      <td className="px-4 py-2 font-medium">{r.unit}</td>
                      <td className="px-4 py-2">{r.costCode}</td>
                      <td className="px-4 py-2">{r.costCentre}</td>
                      <td className="px-4 py-2 text-right">{r.planned}</td>
                      <td className="px-4 py-2 text-right">
                        {canEnter ? (
                          <Input
                            type="number"
                            min={0}
                            className="ml-auto w-24 text-right"
                            value={valueFor(r) ?? ''}
                            placeholder="—"
                            onChange={(e) => setEdit(r, { actualCount: e.target.value === '' ? null : Number(e.target.value) })}
                          />
                        ) : (
                          <span>{r.actualCount ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {v.shortage && v.shortage > 0 ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{v.shortage}</Badge> : '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {v.excess && v.excess > 0 ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{v.excess}</Badge> : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {canEnter ? (
                          <Input value={remarksFor(r)} placeholder="" onChange={(e) => setEdit(r, { remarks: e.target.value })} />
                        ) : (
                          <span className="text-muted-foreground">{r.remarks ?? ''}</span>
                        )}
                      </td>
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
    </div>
  );
}
