import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TicketList } from '../components/tickets/TicketList';
import { TicketDetail } from '../components/tickets/TicketDetail';
import { useTickets, type AssignmentView } from '../contexts/TicketContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../services/supabase';
import { sendGmailForward } from '../services/api';
import { List } from 'lucide-react';

const VIEWS: { view: AssignmentView; label: string }[] = [
  { view: 'mine', label: 'Mine' },
  { view: 'unassigned', label: 'Ufordelte' },
  { view: 'team', label: 'Team' },
  { view: 'all', label: 'Alle åpne saker' },
  { view: 'archived', label: 'Arkivert' },
];

const VIEW_LABELS: Record<AssignmentView, string> = {
  all: 'Alle åpne saker',
  mine: 'Mine',
  unassigned: 'Ufordelte',
  team: 'Team',
  archived: 'Arkivert',
};

export function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId } = useTenant();
  const { createTicket, selectTicket, selectedTicket, assignmentView, setAssignmentView, tickets, viewCounts } = useTickets();
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selectId = searchParams.get('select');
  const urlView = searchParams.get('view');
  const openNew = searchParams.get('new') === '1';
  /** On small screens: when a ticket is selected, list is hidden by default; toggle opens overlay. */
  const [listOverlayOpen, setListOverlayOpen] = useState(false);

  // Sync view from URL on mount / when navigating from notification link (e.g. /tickets?view=all&select=id)
  useEffect(() => {
    const view = (urlView && VIEW_LABELS[urlView as AssignmentView] ? urlView : 'mine') as AssignmentView;
    setAssignmentView(view);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!next.has('view')) next.set('view', view);
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectId || tickets.length === 0) return;
    const ticket = tickets.find((t) => t.id === selectId);
    if (ticket) {
      selectTicket(ticket);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('select');
        return next;
      }, { replace: true });
    }
  }, [selectId, tickets, selectTicket, setSearchParams]);

  useEffect(() => {
    if (openNew) {
      setShowNew(true);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('new');
        return next;
      }, { replace: true });
    }
  }, [openNew, setSearchParams]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    setSubmitting(true);
    setCreateError(null);
    let customerId: string | null = null;
    const email = customerEmail.trim();
    if (email && currentTenantId) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', currentTenantId)
        .eq('email', email)
        .maybeSingle();
      if (existing && typeof existing === 'object' && 'id' in existing) {
        customerId = (existing as { id: string }).id;
      } else {
        const { data: inserted } = await supabase
          .from('customers')
          .insert({ email, tenant_id: currentTenantId } as unknown as Record<string, unknown>)
          .select('id')
          .single();
        if (inserted && typeof inserted === 'object' && 'id' in inserted) {
          customerId = (inserted as { id: string }).id;
        }
      }
    }
    let due_date: string | null = null;
    if (currentTenantId) {
      const { data: setting } = await supabase
        .from('company_settings')
        .select('value')
        .eq('tenant_id', currentTenantId)
        .eq('key', 'expected_solution_days')
        .maybeSingle();
      const days = typeof (setting as { value?: unknown } | null)?.value === 'number'
        ? (setting as { value: number }).value
        : 0;
      if (days > 0) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        due_date = d.toISOString();
      }
    }
    const ticket = await createTicket({
      subject: subject.trim(),
      customer_id: customerId,
      status: 'open',
      priority: 'medium',
      due_date,
    });
    if (ticket) {
      if (email) {
        const ticketRef = ticket.ticket_number ?? ticket.id.slice(0, 8);
        const body = `Vi har mottatt henvendelsen din.\n\nReferanse: ${ticketRef}\n\nVi kommer tilbake til deg så snart vi kan.`;
        const sent = await sendGmailForward(email, subject.trim(), body);
        if (!sent.success) setCreateError(sent.error ?? 'E-post kunne ikke sendes');
      }
      setShowNew(false);
      setSubject('');
      setCustomerEmail('');
      selectTicket(ticket);
    }
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--hiver-bg)] p-6 gap-4 min-h-0">
      {showNew && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="card-panel p-6 w-full max-w-md shadow-[var(--hiver-shadow-md)]">
            <h2 className="text-lg font-semibold text-[var(--hiver-text)] mb-4">Opprett sak</h2>
            <form onSubmit={handleCreateTicket} className="space-y-3">
              {createError && (
                <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  Saken ble opprettet, men e-post til kunden kunne ikke sendes: {createError}
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Emne</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm focus:border-[var(--hiver-accent)] focus:ring-1 focus:ring-[var(--hiver-accent)] outline-none"
                  placeholder="Kort beskrivelse"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Kunde-e-post (valgfritt)</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm focus:border-[var(--hiver-accent)] focus:ring-1 focus:ring-[var(--hiver-accent)] outline-none"
                  placeholder="kunde@eksempel.no"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)]"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
                >
                  {submitting ? 'Oppretter…' : 'Opprett'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="shrink-0 flex gap-1 px-3 py-2 rounded-xl border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] w-fit shadow-[var(--hiver-shadow)]">
        {VIEWS.map(({ view, label }) => (
          <button
            key={view}
            type="button"
            onClick={() => {
              setAssignmentView(view);
              setSearchParams({ view });
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 ${
              assignmentView === view
                ? 'bg-[var(--hiver-selected-bg)] text-[var(--hiver-accent)]'
                : 'text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]'
            }`}
          >
            <span>{label}</span>
            <span className="tabular-nums text-xs opacity-80">({viewCounts[view]})</span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex min-h-0 gap-4 relative">
        {/* List: on md+ always visible; on small screens overlay when listOverlayOpen, else hidden when a ticket is selected */}
        <div
          className={`
            rounded-xl overflow-hidden border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] shadow-[var(--hiver-shadow)] flex flex-col
            md:min-w-0 md:shrink-0 md:w-full md:max-w-md
            max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:rounded-none max-md:border-0 max-md:shadow-xl
            ${selectedTicket && !listOverlayOpen ? 'max-md:hidden' : 'max-md:flex'}
            ${selectedTicket && listOverlayOpen ? 'max-md:w-[min(100%,20rem)]' : 'max-md:w-full max-md:max-w-full'}
          `}
        >
          <TicketList
            listHeaderTitle={VIEW_LABELS[assignmentView]}
            filteringModeLabel={VIEW_LABELS[assignmentView]}
            onNewTicket={() => setShowNew(true)}
            onSelectTicket={() => setListOverlayOpen(false)}
            overlayCloseButton={selectedTicket ? () => setListOverlayOpen(false) : undefined}
          />
        </div>
        {/* Backdrop when list overlay is open on small screen */}
        {listOverlayOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-10 md:hidden"
            aria-hidden
            onClick={() => setListOverlayOpen(false)}
          />
        )}
        {/* Detail: full width on small when ticket selected; show "open list" button */}
        <div className="flex-1 min-w-0 flex rounded-xl overflow-hidden border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] shadow-[var(--hiver-shadow)] relative">
          {selectedTicket && (
            <button
              type="button"
              onClick={() => setListOverlayOpen(true)}
              className="md:hidden absolute top-2 left-2 z-10 p-2 rounded-lg bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)] shadow-sm"
              aria-label="Åpne samtalerliste"
            >
              <List className="w-5 h-5" />
            </button>
          )}
          <TicketDetail />
        </div>
      </div>
    </div>
  );
}
