import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { navForRole } from './nav';
import { useAuth } from '@/context/AuthContext';

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: { collapsed: boolean; mobileOpen: boolean; onCloseMobile: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const sections = navForRole(user.role);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onCloseMobile} />}

      <aside
        className={cn(
          'fixed z-40 flex h-screen flex-col border-r border-border bg-brand-800 text-white transition-all duration-200',
          collapsed ? 'w-[72px]' : 'w-64',
          mobileOpen ? 'left-0' : '-left-64 lg:left-0',
        )}
      >
        <div className="flex h-16 items-center border-b border-white/10 px-4">
          {collapsed ? <Logo size={36} showText={false} /> : <Logo size={36} variant="light" />}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto scrollbar-thin p-3">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">{section}</p>}
              <div className="space-y-1">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onCloseMobile}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-accent text-white' : 'text-white/75 hover:bg-white/10 hover:text-white',
                        collapsed && 'justify-center',
                      )
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && !collapsed && (
                          <motion.span layoutId="active-pill" className="absolute inset-0 -z-10 rounded-lg bg-accent" />
                        )}
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {!collapsed && (
          <div className="border-t border-white/10 p-3 text-[11px] text-white/50">
            TAG Corporation · v1.0
          </div>
        )}
      </aside>
    </>
  );
}
