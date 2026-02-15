import { useSearchParams } from 'react-router-dom';
import { Building2, Users, UsersRound, FileText, Clock, FileSignature, Database, Mail } from 'lucide-react';
import { canManageUsers } from '../../types/roles';
import type { Role } from '../../types/roles';

export type SettingsTabId = 'company' | 'inboxes' | 'users' | 'teams' | 'templates' | 'business_hours' | 'signatures' | 'master_data';

const TABS: { id: SettingsTabId; label: string; icon: typeof Building2; requiresAdmin?: boolean }[] = [
  { id: 'company', label: 'Selskap', icon: Building2 },
  { id: 'inboxes', label: 'E-post innbokser', icon: Mail },
  { id: 'users', label: 'Brukere', icon: Users, requiresAdmin: true },
  { id: 'teams', label: 'Team', icon: UsersRound, requiresAdmin: true },
  { id: 'templates', label: 'Maler', icon: FileText, requiresAdmin: true },
  { id: 'business_hours', label: 'Åpningstider', icon: Clock, requiresAdmin: true },
  { id: 'signatures', label: 'Signaturer', icon: FileSignature, requiresAdmin: true },
  { id: 'master_data', label: 'Stamdata', icon: Database, requiresAdmin: true },
];

interface SettingsTabsProps {
  currentRole: Role | null;
  children: React.ReactNode;
}

export function SettingsTabs({ currentRole, children }: SettingsTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as SettingsTabId) || 'company';
  const validTab = TABS.some((t) => t.id === tab) ? tab : 'company';

  const setTab = (id: SettingsTabId) => {
    setSearchParams({ tab: id });
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="w-full border-b border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)]">
        <nav className="flex gap-1 px-2" aria-label="Innstillinger-faner">
          {TABS.map(({ id, label, icon: Icon, requiresAdmin }) => {
            const hidden = requiresAdmin && !canManageUsers(currentRole);
            if (hidden) return null;
            const isActive = validTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-[var(--hiver-accent)] text-[var(--hiver-accent)]'
                    : 'border-transparent text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)] hover:border-[var(--hiver-border)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-auto p-6 w-full">{children}</div>
    </div>
  );
}

export function useSettingsTab(): SettingsTabId {
  const [searchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as SettingsTabId) || 'company';
  return TABS.some((t) => t.id === tab) ? tab : 'company';
}
