import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTickets } from '../../contexts/TicketContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useMasterData } from '../../contexts/MasterDataContext';
import { supabase } from '../../services/supabase';
import { useCurrentUserRole } from '../../hooks/useCurrentUserRole';
import { isAdmin } from '../../types/roles';
import { formatListTime } from '../../utils/formatters';
import type { Ticket } from '../../types/ticket';
import { StatusBadge } from './StatusBadge';
import { Search, Plus, Archive, Trash2, UserPlus, User, MessageCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';

const ARCHIVED_STATUS = 'archived';
const SEARCH_DEBOUNCE_MS = 400;

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Lav',
  medium: 'Middels',
  high: 'Høy',
  urgent: 'Haster',
};

function formatDueInfo(dueDate: string | null): { text: string; isOverdue: boolean } | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return { text: `Forfalt ${Math.abs(diffDays)} d`, isOverdue: true };
  if (diffDays === 0) return { text: 'I dag', isOverdue: false };
  if (diffDays === 1) return { text: '1 dag', isOverdue: false };
  return { text: `${diffDays} dager`, isOverdue: false };
}

const TicketRow = memo(function TicketRow({
  ticket,
  categories,
  assigneeName,
  hasUnreadCustomerReply,
  isSelected,
  onSelect,
  onArchive,
  onDelete,
  onAssignToMe,
}: {
  ticket: Ticket;
  categories: { id: string; name: string; color_hex?: string | null }[];
  assigneeName: string | null;
  hasUnreadCustomerReply: boolean;
  isSelected: boolean;
  onSelect: (ticket: Ticket) => void;
  onArchive?: (ticketId: string) => void;
  onDelete?: (ticketId: string) => void;
  onAssignToMe?: (ticketId: string) => void;
}) {
  const senderName = ticket.customer?.name || ticket.customer?.email || 'Ukjent';
  const senderEmail = ticket.customer?.email ?? null;
  const isNew = ticket.status === 'open';
  const cat = ticket.category ? categories.find((c) => c.name === ticket.category) : null;
  const catColor = cat?.color_hex ?? '#6b7280';
  const isUnassigned = !ticket.assigned_to;
  const priorityLabel = PRIORITY_LABELS[ticket.priority] ?? ticket.priority;
  const dueInfo = formatDueInfo(ticket.due_date ?? null);

  return (
    <li className="flex">
      {onAssignToMe && isUnassigned && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAssignToMe(ticket.id);
          }}
          className="shrink-0 p-2 flex items-center justify-center text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-accent)] transition-colors self-center"
          title="Tildel til meg"
          aria-label="Tildel til meg"
        >
          <UserPlus className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onSelect(ticket)}
        className={`flex-1 min-w-0 text-left px-3 py-3 hover:bg-[var(--hiver-bg)] transition-colors flex gap-2 items-center ${
          isSelected ? 'bg-[var(--hiver-selected-bg)]' : ''
        }`}
      >
        <div className="w-3 shrink-0 flex items-center justify-center gap-0.5">
          {isNew && (
            <span
              className="w-2.5 h-2.5 rounded-full bg-[var(--hiver-unread-dot)]"
              aria-hidden
            />
          )}
          {hasUnreadCustomerReply && (
            <span
              className="flex items-center justify-center text-[var(--hiver-accent)]"
              title="Ny oppdatering fra kunde"
              aria-label="Ny oppdatering fra kunde"
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-sm font-medium text-[var(--hiver-text)] truncate block">
                {senderName}
              </span>
              {senderEmail && (
                <p className="text-xs text-[var(--hiver-text-muted)] truncate mt-0.5">
                  {senderEmail}
                </p>
              )}
            </div>
            <span className="text-xs text-[var(--hiver-text-muted)] shrink-0 flex items-center gap-2">
              {ticket.ticket_number && (
                <span className="font-mono text-[10px] bg-[var(--hiver-bg)] px-1.5 py-0.5 rounded">
                  {ticket.ticket_number}
                </span>
              )}
              {formatListTime(ticket.updated_at)}
            </span>
          </div>
          <p className="text-sm font-medium text-[var(--hiver-text)] truncate mt-0.5">
            {ticket.subject}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <StatusBadge status={ticket.status} />
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)]">
              {priorityLabel}
            </span>
            {assigneeName && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)]"
                title={`Tildelt: ${assigneeName}`}
              >
                <User className="w-3 h-3 shrink-0" aria-hidden />
                {assigneeName}
              </span>
            )}
            {ticket.category && (
              <span
                className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                style={{ backgroundColor: catColor }}
              >
                {ticket.category}
              </span>
            )}
            {dueInfo && (
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  dueInfo.isOverdue ? 'bg-red-100 text-red-700' : 'text-[var(--hiver-text-muted)]'
                }`}
              >
                {dueInfo.text}
              </span>
            )}
          </div>
        </div>
      </button>
      {onArchive && (
        <button
          type="button"
          onClick={() => onArchive(ticket.id)}
          className="shrink-0 p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-border)] hover:text-[var(--hiver-text)] self-center"
          title="Arkiver sak"
          aria-label="Arkiver sak"
        >
          <Archive className="w-4 h-4" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(ticket.id)}
          className="shrink-0 p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-red-100 hover:text-red-600 self-center"
          title="Slett sak"
          aria-label="Slett sak"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
});

interface TicketListProps {
  listHeaderTitle: string;
  filteringModeLabel: string;
  onNewTicket: () => void;
  /** When provided, called when user selects a ticket (e.g. to close overlay on small screens). */
  onSelectTicket?: () => void;
  /** When provided, show a close button in the header (for overlay on small screens). */
  overlayCloseButton?: () => void;
}

export function TicketList({ listHeaderTitle, filteringModeLabel, onNewTicket, onSelectTicket, overlayCloseButton }: TicketListProps) {
  const { tickets, selectedTicket, selectTicket, ticketIdsWithUnreadCustomerMessage, loading, error, fetchTickets, updateTicket, deleteTicket, assignmentView, totalCount, currentPage, totalPages, goToPage } = useTickets();
  const { user } = useAuth();
  const { role } = useCurrentUserRole();
  const { currentTenantId } = useTenant();
  const { categories, statuses } = useMasterData();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string>>({});
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSearchRef = useRef<string>('');

  useEffect(() => {
    if (!currentTenantId) {
      setAssigneeNames({});
      return;
    }
    supabase
      .from('team_members')
      .select('user_id, name')
      .eq('tenant_id', currentTenantId)
      .not('user_id', 'is', null)
      .eq('is_active', true)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((row: { user_id: string; name: string | null }) => {
          if (row.user_id) map[row.user_id] = row.name ?? row.user_id;
        });
        setAssigneeNames(map);
      });
  }, [currentTenantId]);

  const isArchivedView = assignmentView === 'archived';
  /** When top tab is Lukket or Arkivert, the list filter is forced so only that chip is active. */
  const effectiveStatusFilter =
    assignmentView === 'closed' ? 'closed' : assignmentView === 'archived' ? 'archived' : statusFilter;
  /** API returns only non-closed, non-archived by default; closed/archived only when that view or status filter is active. */
  const listTickets = tickets;
  const showArchiveButton = !isArchivedView;
  const showDeleteButton = isArchivedView && isAdmin(role);

  // Sync list filter with top tab: when user selects Lukket or Arkivert tab, only that filter is active
  useEffect(() => {
    if (assignmentView === 'closed') setStatusFilter('closed');
    else if (assignmentView === 'archived') setStatusFilter('archived');
    else setStatusFilter('');
  }, [assignmentView]);

  const applyFilters = useCallback(
    (status?: string) => {
      const nextStatus = status !== undefined ? status : statusFilter;
      fetchTickets({
        status: nextStatus || undefined,
        search: search.trim() || undefined,
        assignmentView,
        userId: user?.id ?? null,
      });
    },
    [statusFilter, search, assignmentView, user?.id, fetchTickets]
  );

  const applyFiltersRef = useRef(applyFilters);
  applyFiltersRef.current = applyFilters;

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === prevSearchRef.current) return;
    prevSearchRef.current = trimmed;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      applyFiltersRef.current();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  const handleSearch = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    prevSearchRef.current = search.trim();
    applyFilters();
  };
  const hasSearchText = search.trim().length > 0;
  const clearSearch = () => {
    prevSearchRef.current = '';
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setSearch('');
    fetchTickets({
      status: statusFilter || undefined,
      search: undefined,
      assignmentView,
      userId: user?.id ?? null,
    });
  };
  const handleQuickFilter = (code: string) => {
    // When top tab is Lukket or Arkivert, only that filter is active; ignore other chip clicks
    if (assignmentView === 'closed' || assignmentView === 'archived') return;
    const next = code === '' || statusFilter === code ? '' : code;
    setStatusFilter(next);
    fetchTickets({
      status: next || undefined,
      search: search.trim() || undefined,
      assignmentView,
      userId: user?.id ?? null,
    });
  };

  const handleSelectTicket = useCallback(
    (ticket: Ticket) => {
      selectTicket(ticket);
      onSelectTicket?.();
    },
    [selectTicket, onSelectTicket]
  );
  const handleArchive = useCallback(
    (ticketId: string) => updateTicket(ticketId, { status: ARCHIVED_STATUS }),
    [updateTicket]
  );
  const handleDelete = useCallback(
    (ticketId: string) => {
      if (window.confirm('Er du sikker på at du vil slette denne saken permanent? Denne handlingen kan ikke angres.')) {
        deleteTicket(ticketId);
      }
    },
    [deleteTicket]
  );
  const handleAssignToMe = useCallback(
    (ticketId: string) => {
      if (user?.id) updateTicket(ticketId, { assigned_to: user.id, status: 'pending' });
    },
    [updateTicket, user?.id]
  );

  return (
    <div className="flex flex-col h-full w-full bg-[var(--hiver-panel-bg)]">
      <div className="shrink-0 border-b border-[var(--hiver-border)]">
        <div className="flex items-center justify-between px-3 py-2 gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--hiver-text)]">{listHeaderTitle}</h2>
            <p className="text-[10px] text-[var(--hiver-text-muted)] mt-0.5">
              Filtermodus: {filteringModeLabel}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onNewTicket}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
            >
              <Plus className="w-4 h-4" />
              Ny
            </button>
            {overlayCloseButton && (
              <button
                type="button"
                onClick={overlayCloseButton}
                className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
                aria-label="Lukk liste"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        <div className="px-2 pb-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--hiver-text-muted)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Søk i samtaler"
              className={`w-full pl-8 py-2 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)] text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30 ${hasSearchText ? 'pr-9' : 'pr-3'}`}
            />
            {hasSearchText && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-border)] hover:text-[var(--hiver-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
                aria-label="Fjern søk"
                title="Fjern søk"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickFilter('')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                !effectiveStatusFilter
                  ? 'bg-[var(--hiver-accent)] text-white'
                  : 'bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-border)] hover:text-[var(--hiver-text)]'
              }`}
            >
              Alle åpne
            </button>
            {statuses.filter((s) => s.code !== 'closed' && s.code !== 'archived').map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleQuickFilter(s.code)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                  effectiveStatusFilter === s.code
                    ? 'text-white'
                    : 'bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-border)] hover:text-[var(--hiver-text)]'
                }`}
                style={effectiveStatusFilter === s.code && s.color_hex ? { backgroundColor: s.color_hex } : undefined}
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleQuickFilter('closed')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                effectiveStatusFilter === 'closed'
                  ? 'text-white'
                  : 'bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-border)] hover:text-[var(--hiver-text)]'
              }`}
              style={effectiveStatusFilter === 'closed' ? { backgroundColor: 'var(--status-closed, #7a7a7a)' } : undefined}
            >
              Lukket
            </button>
            <button
              type="button"
              onClick={() => handleQuickFilter('archived')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                effectiveStatusFilter === 'archived'
                  ? 'text-white'
                  : 'bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-border)] hover:text-[var(--hiver-text)]'
              }`}
              style={effectiveStatusFilter === 'archived' ? { backgroundColor: 'var(--status-archived, #6b7280)' } : undefined}
            >
              Arkivert
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {loading ? (
          <div className="p-4 text-[var(--hiver-text-muted)] text-sm">Laster…</div>
        ) : listTickets.length === 0 ? (
          <div className="p-4 text-[var(--hiver-text-muted)] text-sm">Ingen samtaler.</div>
        ) : (
          <>
            {/* Future: virtualize list (e.g. react-window) for very long ticket lists */}
            <ul className="divide-y divide-[var(--hiver-border)]">
              {listTickets.map((ticket: Ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  categories={categories}
                  assigneeName={ticket.assigned_to ? (assigneeNames[ticket.assigned_to] ?? 'Ukjent') : null}
                  hasUnreadCustomerReply={ticketIdsWithUnreadCustomerMessage.has(ticket.id)}
                  isSelected={selectedTicket?.id === ticket.id}
                  onSelect={handleSelectTicket}
                  onArchive={showArchiveButton ? handleArchive : undefined}
                  onDelete={showDeleteButton ? handleDelete : undefined}
                  onAssignToMe={user && !ticket.assigned_to ? handleAssignToMe : undefined}
                />
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)]">
                <span className="text-xs text-[var(--hiver-text-muted)]">
                  Side {currentPage} av {totalPages} ({totalCount} saker)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1 || loading}
                    className="p-1.5 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] disabled:opacity-50 disabled:pointer-events-none"
                    aria-label="Forrige side"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages || loading}
                    className="p-1.5 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] disabled:opacity-50 disabled:pointer-events-none"
                    aria-label="Neste side"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
