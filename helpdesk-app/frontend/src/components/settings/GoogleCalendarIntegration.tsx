import { useNavigate } from 'react-router-dom';
import { Calendar, Link2, RefreshCw, Unplug } from 'lucide-react';
import { useGoogleCalendar } from '../../contexts/GoogleCalendarContext';
import { useUnifiedSync } from '../../hooks/useUnifiedSync';
import { formatDateTime } from '../../utils/formatters';
import { useToast } from '../../contexts/ToastContext';

export function GoogleCalendarIntegration({ mode = 'full' }: { mode?: 'full' | 'addOnly' }) {
  const { loading, connection, isGoogleOAuthConfigured, connectGoogleCalendar, disconnect } = useGoogleCalendar();
  const { syncAll, combinedSyncing } = useUnifiedSync();
  const toast = useToast();
  const navigate = useNavigate();

  if (loading) {
    return <div className="text-sm text-[var(--hiver-text-muted)]">Laster…</div>;
  }

  const connectedView = mode === 'full' && connection.connected;

  return (
    <div className="card-panel p-6">
      <h2 className="text-lg font-semibold text-[var(--hiver-text)] flex items-center gap-2">
        <Calendar className="w-5 h-5" />
        Google Kalender
      </h2>

      {connectedView ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-[var(--hiver-text-muted)]">
            Kalender er koblet til for denne organisasjonen.
          </p>
          {connection.connectedAt && (
            <p className="text-xs text-[var(--hiver-text-muted)]">
              Koblet til: {formatDateTime(connection.connectedAt)}
            </p>
          )}
          {connection.lastSyncAt && (
            <p className="text-xs text-[var(--hiver-text-muted)]">
              Sist synk: {formatDateTime(connection.lastSyncAt)}
            </p>
          )}
          <div className="flex gap-2">
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
              title="Samme som synk i toppfeltet"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${combinedSyncing ? 'animate-spin' : ''}`} />
              Synkroniser nå
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
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-[var(--hiver-text-muted)]">
            Koble til Google Kalender for å aktivere kalendersynk mot siden `Kalender`.
          </p>
          <button
            type="button"
            onClick={connectGoogleCalendar}
            disabled={!isGoogleOAuthConfigured}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
          >
            <Link2 className="w-4 h-4" />
            Autoriser Google Kalender
          </button>
          {!isGoogleOAuthConfigured && (
            <p className="text-xs text-amber-700">
              Google OAuth er ikke konfigurert for denne organisasjonen. Legg inn Client ID/Secret først.
            </p>
          )}
          {mode === 'addOnly' && (
            <button
              type="button"
              onClick={() => navigate('/settings?tab=inboxes')}
              className="ml-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
            >
              Tilbake
            </button>
          )}
        </div>
      )}
    </div>
  );
}
