import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGmail } from '../../contexts/GmailContext';
import { useTickets } from '../../contexts/TicketContext';
import { formatRelative, formatDateTime } from '../../utils/formatters';
import { supabase } from '../../services/supabase';
import { Mail, RefreshCw, Unplug, Building2 } from 'lucide-react';

export function GmailIntegration() {
  const {
    isConnected,
    gmailEmail,
    groupEmail,
    lastSyncAt,
    loading,
    syncing,
    savingGroupEmail,
    error,
    connectGmail,
    syncNow,
    disconnect,
    updateGroupEmail,
    clearError,
  } = useGmail();
  const { fetchTickets, setAssignmentView } = useTickets();
  const navigate = useNavigate();

  const [groupEmailInput, setGroupEmailInput] = useState(groupEmail ?? '');
  const [groupEmailTouched, setGroupEmailTouched] = useState(false);
  const [cronLastRunAt, setCronLastRunAt] = useState<string | null>(null);

  useEffect(() => {
    setGroupEmailInput(groupEmail ?? '');
  }, [groupEmail]);

  useEffect(() => {
    supabase
      .from('gmail_sync_cron_last_run')
      .select('last_run_at')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { last_run_at: string } | null;
        setCronLastRunAt(row?.last_run_at ?? null);
      });
  }, []);

  const handleSaveGroupEmail = () => {
    setGroupEmailTouched(true);
    const value = groupEmailInput.trim() || null;
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return;
    }
    updateGroupEmail(value);
  };

  if (loading) {
    return (
      <div className="text-[var(--hiver-text-muted)] text-sm">Laster…</div>
    );
  }

  return (
    <div className="card-panel p-6">
      <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2">
        <Mail className="w-5 h-5" />
        Gmail-integrasjon
      </h2>
      {error && (
        <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="text-red-500 hover:underline">
            Lukk
          </button>
        </div>
      )}
      {isConnected ? (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-[var(--hiver-text-muted)]">
            Tilkoblet som <strong className="text-[var(--hiver-text)]">{gmailEmail}</strong>
          </p>

          <div>
            <h3 className="text-sm font-medium text-[var(--hiver-text)] flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4" />
              Gruppe-e-post å speile (Google Workspace)
            </h3>
            <p className="text-xs text-[var(--hiver-text-muted)] mb-2">
              Sett adressen til den delte eller gruppeinnboksen (f.eks. support@theprep.ai). Vi synkroniserer
              kun meldinger som sendes <em>til</em> denne adressen. La stå tom for å synkronisere din personlige innboks.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
              <strong>Svaring vises fra denne adressen:</strong> For at utgående svar skal vises som sendt fra gruppe-e-posten (f.eks. support@theprep.ai), må du legge den til i Gmail/Workspace: <strong>Innstillinger → Kontoer → Send e-post som → Legg til annen e-postadresse</strong>. Verifiser adressen hvis Google ber om det.
            </p>
            <div className="flex gap-2 flex-wrap">
              <input
                type="email"
                value={groupEmailInput}
                onChange={(e) => setGroupEmailInput(e.target.value)}
                onBlur={() => setGroupEmailTouched(true)}
                placeholder="f.eks. support@theprep.ai"
                className="flex-1 min-w-[200px] rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 focus:border-[var(--hiver-accent)]"
              />
              <button
                type="button"
                onClick={handleSaveGroupEmail}
                disabled={savingGroupEmail || groupEmailInput.trim() === (groupEmail ?? '')}
                className="px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50 disabled:pointer-events-none"
              >
                {savingGroupEmail ? 'Lagrer…' : 'Lagre'}
              </button>
            </div>
            {groupEmailTouched && groupEmailInput.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(groupEmailInput.trim()) && (
              <p className="text-xs text-red-600 mt-1">Skriv inn en gyldig e-postadresse.</p>
            )}
          </div>

          {lastSyncAt && (
            <p className="text-xs text-[var(--hiver-text-muted)]">
              Sist synkronisert: {formatRelative(lastSyncAt)}
            </p>
          )}
          {cronLastRunAt && (
            <p className="text-xs text-[var(--hiver-text-muted)]">
              Siste sync kjørt fra db: {formatDateTime(cronLastRunAt)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const result = await syncNow();
                if (result.success) {
                  fetchTickets();
                  if (result.created && result.created > 0) {
                    setAssignmentView('unassigned');
                    navigate('/tickets?view=unassigned');
                  }
                }
              }}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synkroniserer…' : 'Synkroniser nå'}
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)]"
            >
              <Unplug className="w-4 h-4" />
              Koble fra
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {cronLastRunAt && (
            <p className="text-xs text-[var(--hiver-text-muted)] mb-3">
              Siste sync kjørt fra db: {formatDateTime(cronLastRunAt)}
            </p>
          )}
          <p className="text-sm text-[var(--hiver-text-muted)] mb-3">
            Koble til Google Workspace- eller Gmail-kontoen din for å opprette saker fra e-poster og sende
            svar. Du kan deretter sette en gruppe-e-post å speile (f.eks. support@dittdomene.no).
          </p>
          <button
            type="button"
            onClick={connectGmail}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
          >
            <Mail className="w-4 h-4" />
            Koble til Gmail-konto
          </button>
        </div>
      )}
    </div>
  );
}
