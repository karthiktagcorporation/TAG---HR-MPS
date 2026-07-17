import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Button, Card, Input, Label, Modal, Select } from '@/components/ui';
import { LoadingState } from '@/components/States';
import { apiErrorMessage } from '@/services/api';
import { calendarApi, CalendarMonthRow } from '@/services/resources';
import { useAuth } from '@/context/AuthContext';
import { MONTHS, formatDate } from '@/lib/utils';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** Mirror of the server calculation, for a live preview in the editor. */
function computeWorkingDays(year: number, month: number, weeklyOffDays: number[], holidays: { date: string }[]) {
  const total = daysInMonth(year, month);
  const offs = new Set(weeklyOffDays);
  const holidayDates = new Set(holidays.map((h) => h.date));
  let working = 0;
  for (let day = 1; day <= total; day++) {
    const dt = new Date(year, month - 1, day);
    if (offs.has(dt.getDay())) continue;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (holidayDates.has(iso)) continue;
    working++;
  }
  return working;
}

export default function CalendarPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const START_YEAR = 2026;
  const endYear = Math.max(new Date().getFullYear() + 2, START_YEAR + 2);
  const years = Array.from({ length: endYear - START_YEAR + 1 }, (_, i) => START_YEAR + i);
  const [year, setYear] = useState(Math.max(new Date().getFullYear(), START_YEAR));
  const [editing, setEditing] = useState<CalendarMonthRow | null>(null);

  const canEdit = hasRole('SUPER_ADMIN', 'HR_ADMIN');
  const { data: months = [], isLoading } = useQuery({
    queryKey: ['calendar', year],
    queryFn: () => calendarApi.list(year),
  });

  return (
    <div>
      <PageHeader
        title="Calendar Master"
        subtitle="Working days, weekly offs and holidays per month — Monthly Plan = Daily Plan × Working Days"
        breadcrumbs={['Masters', 'Calendar']}
        actions={
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        }
      />

      <Card>
        {isLoading ? (
          <LoadingState rows={12} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3">Month</th>
                  <th className="px-3 py-3 text-right">Total Days</th>
                  <th className="px-3 py-3">Weekly Offs</th>
                  <th className="px-3 py-3">Holidays</th>
                  <th className="px-3 py-3 text-right">Working Days</th>
                  <th className="px-3 py-3">Status</th>
                  {canEdit && <th className="px-3 py-3" />}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium">
                      <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-600" />{MONTHS[m.month - 1]} {m.year}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{daysInMonth(m.year, m.month)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.weeklyOffDays.length ? m.weeklyOffDays.map((d) => WEEKDAYS[d]).join(', ') : '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {m.holidays.length
                        ? m.holidays.map((h) => `${formatDate(h.date)} (${h.name})`).join(', ')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{m.workingDays}</td>
                    <td className="px-3 py-2">
                      {m.configured
                        ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Configured</Badge>
                        : <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Default (all days)</Badge>}
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="icon" title="Configure" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <MonthEditor
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['calendar'] }); setEditing(null); }}
        />
      )}
    </div>
  );
}

function MonthEditor({ row, onClose, onSaved }: { row: CalendarMonthRow; onClose: () => void; onSaved: () => void }) {
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>(row.weeklyOffDays);
  const [holidays, setHolidays] = useState<{ date: string; name: string }[]>(row.holidays);
  const [remarks, setRemarks] = useState(row.remarks ?? '');
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');

  const monthPrefix = `${row.year}-${String(row.month).padStart(2, '0')}`;
  const working = computeWorkingDays(row.year, row.month, weeklyOffDays, holidays);

  const saveMut = useMutation({
    mutationFn: () => calendarApi.save({ year: row.year, month: row.month, weeklyOffDays, holidays, remarks: remarks || null }),
    onSuccess: () => { toast.success(`${MONTHS[row.month - 1]} ${row.year} saved — ${working} working days`); onSaved(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const toggleOff = (d: number) =>
    setWeeklyOffDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const addHoliday = () => {
    if (!newDate || !newName.trim()) return toast.error('Pick a date and enter the holiday name');
    if (!newDate.startsWith(monthPrefix)) return toast.error(`The holiday must fall in ${MONTHS[row.month - 1]} ${row.year}`);
    if (holidays.some((h) => h.date === newDate)) return toast.error('That date is already a holiday');
    setHolidays((prev) => [...prev, { date: newDate, name: newName.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate('');
    setNewName('');
  };

  return (
    <Modal open onClose={onClose} title={`Calendar — ${MONTHS[row.month - 1]} ${row.year}`} size="lg">
      <div className="space-y-5">
        <div>
          <Label>Weekly Offs</Label>
          <div className="mt-2 flex flex-wrap gap-3">
            {WEEKDAYS.map((name, d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={weeklyOffDays.includes(d)} onChange={() => toggleOff(d)} />
                {name}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label>Holidays</Label>
          <div className="mt-2 space-y-1.5">
            {holidays.map((h) => (
              <div key={h.date} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                <span><b className="tabular-nums">{formatDate(h.date)}</b> — {h.name}</span>
                <Button variant="ghost" size="icon" className="text-red-600" onClick={() => setHolidays((prev) => prev.filter((x) => x.date !== h.date))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {!holidays.length && <p className="text-sm text-muted-foreground">No holidays added.</p>}
          </div>
          <div className="mt-2 flex gap-2">
            <Input type="date" value={newDate} min={`${monthPrefix}-01`} max={`${monthPrefix}-${String(daysInMonth(row.year, row.month)).padStart(2, '0')}`} onChange={(e) => setNewDate(e.target.value)} className="w-44" />
            <Input placeholder="Holiday name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button variant="outline" onClick={addHoliday}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </div>

        <div>
          <Label>Remarks (optional)</Label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Working days: </span>
            <b className="text-lg tabular-nums">{working}</b>
            <span className="ml-1 text-xs text-muted-foreground">of {daysInMonth(row.year, row.month)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
