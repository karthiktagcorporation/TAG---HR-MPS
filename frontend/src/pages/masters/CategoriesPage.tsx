import { CrudPage, StatusBadge } from '@/components/CrudPage';
import { categoryApi } from '@/services/resources';
import type { Category } from '@/types';

export default function CategoriesPage() {
  return (
    <CrudPage<Category>
      title="Categories"
      subtitle="Workforce category master (Security, Housekeeping, CNC Operator, ...)"
      breadcrumbs={['Masters', 'Categories']}
      queryKey="categories"
      api={categoryApi}
      searchPlaceholder="Search category..."
      columns={[
        { key: 'name', header: 'Category Name' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'name', label: 'Category Name', required: true, placeholder: 'Security' },
        { name: 'status', label: 'Status', type: 'status' },
      ]}
      toFormValues={(r) => ({ name: r.name, status: r.status })}
    />
  );
}
