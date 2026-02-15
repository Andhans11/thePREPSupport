import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGmail } from '../../contexts/GmailContext';
import { useTickets } from '../../contexts/TicketContext';
import { formatRelative, formatDateTime } from '../../utils/formatters';
import { supabase } from '../../services/supabase';
import { Mail, RefreshCw, Unplug, Building2 } from 'lucide-react';
import { SaveButton } from '../ui/SaveButton';

/**
 * Card showing one connected email inbox (Gmail). Used in the E-post innbokser list.
 */
export function ConnectedInboxCard() {
  const {
    gmailEmail,
    groupEmail,
    lastSyncAt,
    syncing,
    savingGroupEmail,
    error,
    syncNow,
    disconnect,
    updateGroupEmail,
    clearError,
  } = useGmail();
  const { fetchTickets, setAssignmentView } = useTickets();
  const navigate = useNavigate();

  const [groupEmailInput, setGroupEmailInput] = useState(groupEmail ?? '');
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
        const row = data as { last_run_at?: string } | null;
        setCronLastRunAt(row?.last_run_at ?? null);
      });
  }, []);

  const handleSaveGroupEmail = () => {
    const value = groupEmailInput.trim() || null;
    updateGroupEmail(value);
  };

  return (
    <div className="card-panel p-5 border border-[var(--hiver-border)] rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-[var(--hiver-accent)]/10 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-[var(--hiver-accent)]" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-[var(--hiver-text)] truncate">{gmailEmail || 'E-post tilkoblet'}</p>
            {groupEmail && (
              <p className="text-xs text-[var(--hiver-text-muted)] truncate">Gruppe: {groupEmail}</p>
            )}
            {lastSyncAt && (
              <p className="text-xs text-[var(--hiver-text-muted)] mt-0.5">
                Sist synkronisert: {formatRelative(lastSyncAt)}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={async () => {
              const result = await syncNow();
              if (result?.success) {
                fetchTickets();
                if (result.created && result.created > 0) {
                  setAssignmentView('unassigned');
                  navigate('/tickets?view=unassigned');
                }
              }
            }}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synkroniserer…' : 'Sync'}
          </button>
          <button
            type="button"
            onClick={disconnect}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)]"
          >
            <Unplug className="w-4 h-4" />
            Koble fra
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-3 p-2 bg-red-50 text-red-700 text-sm rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="text-red-500 hover:underline text-xs">
            Lukk
          </button>
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-[var(--hiver-border)]">
        <h4 className="text-xs font-medium text-[var(--hiver-text-muted)] flex items-center gap-1.5 mb-2">
          <Building2 className="w-3.5 h-3.5" />
          Gruppe-e-post å speile (valgfritt)
        </h4>
        <div className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={groupEmailInput}
            onChange={(e) => setGroupEmailInput(e.target.value)}
            placeholder="f.eks. support@dittdomene.no"
            className="flex-1 min-w-[180px] rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
          />
          <SaveButton
            onClick={handleSaveGroupEmail}
            loading={savingGroupEmail}
            disabled={groupEmailInput.trim() === (groupEmail ?? '')}
          >
            Lagre
          </SaveButton>
        </div>
        {cronLastRunAt && (
          <p className="text-xs text-[var(--hiver-text-muted)] mt-2">
            Siste sync fra db: {formatDateTime(cronLastRunAt)}
          </p>
        )}
      </div>
    </div>
  );
}
