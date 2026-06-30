import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from './PageHeader';
import { FilterBar } from './FilterBar';
import { DataTable, Column } from './DataTable';
import { Button, Card, Input, Label, Modal, Select, Badge } from './ui';
import { classForStatus } from '@/lib/utils';
import { apiErrorMessage } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import type { RoleCode } from '@/types';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'select' | 'status';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface CrudApi<T> {
  list: (params?: Record<string, unknown>) => Promise<{ data: T[]; meta: any }>;
  create: (body: Partial<T>) => Promise<T>;
  update: (id: string, body: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<unknown>;
}

interface Props<T> {
  title: string;
  subtitle?: string;
  breadcrumbs?: string[];
  queryKey: string;
  api: CrudApi<T>;
  columns: Column<T>[];
  fields: FieldDef[];
  searchPlaceholder?: string;
  editRoles?: RoleCode[];
  deleteRoles?: RoleCode[];
  toFormValues?: (row: T) => Record<string, any>;
}

export function CrudPage<T extends { id: string; status?: string }>({
  title, subtitle, breadcrumbs, queryKey, api, columns, fields, searchPlaceholder, editRoles = ['SUPER_ADMIN', 'HR_ADMIN'], deleteRoles = ['SUPER_ADMIN'], toFormValues,
}: Props<T>) {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const canEdit = hasRole(...editRoles);
  const canDelete = hasRole(...deleteRoles);

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, { page, search }],
    queryFn: () => api.list({ page, pageSize: 10, search: search || undefined }),
  });

  const saveMut = useMutation({
    mutationFn: (body: Partial<T>) => (editing ? api.update(editing.id, body) : api.create(body)),
    onSuccess: () => {
      toast.success(editing ? 'Updated successfully' : 'Created successfully');
      qc.invalidateQueries({ queryKey: [queryKey] });
      closeModal();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => {
      toast.success('Deleted');
      qc.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(Object.fromEntries(fields.map((f) => [f.name, f.type === 'status' ? 'ACTIVE' : ''])));
    setModalOpen(true);
  };
  const openEdit = (row: T) => {
    setEditing(row);
    setForm(toFormValues ? toFormValues(row) : { ...row });
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const submit = () => {
    for (const f of fields) {
      if (f.required && !form[f.name]) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    // Convert empty optional strings to undefined so they pass backend validation.
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? undefined : v]),
    );
    saveMut.mutate(payload as Partial<T>);
  };

  const actionCol: Column<T> = {
    key: '_actions',
    header: 'Actions',
    align: 'right',
    render: (row) => (
      <div className="flex justify-end gap-1">
        {canEdit && (
          <Button variant="ghost" size="icon" onClick={() => openEdit(row)} title="Edit"><Pencil className="h-4 w-4" /></Button>
        )}
        {canDelete && (
          <Button variant="ghost" size="icon" className="text-red-600" title="Delete"
            onClick={() => { if (confirm('Delete this record?')) deleteMut.mutate(row.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    ),
  };

  const allColumns = canEdit || canDelete ? [...columns, actionCol] : columns;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={breadcrumbs}
        actions={canEdit && <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add {title.replace(/s$/, '')}</Button>}
      />

      <FilterBar search={search} onSearch={(v) => { setSearch(v); setPage(1); }} searchPlaceholder={searchPlaceholder} />

      <Card>
        <DataTable columns={allColumns} data={data?.data ?? []} loading={isLoading} meta={data?.meta} onPageChange={setPage} />
      </Card>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? `Edit ${title.replace(/s$/, '')}` : `New ${title.replace(/s$/, '')}`}>
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.name}>
              <Label>{f.label}{f.required && <span className="text-red-500"> *</span>}</Label>
              {f.type === 'select' ? (
                <Select value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  <option value="">Select...</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : f.type === 'status' ? (
                <Select value={form[f.name] ?? 'ACTIVE'} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              ) : (
                <Input value={form[f.name] ?? ''} placeholder={f.placeholder} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={submit} disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  return <Badge className={classForStatus(status)}>{status}</Badge>;
}
