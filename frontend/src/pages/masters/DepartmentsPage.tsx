import { CrudPage, StatusBadge } from '@/components/CrudPage';
import { departmentApi } from '@/services/resources';
import type { Department } from '@/types';

export default function DepartmentsPage() {
  return (
    <CrudPage<Department>
      title="Departments"
      subtitle="Functional department master (used for department-wise reports)"
      breadcrumbs={['Masters', 'Departments']}
      queryKey="departments"
      api={departmentApi}
      searchPlaceholder="Search department..."
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Department Name' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'code', label: 'Department Code', required: true, placeholder: 'PROD' },
        { name: 'name', label: 'Department Name', required: true },
        { name: 'status', label: 'Status', type: 'status' },
      ]}
      toFormValues={(r) => ({ code: r.code, name: r.name, status: r.status })}
    />
  );
}
