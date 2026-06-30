import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, KeyRound, SlidersHorizontal, Palette } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui';
import { settingsApi, authApi } from '@/services/resources';
import { apiErrorMessage } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

export default function SettingsPage() {
  const { hasRole } = useAuth();
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  const canEdit = hasRole('SUPER_ADMIN');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => settingsApi.all() });
  const [company, setCompany] = useState<any>({});
  const [thresholds, setThresholds] = useState<any>({});

  useEffect(() => {
    if (settings) {
      setCompany(settings.company_profile ?? {});
      setThresholds(settings.thresholds ?? {});
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => settingsApi.update(key, value),
    onSuccess: () => { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company profile, thresholds, theme and account" breadcrumbs={['Administration', 'Settings']} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Company profile */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Company Profile</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Company Name</Label><Input disabled={!canEdit} value={company.name ?? ''} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></div>
            <div><Label>App Name</Label><Input disabled={!canEdit} value={company.appName ?? ''} onChange={(e) => setCompany({ ...company, appName: e.target.value })} /></div>
            <div><Label>Logo URL</Label><Input disabled={!canEdit} placeholder="/logo.svg or https://..." value={company.logoUrl ?? ''} onChange={(e) => setCompany({ ...company, logoUrl: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input disabled={!canEdit} value={company.email ?? ''} onChange={(e) => setCompany({ ...company, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input disabled={!canEdit} value={company.phone ?? ''} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></div>
            </div>
            {canEdit && <Button onClick={() => saveMut.mutate({ key: 'company_profile', value: company })}>Save Profile</Button>}
          </CardContent>
        </Card>

        {/* Thresholds */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Alert Thresholds</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Attendance Warning %</Label><Input type="number" disabled={!canEdit} value={thresholds.attendanceWarningPercent ?? ''} onChange={(e) => setThresholds({ ...thresholds, attendanceWarningPercent: Number(e.target.value) })} /></div>
              <div><Label>Attendance Critical %</Label><Input type="number" disabled={!canEdit} value={thresholds.attendanceCriticalPercent ?? ''} onChange={(e) => setThresholds({ ...thresholds, attendanceCriticalPercent: Number(e.target.value) })} /></div>
              <div><Label>Shortage Warning</Label><Input type="number" disabled={!canEdit} value={thresholds.shortageWarning ?? ''} onChange={(e) => setThresholds({ ...thresholds, shortageWarning: Number(e.target.value) })} /></div>
              <div><Label>Shortage Critical</Label><Input type="number" disabled={!canEdit} value={thresholds.shortageCritical ?? ''} onChange={(e) => setThresholds({ ...thresholds, shortageCritical: Number(e.target.value) })} /></div>
            </div>
            {canEdit && <Button onClick={() => saveMut.mutate({ key: 'thresholds', value: thresholds })}>Save Thresholds</Button>}
          </CardContent>
        </Card>

        {/* Theme */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> Appearance</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Current theme: <span className="font-medium capitalize text-foreground">{theme}</span></p>
            <Button variant="outline" onClick={toggle}>Switch to {theme === 'dark' ? 'Light' : 'Dark'} mode</Button>
          </CardContent>
        </Card>

        {/* Change password */}
        <ChangePasswordCard />
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const mut = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => { toast.success('Password updated'); setCurrent(''); setNew(''); },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Change Password</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>Current Password</Label><Input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} /></div>
        <div><Label>New Password</Label><Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} /></div>
        <Button onClick={() => { if (newPassword.length < 8) return toast.error('New password must be at least 8 characters'); mut.mutate(); }} disabled={mut.isPending}>
          Update Password
        </Button>
      </CardContent>
    </Card>
  );
}
