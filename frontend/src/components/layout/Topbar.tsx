import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, LogOut, Menu, Moon, PanelLeftClose, PanelLeft, Sun, User as UserIcon, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { notificationApi } from '@/services/resources';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/types';

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  HR_ADMIN: 'HR Admin',
  MANAGEMENT: 'Management',
  USER_MASTER: 'User Master',
};

export function Topbar({ onToggleSidebar, onToggleMobile, collapsed }: { onToggleSidebar: () => void; onToggleMobile: () => void; collapsed: boolean }) {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationApi.list(),
    refetchInterval: 60_000,
  });
  const notifications: AppNotification[] = data?.items ?? [];
  const unread: number = data?.unreadCount ?? 0;

  const onMarkAll = async () => {
    await notificationApi.markAllRead();
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="hidden lg:flex" onClick={onToggleSidebar}>
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onToggleMobile}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="lg:hidden">
          <Logo size={22} showText={false} chip />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" onClick={toggle} title="Toggle theme">
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {/* Notifications */}
        <div className="relative">
          <Button variant="ghost" size="icon" onClick={() => { setNotifOpen((o) => !o); setUserOpen(false); }}>
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="font-semibold">Notifications</span>
                  <button className="text-xs text-brand-600 hover:underline" onClick={onMarkAll}>Mark all read</button>
                </div>
                <div className="max-h-80 overflow-y-auto scrollbar-thin">
                  {notifications.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No notifications</p>}
                  {notifications.slice(0, 12).map((n) => (
                    <div key={n.id} className={cn('border-b border-border px-4 py-3 text-sm', !n.isRead && 'bg-brand-50/60 dark:bg-brand-900/20')}>
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', n.severity === 'CRITICAL' ? 'bg-red-500' : n.severity === 'WARNING' ? 'bg-amber-500' : 'bg-brand-500')} />
                        <span className="font-medium">{n.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{n.message}</p>
                    </div>
                  ))}
                </div>
                <button className="w-full bg-muted/50 py-2 text-xs font-medium hover:bg-muted" onClick={() => { setNotifOpen(false); navigate('/notifications'); }}>
                  View all
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
            onClick={() => { setUserOpen((o) => !o); setNotifOpen(false); }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-semibold leading-tight">{user?.name}</div>
              <div className="text-[11px] text-muted-foreground">{roleLabels[user?.role ?? '']}</div>
            </div>
          </button>
          <AnimatePresence>
            {userOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
              >
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium"><UserIcon className="h-4 w-4" />{user?.username}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{user?.email}</div>
                </div>
                <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted" onClick={() => { setUserOpen(false); navigate('/settings'); }}>
                  <KeyRound className="h-4 w-4" /> Account & Settings
                </button>
                <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-muted" onClick={() => logout()}>
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
