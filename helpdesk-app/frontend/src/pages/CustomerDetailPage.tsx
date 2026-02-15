import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useToast } from '../contexts/ToastContext';
import { useMasterData } from '../contexts/MasterDataContext';
import type { Customer } from '../types/customer';
import type { Ticket } from '../types/ticket';
import { CustomerInfo } from '../components/customers/CustomerInfo';
import { CustomerHistory } from '../components/customers/CustomerHistory';
import { TicketDetailModal } from '../components/tickets/TicketDetailModal';
import { ArrowLeft, Trash2, Loader2, Search, ChevronDown } from 'lucide-react';

const PAGE_SIZE = 25;

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTenantId } = useTenant();
  const toast = useToast();
  const { statuses } = useMasterData();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ticketCount, setTicketCount] = useState<number | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [hasMoreTickets, setHasMoreTickets] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [ticketModalId, setTicketModalId] = useState<string | null>(null);
  const [ticketsRefreshKey, setTicketsRefreshKey] = useState(0);

  // Load customer and total ticket count (for delete-button logic)
  useEffect(() => {
    if (!id || !currentTenantId) return;
    Promise.all([
      supabase.from('customers').select('*').eq('id', id).eq('tenant_id', currentTenantId).single(),
      supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('customer_id', id).eq('tenant_id', currentTenantId),
    ]).then(([cust, countRes]) => {
      setCustomer(cust.data as Customer | null);
      setTicketCount(countRes.count ?? 0);
      setLoading(false);
    });
  }, [id, currentTenantId]);

  // Build and run tickets query (first page when filter/search change)
  const fetchTickets = useCallback(
    async (offset: number, append: boolean) => {
      if (!id || !currentTenantId) return;
      let q = supabase
        .from('tickets')
        .select('*')
        .eq('customer_id', id)
        .eq('tenant_id', currentTenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (filterStatus) q = q.eq('status', filterStatus);
      if (searchQuery.trim()) {
        const term = `%${searchQuery.trim().replace(/[%_\\]/g, '\\$&')}%`;
        q = q.or(`subject.ilike.${term},ticket_number.ilike.${term}`);
      }
      const { data, error } = await q;
      if (error) {
        toast.error(error.message);
        return;
      }
      const list = (data as Ticket[]) || [];
      if (append) setTickets((prev) => [...prev, ...list]);
      else setTickets(list);
      setHasMoreTickets(list.length === PAGE_SIZE);
    },
    [id, currentTenantId, filterStatus, searchQuery, toast]
  );

  // When filter or search changes (or refresh after modal close), reset and load first page
  useEffect(() => {
    if (!id || !currentTenantId) return;
    setTicketsLoading(true);
    setTickets([]);
    fetchTickets(0, false).finally(() => setTicketsLoading(false));
  }, [id, currentTenantId, filterStatus, searchQuery, fetchTickets, ticketsRefreshKey]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const handleLoadMore = async () => {
    if (!id || !currentTenantId || loadingMore || !hasMoreTickets) return;
    setLoadingMore(true);
    await fetchTickets(tickets.length, true);
    setLoadingMore(false);
  };

  async function handleDeleteCustomer() {
    if (!id || !currentTenantId || (ticketCount != null && ticketCount > 0)) return;
    if (!window.confirm('Er du sikker på at du vil slette denne kunden? Denne handlingen kan ikke angres.')) return;
    setDeleting(true);
    const { error } = await supabase.from('customers').delete().eq('id', id).eq('tenant_id', currentTenantId);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Kunden er slettet');
    navigate('/customers');
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <p className="text-[var(--hiver-text-muted)] text-sm">Laster…</p>
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-[var(--hiver-text-muted)] text-sm">Kunden ble ikke funnet.</p>
        <Link
          to="/customers"
          className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-[var(--hiver-accent)] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Tilbake til kunder
        </Link>
      </div>
    );
  }

  const handleCloseTicketModal = () => {
    setTicketModalId(null);
    setTicketsRefreshKey((k) => k + 1);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col min-h-0">
      {ticketModalId && (
        <TicketDetailModal ticketId={ticketModalId} onClose={handleCloseTicketModal} />
      )}
      <div className="flex items-center justify-between gap-4 mb-6 shrink-0">
        <Link
          to="/customers"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--hiver-accent)] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Tilbake til kunder
        </Link>
        {ticketCount !== null && ticketCount === 0 && (
          <button
            type="button"
            onClick={handleDeleteCustomer}
            disabled={deleting}
            className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            title="Slett kunde"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Slett kunde
          </button>
        )}
      </div>

      <div className="shrink-0 mb-6">
        <CustomerInfo customer={customer} />
      </div>

      <div className="card-panel overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="shrink-0 flex flex-col gap-3 px-5 py-4 border-b border-[var(--hiver-border)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-[var(--hiver-text)]">Saker</h2>
            {ticketCount !== null && (
              <span className="text-sm text-[var(--hiver-text-muted)]">
                {ticketCount} {ticketCount === 1 ? 'sak' : 'saker'} totalt
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="flex flex-1 min-w-[200px] max-w-sm">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--hiver-text-muted)]" aria-hidden />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Søk i emne eller saksnummer…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-[var(--hiver-border)] rounded-lg bg-[var(--hiver-bg)] text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]"
                  aria-label="Søk saker"
                />
              </div>
              <button
                type="submit"
                className="ml-2 px-3 py-2 text-sm font-medium text-[var(--hiver-accent)] hover:underline"
              >
                Søk
              </button>
            </form>
            <div className="flex items-center gap-2">
              <label htmlFor="customer-ticket-status" className="text-sm text-[var(--hiver-text-muted)] shrink-0">
                Status:
              </label>
              <div className="relative">
                <select
                  id="customer-ticket-status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 text-sm border border-[var(--hiver-border)] rounded-lg bg-[var(--hiver-bg)] text-[var(--hiver-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]"
                  aria-label="Filtrer på status"
                >
                  <option value="">Alle</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--hiver-text-muted)] pointer-events-none" aria-hidden />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {ticketsLoading ? (
            <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">Laster saker…</div>
          ) : (
            <>
              <CustomerHistory
                tickets={tickets}
                hasActiveFilter={!!(searchQuery || filterStatus)}
                onSelectTicket={(ticket) => setTicketModalId(ticket.id)}
              />
              {hasMoreTickets && (
                <div className="p-4 flex justify-center border-t border-[var(--hiver-border)]">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--hiver-accent)] hover:underline disabled:opacity-50"
                  >
                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Last flere ({tickets.length} vist)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
