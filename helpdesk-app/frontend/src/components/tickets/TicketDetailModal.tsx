import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useTickets } from '../../contexts/TicketContext';
import { TicketDetail } from './TicketDetail';
import type { Ticket } from '../../types/ticket';
import { X, Loader2, ExternalLink } from 'lucide-react';

const TICKET_SELECT = '*, customer:customers(id, email, name), team:teams(id, name)';

interface TicketDetailModalProps {
  ticketId: string;
  onClose: () => void;
}

export function TicketDetailModal({ ticketId, onClose }: TicketDetailModalProps) {
  const { selectTicket, fetchMessages, selectedTicket } = useTickets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    (async () => {
      const { data: ticketData, error: ticketErr } = await supabase
        .from('tickets')
        .select(TICKET_SELECT)
        .eq('id', ticketId)
        .single();
      if (cancelled) return;
      if (ticketErr || !ticketData) {
        setError(ticketErr?.message ?? 'Kunne ikke laste saken');
        setLoading(false);
        return;
      }
      const ticket = ticketData as Ticket;
      selectTicket(ticket);
      await fetchMessages(ticketId);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, selectTicket, fetchMessages]);

  const handleRequestClose = () => {
    selectTicket(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-modal-title"
      onClick={(e) => e.target === e.currentTarget && handleRequestClose()}
    >
      <div
        className="flex flex-col w-full max-w-6xl h-[90vh] max-h-[900px] rounded-xl border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-[var(--hiver-border)] bg-[var(--hiver-bg)]/80">
          <div className="min-w-0 flex items-center gap-3">
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--hiver-text-muted)]" aria-hidden />
            ) : error ? (
              <span className="text-sm text-red-600">{error}</span>
            ) : (
              <h2 id="ticket-modal-title" className="text-base font-semibold text-[var(--hiver-text)] truncate min-w-0">
                {selectedTicket?.subject ?? selectedTicket?.ticket_number ?? 'Sak'}
              </h2>
            )}
            <Link
              to={`/tickets?select=${ticketId}&view=all`}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--hiver-accent)] hover:underline"
              onClick={handleRequestClose}
            >
              <ExternalLink className="w-4 h-4" />
              Åpne i full visning
            </Link>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="shrink-0 p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Lukk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[var(--hiver-text-muted)] text-sm">
              Laster sak…
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <button
                type="button"
                onClick={handleRequestClose}
                className="px-4 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
              >
                Lukk
              </button>
            </div>
          ) : (
            <div className="flex-1 min-w-0 overflow-hidden">
              <TicketDetail onRequestClose={handleRequestClose} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
