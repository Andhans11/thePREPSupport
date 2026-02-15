import { useCurrentUserRole } from '../hooks/useCurrentUserRole';
import { SettingsTabs, useSettingsTab } from '../components/settings/SettingsTabs';
import { CompanySettings } from '../components/settings/CompanySettings';
import { EmailInboxesSettings } from '../components/settings/EmailInboxesSettings';
import { UsersSettings } from '../components/settings/UsersSettings';
import { TeamsSettings } from '../components/settings/TeamsSettings';
import { TemplatesSettings } from '../components/settings/TemplatesSettings';
import { BusinessHoursSettings } from '../components/settings/BusinessHoursSettings';
import { SignaturesSettings } from '../components/settings/SignaturesSettings';
import { MasterDataSettings } from '../components/settings/MasterDataSettings';
import { canAccessSettings } from '../types/roles';
import { Navigate } from 'react-router-dom';

export function SettingsPage() {
  const { role, loading } = useCurrentUserRole();
  const tab = useSettingsTab();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-[var(--hiver-text-muted)]">
        Laster…
      </div>
    );
  }

  if (!canAccessSettings(role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="shrink-0 w-full p-4 border-b border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)]">
        <h1 className="text-xl font-semibold text-[var(--hiver-text)]">Innstillinger</h1>
        <p className="text-sm text-[var(--hiver-text-muted)] mt-0.5">
          Selskap, team og svarmaler.
        </p>
      </div>
      <SettingsTabs currentRole={role}>
        {tab === 'company' && <CompanySettings />}
        {tab === 'inboxes' && <EmailInboxesSettings />}
        {tab === 'users' && <UsersSettings />}
        {tab === 'teams' && <TeamsSettings />}
        {tab === 'templates' && <TemplatesSettings />}
        {tab === 'business_hours' && <BusinessHoursSettings />}
        {tab === 'signatures' && <SignaturesSettings />}
        {tab === 'master_data' && <MasterDataSettings />}
      </SettingsTabs>
    </div>
  );
}
