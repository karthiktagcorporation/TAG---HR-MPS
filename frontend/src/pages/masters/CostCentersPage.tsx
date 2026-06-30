import { CrudPage, StatusBadge } from '@/components/CrudPage';
import { costCenterApi } from '@/services/resources';
import { useUnits, useDepartments } from '@/hooks/useMasters';
import type { CostCenter } from '@/types';

export default function CostCentersPage() {
  const { data: units = [] } = useUnits();
  const { data: departments = [] } = useDepartments();

  return (
    <CrudPage<CostCenter>
      title="Cost Centers"
      subtitle="Unit-wise cost center master"
      breadcrumbs={['Masters', 'Cost Centers']}
      queryKey="cost-centers"
      api={costCenterApi}
      searchPlaceholder="Search cost code or name..."
      columns={[
        { key: 'unit', header: 'Unit', render: (r) => r.unit?.code ?? '—' },
        { key: 'costCode', header: 'Cost Code' },
        { key: 'costCentre', header: 'Cost Centre' },
        { key: 'department', header: 'Department', render: (r) => r.department?.name ?? '—' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'costCode', label: 'Cost Code', required: true, placeholder: 'HFRGN' },
        { name: 'costCentre', label: 'Cost Centre', required: true },
        { name: 'unitId', label: 'Unit', type: 'select', required: true, options: units.map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` })) },
        { name: 'departmentId', label: 'Department', type: 'select', options: departments.map((d) => ({ value: d.id, label: d.name })) },
        { name: 'status', label: 'Status', type: 'status' },
      ]}
      toFormValues={(r) => ({
        costCode: r.costCode, costCentre: r.costCentre, unitId: r.unitId, departmentId: r.departmentId ?? '', status: r.status,
      })}
    />
  );
}
