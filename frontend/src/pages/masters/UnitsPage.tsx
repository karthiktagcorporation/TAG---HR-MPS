import { CrudPage, StatusBadge } from '@/components/CrudPage';
import { unitApi } from '@/services/resources';
import type { Unit } from '@/types';

export default function UnitsPage() {
  return (
    <CrudPage<Unit>
      title="Units"
      subtitle="Division / unit master"
      breadcrumbs={['Masters', 'Units']}
      queryKey="units"
      api={unitApi}
      searchPlaceholder="Search unit..."
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Unit Name' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'code', label: 'Unit Code', required: true, placeholder: 'U5' },
        { name: 'name', label: 'Unit Name', required: true },
        { name: 'status', label: 'Status', type: 'status' },
      ]}
      toFormValues={(r) => ({ code: r.code, name: r.name, status: r.status })}
    />
  );
}
