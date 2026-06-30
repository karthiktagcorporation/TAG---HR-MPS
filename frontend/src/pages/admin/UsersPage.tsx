import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { FilterBar } from '@/components/FilterBar';
import { DataTable, Column } from '@/components/DataTable';
import { StatusBadge } from '@/components/CrudPage';
import { Badge, Button, Card, Input, Label, Modal, Select } from '@/components/ui';
import { apiErrorMessage } from '@/services/api';
import { userApi } from '@/services/resources';
import { useCostCenters } from '@/hooks/useMasters';
import type { RoleCode } from '@/types';

interface UserRow {
  id: string; name: string; username: string; email: string; status: string; role: RoleCode; roleName: string;
  costCenters: { id: string; costCode: string; costCentre: string; unit: string }[];
}

const ROLES: { value: RoleCode; label: string }[] = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'HR_ADMIN', label: 'HR Admin' },
  { value: 'MANAGEMENT', label: 'Management / Viewer' },
  { value: 'USER_MASTER', label: 'User Master (cost-center scoped)' },
];

export default function UsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, search }],
    queryFn: () => userApi.list({ page, pageSize: 10, search: search || undefined }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => userApi.remove(id),
    onSuccess: () => { toast.success('User deleted'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const columns: Column<UserRow>[] = [
    { key: 'name', header: 'Name' },
    { key: 'username', header: 'Username' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (r) => <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{r.roleName}</Badge> },
    { key: 'cc', header: 'Cost Centers', render: (r) => (r.role === 'USER_MASTER' ? `${r.costCenters.length} assigned` : 'All') },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: '_actions', header: 'Actions', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="text-red-600" onClick={() => { if (confirm('Delete user?')) delMut.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Create users, assign roles and cost-center scoped access"
        breadcrumbs={['Administration', 'Users']}
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Add User</Button>}
      />
      <FilterBar search={search} onSearch={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search name, username or email..." />
      <Card>
        <DataTable columns={columns} data={data?.data ?? []} loading={isLoading} meta={data?.meta} onPageChange={setPage} />
      </Card>
      {open && <UserModal editing={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ['users'] }); }} />}
    </div>
  );
}

function UserModal({ editing, onClose, onSaved }: { editing: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const { data: costCenters = [] } = useCostCenters();
  const [form, setForm] = useState({
    name: editing?.name ?? '', username: editing?.username ?? '', email: editing?.email ?? '',
    password: '', role: (editing?.role ?? 'HR_ADMIN') as RoleCode, status: editing?.status ?? 'ACTIVE',
    costCenterIds: editing?.costCenters.map((c) => c.id) ?? [] as string[],
  });

  const mut = useMutation({
    mutationFn: () => {
      const body: any = { ...form };
      if (editing && !form.password) delete body.password;
      return editing ? userApi.update(editing.id, body) : userApi.create(body);
    },
    onSuccess: () => { toast.success(editing ? 'User updated' : 'User created'); onSaved(); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const submit = () => {
    if (!form.name || !form.username || !form.email) return toast.error('Name, username and email are required');
    if (!editing && form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (form.role === 'USER_MASTER' && form.costCenterIds.length === 0) return toast.error('Assign at least one cost center');
    mut.mutate();
  };

  const toggleCc = (id: string) =>
    setForm((f) => ({ ...f, costCenterIds: f.costCenterIds.includes(id) ? f.costCenterIds.filter((x) => x !== id) : [...f.costCenterIds, id] }));

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit User' : 'New User'} size="lg">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Full Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Username *</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
        <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><Label>Password {editing && <span className="text-xs text-muted-foreground">(leave blank to keep)</span>}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <div><Label>Role *</Label><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleCode })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></div>
        <div><Label>Status</Label><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></div>
      </div>

      {form.role === 'USER_MASTER' && (
        <div className="mt-4">
          <Label>Assigned Cost Centers * <span className="text-xs text-muted-foreground">({form.costCenterIds.length} selected)</span></Label>
          <div className="max-h-48 space-y-1 overflow-y-auto scrollbar-thin rounded-lg border border-border p-2">
            {costCenters.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" checked={form.costCenterIds.includes(c.id)} onChange={() => toggleCc(c.id)} />
                <span>{c.unit?.code} · {c.costCode} — {c.costCentre}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={mut.isPending}>{mut.isPending ? 'Saving...' : 'Save'}</Button>
      </div>
    </Modal>
  );
}
