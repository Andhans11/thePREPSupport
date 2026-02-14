import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket,
  Users,
  BarChart3,
  Calendar,
  Settings,
} from 'lucide-react';
import { useCurrentUserRole } from '../../hooks/useCurrentUserRole';
import { canAccessSettings } from '../../types/roles';

const MAIN_NAV = [
  { to: '/', label: 'Dashbord', icon: LayoutDashboard },
  { to: '/tickets', label: 'Saker', icon: Ticket },
  { to: '/planning', label: 'Planlegging', icon: Calendar },
  { to: '/customers', label: 'Kunder', icon: Users },
  { to: '/analytics', label: 'Analyse', icon: BarChart3 },
] as const;

export function Sidebar() {
  const location = useLocation();
  const { role } = useCurrentUserRole();
  const showSettings = canAccessSettings(role);

  return (
    <aside className="w-56 flex flex-col bg-[var(--hiver-sidebar-bg)] border-r border-[var(--hiver-border)] shrink-0">
      <div className="p-4 border-b border-[var(--hiver-border)]">
        <Link to="/" className="flex items-center">
          <img src="/thePREP.svg" alt="thePREP" className="h-8 w-auto" />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {MAIN_NAV.map(({ to, label, icon: Icon }) => {
          const isActive =
            to === '/'
              ? location.pathname === '/'
              : location.pathname === to || location.pathname.startsWith(to + '/');
          return (
            <Link
              key={to}
              to={to === '/tickets' ? '/tickets?view=mine' : to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--hiver-selected-bg)] text-[var(--hiver-accent)]'
                  : 'text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      {showSettings && (
        <div className="p-3 border-t border-[var(--hiver-border)]">
          <Link
            to="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/settings' || location.pathname.startsWith('/settings')
                ? 'bg-[var(--hiver-selected-bg)] text-[var(--hiver-accent)]'
                : 'text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]'
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            Innstillinger
          </Link>
        </div>
      )}
    </aside>
  );
}
