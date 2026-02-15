import { Link } from 'react-router-dom';
import { Mail, Plus } from 'lucide-react';
import { useGmail } from '../../contexts/GmailContext';
import { ConnectedInboxCard } from './ConnectedInboxCard';

/**
 * Settings tab "E-post innbokser": list connected inboxes and link to add new.
 */
export function EmailInboxesSettings() {
  const { isConnected, loading } = useGmail();

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
    </div>
  );
}
