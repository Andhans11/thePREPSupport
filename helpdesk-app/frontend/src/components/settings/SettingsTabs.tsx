import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Users, UsersRound, FileText, Clock, FileSignature, Database, Mail, Timer, Blocks } from 'lucide-react';
import { canManageUsers, canViewTeamDirectory } from '../../types/roles';
import type { Role } from '../../types/roles';

export type SettingsTabId = 'company' | 'inboxes' | 'modules' | 'users' | 'teams' | 'templates' | 'business_hours' | 'signatures' | 'master_data' | 'time_registration';

const TABS: { id: SettingsTabId; label: string; icon: typeof Building2 }[] = [
  { id: 'company', label: 'Selskap', icon: Building2 },
  { id: 'inboxes', label: 'E-post innbokser', icon: Mail },
  { id: 'modules', label: 'Moduler', icon: Blocks },
  { id: 'users', label: 'Brukere', icon: Users },
  { id: 'teams', label: 'Team', icon: UsersRound },
  { id: 'templates', label: 'Maler', icon: FileText },
  { id: 'business_hours', label: 'Åpningstider', icon: Clock },
  { id: 'signatures', label: 'Signaturer', icon: FileSignature },
  { id: 'master_data', label: 'Stamdata', icon: Database },
  { id: 'time_registration', label: 'Timeregistrering', icon: Timer },
];

export function isSettingsTabVisible(id: SettingsTabId, role: Role | null): boolean {
  if (!role) return false;
  const adminOnly: SettingsTabId[] = ['modules', 'teams', 'templates', 'business_hours', 'signatures', 'master_data', 'time_registration'];
  if (adminOnly.includes(id)) {
    return canManageUsers(role);
  }
  if (id === 'company' || id === 'inboxes') {
    return role !== 'agent';
  }
  if (id === 'users') {
    return canManageUsers(role) || canViewTeamDirectory(role);
  }
  return false;
}

interface SettingsTabsProps {
  currentRole: Role | null;
  children: React.ReactNode;
}

export function SettingsTabs({ currentRole, children }: SettingsTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get('tab') as SettingsTabId) || 'company';

  const validTab = useMemo((): SettingsTabId => {
    if (TABS.some((t) => t.id === tabParam && isSettingsTabVisible(t.id, currentRole))) {
      return tabParam;
    }
    const first = TABS.find((t) => isSettingsTabVisible(t.id, currentRole))?.id;
    return first ?? 'company';
  }, [tabParam, currentRole]);

  const setTab = (id: SettingsTabId) => {
    setSearchParams({ tab: id });
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="w-full border-b border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)]">
        <nav className="flex gap-1 px-2" aria-label="Innstillinger-faner">
          {TABS.map(({ id, label, icon: Icon }) => {
            if (!isSettingsTabVisible(id, currentRole)) return null;
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
      <div className="flex-1 overflow-auto p-6 pb-24 w-full">{children}</div>
    </div>
  );
}

export function useSettingsTab(currentRole: Role | null): SettingsTabId {
  const [searchParams] = useSearchParams();
  const tabParam = (searchParams.get('tab') as SettingsTabId) || 'company';
  if (TABS.some((t) => t.id === tabParam && isSettingsTabVisible(t.id, currentRole))) {
    return tabParam;
  }
  return TABS.find((t) => isSettingsTabVisible(t.id, currentRole))?.id ?? 'company';
}
