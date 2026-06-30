import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Bell, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card } from '@/components/ui';
import { EmptyState, LoadingState } from '@/components/States';
import { notificationApi } from '@/services/resources';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/types';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notifications'], queryFn: () => notificationApi.list() });
  const items: AppNotification[] = data?.items ?? [];

  const markAll = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const dot = (s: string) => (s === 'CRITICAL' ? 'bg-red-500' : s === 'WARNING' ? 'bg-amber-500' : 'bg-brand-500');

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Shortage alerts, pending approvals and system messages"
        breadcrumbs={['Administration', 'Notifications']}
        actions={<Button variant="outline" onClick={() => markAll.mutate()}><CheckCheck className="h-4 w-4" /> Mark all read</Button>}
      />
      <Card>
        {isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState title="You're all caught up" description="No notifications right now." />
        ) : (
          <div className="divide-y divide-border">
            {items.map((n) => (
              <div key={n.id} className={cn('flex items-start gap-3 p-4', !n.isRead && 'bg-brand-50/50 dark:bg-brand-900/20')}>
                <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', dot(n.severity))} />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{n.title}</p>
                    <span className="text-xs text-muted-foreground">{dayjs(n.createdAt).format('DD MMM, HH:mm')}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                </div>
                {!n.isRead && (
                  <Button variant="ghost" size="sm" onClick={() => markOne.mutate(n.id)}>Mark read</Button>
                )}
              </div>
            ))}
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="flex justify-center pb-6"><Bell className="h-5 w-5 text-muted-foreground" /></div>
        )}
      </Card>
    </div>
  );
}
