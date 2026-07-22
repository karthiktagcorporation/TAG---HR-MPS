import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Users, UserCheck, TrendingDown, TrendingUp, Building2, Boxes, Percent, ClipboardCheck, RefreshCw,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Area, AreaChart,
} from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { KpiCard } from '@/components/KpiCard';
import { PeriodFilters, PeriodValue } from '@/components/PeriodFilters';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from '@/components/ui';
import { LoadingState, ErrorState, EmptyState } from '@/components/States';
import { dashboardApi } from '@/services/resources';
import { apiErrorMessage } from '@/services/api';

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {empty ? <EmptyState title="No data for this period" /> : <div className="h-64">{children}</div>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const now = new Date();
  const today = dayjs().format('YYYY-MM-DD');
  const [period, setPeriod] = useState<PeriodValue>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState<'' | 'DAY' | 'NIGHT'>('');

  const params = useMemo(
    () => ({
      year: period.year,
      month: period.month,
      date: date || undefined,
      unitId: period.unitId,
      costCenterId: period.costCenterId,
      categoryId: period.categoryId,
      shift: shift || undefined,
    }),
    [period, date, shift],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => dashboardApi.full(params),
  });

  return (
    <div>
      <PageHeader
        title="Executive Dashboard"
        subtitle="Plan vs Actual manpower overview"
        breadcrumbs={['TAG - MPS', 'Dashboard']}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilters value={period} onChange={setPeriod} show={{ unit: true, costCenter: true, category: true }} />
            <Select value={shift} onChange={(e) => setShift(e.target.value as '' | 'DAY' | 'NIGHT')} className="w-36">
              <option value="">All Shift</option>
              <option value="DAY">Day Shift</option>
              <option value="NIGHT">Night Shift</option>
            </Select>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            {date && (
              <Button variant="outline" size="sm" title="Show the full month" onClick={() => setDate('')}>Clear Date</Button>
            )}
            <Button variant="outline" size="icon" title="Refresh" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {isLoading && <LoadingState rows={8} />}
      {isError && <ErrorState message={apiErrorMessage(error)} onRetry={() => refetch()} />}

      {data && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard index={0} label="Total Planned" value={data.kpis.totalPlanned} icon={Users} tone="brand" />
            <KpiCard index={1} label="Total Actual" value={data.kpis.totalActual} icon={UserCheck} tone="green" />
            <KpiCard index={2} label="Shortage" value={data.kpis.shortage} icon={TrendingDown} tone="red" />
            <KpiCard index={3} label="Excess" value={data.kpis.excess} icon={TrendingUp} tone="accent" />
            <KpiCard index={4} label="Attendance" value={data.kpis.attendancePercent} suffix="%" icon={Percent} tone="brand" />
            <KpiCard index={5} label="Vendors" value={data.kpis.vendorCount} icon={Building2} tone="brand" />
            <KpiCard index={6} label="Units" value={data.kpis.unitCount} icon={Boxes} tone="brand" />
            <KpiCard index={7} label="Pending Approvals" value={data.kpis.pendingApprovals} icon={ClipboardCheck} tone="amber" />
          </div>

          {/* Row 1 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Plan vs Actual (by Unit)" empty={!data.charts.planVsActual.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.charts.planVsActual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="planned" name="Planned" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#F97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Daily Attendance Trend" empty={!data.charts.dailyAttendanceTrend.length}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.charts.dailyAttendanceTrend}>
                  <defs>
                    <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1E3A8A" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#1E3A8A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Area type="monotone" dataKey="actual" name="Actual" stroke="#1E3A8A" fill="url(#ga)" />
                  <Line type="monotone" dataKey="shortage" name="Shortage" stroke="#EF4444" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Plan vs Actual (by Cost Center)" empty={!data.charts.planVsActualByCostCenter.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.charts.planVsActualByCostCenter} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis type="category" dataKey="label" width={110} fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="planned" name="Planned" fill="#94A3B8" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#1E3A8A" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Monthly Plan Trend" empty={!data.charts.monthlyTrend.length}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.charts.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Line type="monotone" dataKey="planned" name="Planned" stroke="#F97316" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-1 gap-6">
            <ChartCard title="Top Cost Center Shortage" empty={!data.charts.costCenterAnalysis.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.charts.costCenterAnalysis.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" fontSize={10} angle={-15} textAnchor="end" height={50} />
                  <YAxis fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="actual" name="Actual" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="shortage" name="Shortage" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}
