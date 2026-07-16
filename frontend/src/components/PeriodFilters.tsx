import { Select } from './ui';
import { MONTHS } from '@/lib/utils';
import { useUnits, useCostCenters } from '@/hooks/useMasters';

export interface PeriodValue {
  year: number;
  month: number;
  unitId?: string;
  costCenterId?: string;
}

interface Props {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  show?: { unit?: boolean; costCenter?: boolean };
}

export function PeriodFilters({ value, onChange, show = { unit: true } }: Props) {
  const { data: units = [] } = useUnits();
  const { data: costCenters = [] } = useCostCenters(value.unitId);
  // Business started using TAG-MPS in 2026 — no earlier years needed
  const START_YEAR = 2026;
  const endYear = Math.max(new Date().getFullYear() + 2, START_YEAR + 2);
  const years = Array.from({ length: endYear - START_YEAR + 1 }, (_, i) => START_YEAR + i);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.month} onChange={(e) => onChange({ ...value, month: Number(e.target.value) })} className="w-36">
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </Select>
      <Select value={value.year} onChange={(e) => onChange({ ...value, year: Number(e.target.value) })} className="w-28">
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </Select>
      {show.unit && (
        <Select value={value.unitId ?? ''} onChange={(e) => onChange({ ...value, unitId: e.target.value || undefined, costCenterId: undefined })} className="w-40">
          <option value="">All Units</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.code} — {u.name}</option>
          ))}
        </Select>
      )}
      {show.costCenter && (
        <Select value={value.costCenterId ?? ''} onChange={(e) => onChange({ ...value, costCenterId: e.target.value || undefined })} className="w-52">
          <option value="">All Cost Centers</option>
          {costCenters.map((c) => (
            <option key={c.id} value={c.id}>{c.costCode} — {c.costCentre}{c.department ? ` - ${c.department}` : ''}</option>
          ))}
        </Select>
      )}
    </div>
  );
}
