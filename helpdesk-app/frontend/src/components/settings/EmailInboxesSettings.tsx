import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Mail, Plus, RefreshCw, Unplug } from 'lucide-react';
import { useGmail } from '../../contexts/GmailContext';
import { useGoogleCalendar } from '../../contexts/GoogleCalendarContext';
import { useUnifiedSync } from '../../hooks/useUnifiedSync';
import { useTenant } from '../../contexts/TenantContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../services/supabase';
import { ConnectedInboxCard } from './ConnectedInboxCard';

/**
 * Settings tab "E-post innbokser": list connected inboxes and link to add new.
 */
export function EmailInboxesSettings() {
  const { isConnected, loading } = useGmail();
  const { connection: calendarConnection, disconnect } = useGoogleCalendar();
  const { syncAll, combinedSyncing } = useUnifiedSync();
  const { currentTenantId } = useTenant();
  const toast = useToast();
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [savingNotify, setSavingNotify] = useState(false);

  useEffect(() => {
    if (!currentTenantId) return;
    supabase
      .from('teams')
      .select('id, name')
      .eq('tenant_id', currentTenantId)
      .order('name')
      .then(({ data }) => {
        setTeams((data as Array<{ id: string; name: string }>) ?? []);
      });
    supabase
      .from('company_settings')
      .select('value')
      .eq('tenant_id', currentTenantId)
      .eq('key', 'calendar_notify_settings')
      .maybeSingle()
      .then(({ data }) => {
        const value = (data as { value?: unknown } | null)?.value as { enabled?: unknown; team_ids?: unknown } | undefined;
        setNotifyEnabled(!!value && typeof value.enabled === 'boolean' ? value.enabled : false);
        setSelectedTeamIds(Array.isArray(value?.team_ids) ? value?.team_ids.filter((v): v is string => typeof v === 'string') : []);
      });
  }, [currentTenantId]);

  const saveNotifySettings = async (nextEnabled: boolean, nextTeamIds: string[]) => {
    if (!currentTenantId) return;
    setSavingNotify(true);
    const { error } = await supabase.from('company_settings').upsert(
      {
        tenant_id: currentTenantId,
        key: 'calendar_notify_settings',
        value: { enabled: nextEnabled, team_ids: nextTeamIds },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,key' }
    );
    setSavingNotify(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Kalendervarsler er oppdatert.');
  };

  const teamOptions = useMemo(() => teams, [teams]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2">
            <Mail className="w-5 h-5" />
            E-post innbokser
          </h2>
          <p className="text-sm text-[var(--hiver-text-muted)] mt-1">
            Oversikt over tilkoblede e-postinnbokser for denne organisasjonen. Legg til nye for å motta og svare på e-post som saker.
          </p>
        </div>
        <Link
          to="/settings/inboxes/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] shrink-0"
        >
          <Plus className="w-4 h-4" />
          Legg til innboks
        </Link>
        <Link
          to="/settings/calendar/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)] shrink-0"
        >
          <Calendar className="w-4 h-4" />
          Legg til kalender
        </Link>
      </div>

      {loading ? (
        <div className="py-8 text-center text-[var(--hiver-text-muted)] text-sm">
          Laster…
        </div>
      ) : isConnected ? (
        <div className="space-y-4">
          <ConnectedInboxCard />
        </div>
      ) : (
        <div className="card-panel p-8 text-center border border-dashed border-[var(--hiver-border)] rounded-lg bg-[var(--hiver-bg)]/30">
          <Mail className="w-12 h-12 text-[var(--hiver-text-muted)] mx-auto mb-3" />
          <p className="text-sm font-medium text-[var(--hiver-text)] mb-1">Ingen e-postinnbokser tilkoblet</p>
          <p className="text-sm text-[var(--hiver-text-muted)] mb-4">
            Legg til en innboks for å motta e-post som saker og svare fra denne organisasjonen.
          </p>
          <Link
            to="/settings/inboxes/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
          >
            <Plus className="w-4 h-4" />
            Legg til innboks
          </Link>
        </div>
      )}

      <div
        className={`card-panel p-5 border border-[var(--hiver-border)] rounded-lg ${
          calendarConnection.connected ? 'border-l-4 border-l-emerald-500' : ''
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--hiver-text)] flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Google Kalender
            </h3>
            <p className="text-sm text-[var(--hiver-text-muted)] mt-1">
              Egen registrering med Google-auth for kalendersynk.
            </p>
            <p className="text-xs text-[var(--hiver-text-muted)] mt-2">
              Status: {calendarConnection.connected ? 'Tilkoblet' : 'Ikke tilkoblet'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <Link
              to="/settings/calendar/new"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
            >
              <Plus className="w-4 h-4" />
              {calendarConnection.connected ? 'Administrer kalender' : 'Legg til kalender'}
            </Link>
            {calendarConnection.connected && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await syncAll();
                    if (!result.success) {
                      toast.error(result.error || 'Kunne ikke synkronisere.');
                      return;
                    }
                    toast.success(
                      result.created != null && result.created > 0
                        ? `${result.created} nye saker. E-post og kalender er oppdatert.`
                        : 'Synkronisert.'
                    );
                  }}
                  disabled={combinedSyncing}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-60"
                  title="Samme som synk i toppfeltet (e-post + kalender når innboks er koblet)"
                >
                  <RefreshCw className={`w-4 h-4 ${combinedSyncing ? 'animate-spin' : ''}`} />
                  Synkroniser
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await disconnect();
                    if (!result.ok) {
                      toast.error(result.error || 'Kunne ikke koble fra kalender.');
                      return;
                    }
                    toast.success('Kalender frakoblet.');
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)]"
                >
                  <Unplug className="w-4 h-4" />
                  Koble fra
                </button>
              </>
            )}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--hiver-border)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--hiver-text)]">Varsle team ved kalenderoppdateringer</p>
              <p className="text-xs text-[var(--hiver-text-muted)]">
                Sender varsel ved nye/oppdaterte kalenderhendelser etter synk. Velg team under, eller la stå tomt for å
                varsle alle aktive medlemmer som har «Kalendervarsler» aktivert under Brukere.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyEnabled}
              onClick={async () => {
                const next = !notifyEnabled;
                setNotifyEnabled(next);
                await saveNotifySettings(next, selectedTeamIds);
              }}
              disabled={savingNotify}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 transition-colors duration-200 ${
                notifyEnabled ? 'bg-[var(--hiver-accent)]' : 'bg-[var(--hiver-border)]'
              } disabled:opacity-50`}
            >
              <span
                className={`pointer-events-none absolute top-1/2 inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 -translate-y-1/2 ${
                  notifyEnabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          {notifyEnabled && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {teamOptions.length === 0 ? (
                <p className="text-xs text-[var(--hiver-text-muted)]">Ingen team funnet.</p>
              ) : (
                teamOptions.map((team) => (
                  <label key={team.id} className="inline-flex items-center gap-2 text-sm text-[var(--hiver-text)]">
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.id)}
                      onChange={async () => {
                        const next = selectedTeamIds.includes(team.id)
                          ? selectedTeamIds.filter((id) => id !== team.id)
                          : [...selectedTeamIds, team.id];
                        setSelectedTeamIds(next);
                        await saveNotifySettings(notifyEnabled, next);
                      }}
                    />
                    {team.name}
                  </label>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
