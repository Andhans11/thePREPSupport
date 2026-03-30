import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useTickets } from '../../contexts/TicketContext';
import { useToast } from '../../contexts/ToastContext';
import type { Ticket } from '../../types/ticket';
import { StatusBadge } from './StatusBadge';

type TicketRow = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  updated_at: string;
};

export default function TicketCustomerCasesTab({
  customerId,
  tenantId,
  currentTicketId,
}: {
  customerId: string | null;
  tenantId: string | null;
  currentTicketId: string;
}) {
  const { selectTicket } = useTickets();
  const toast = useToast();
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId || !tenantId) {
      setRows([]);
      setFetchError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    void (async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, ticket_number, subject, status, updated_at')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        setRows([]);
        setFetchError(error.message);
        setLoading(false);
        return;
      }
      setRows((data as TicketRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, tenantId]);

  async function openTicketRow(id: string) {
    if (id === currentTicketId) return;
    setOpeningId(id);
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*, customer:customers(email, name), team:teams(id, name)')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        toast.error(error?.message ?? 'Kunne ikke åpne saken');
        return;
      }
      selectTicket(data as Ticket);
    } finally {
      setOpeningId(null);
    }
  }

  if (!customerId) {
    return (
      <p className="text-sm text-[var(--hiver-text-muted)]">
        Ingen kunde er knyttet til denne saken, så andre saker kan ikke vises her.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="text-sm text-[var(--hiver-text-muted)]" role="status">
        Henter saker…
      </p>
    );
  }

  if (fetchError) {
    return <p className="text-sm text-red-600">{fetchError}</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--hiver-text-muted)]">Ingen saker funnet for denne kunden.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            disabled={openingId !== null}
            onClick={() => void openTicketRow(t.id)}
            className={`w-full text-left rounded-lg border px-2 py-2 transition-colors disabled:opacity-60 ${
              t.id === currentTicketId
                ? 'border-[var(--hiver-accent)] bg-[var(--hiver-selected-bg)]'
                : 'border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] hover:bg-[var(--hiver-bg)]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-mono text-[var(--hiver-text-muted)]">#{t.ticket_number}</span>
              {t.id === currentTicketId && (
                <span className="text-[10px] font-medium text-[var(--hiver-accent)] shrink-0">Nåværende</span>
              )}
            </div>
            <p className="text-sm font-medium text-[var(--hiver-text)] line-clamp-2 mt-0.5">{t.subject}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={t.status} />
              <span className="text-[10px] text-[var(--hiver-text-muted)]">
                {new Date(t.updated_at).toLocaleDateString('nb-NO', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
