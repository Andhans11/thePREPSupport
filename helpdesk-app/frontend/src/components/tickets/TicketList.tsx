import { useState, useEffect, useRef } from 'react';
import { useTickets } from '../../contexts/TicketContext';
import { useAuth } from '../../contexts/AuthContext';
import { useMasterData } from '../../contexts/MasterDataContext';
import { useCurrentUserRole } from '../../hooks/useCurrentUserRole';
import { isAdmin } from '../../types/roles';
import { formatListTime } from '../../utils/formatters';
import type { Ticket } from '../../types/ticket';
import { StatusBadge } from './StatusBadge';
import { Search, Plus, Archive, Trash2, UserPlus, X } from 'lucide-react';

const ARCHIVED_STATUS = 'archived';

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

function TicketRow({
  ticket,
  categories,
  isSelected,
  onSelect,
  onArchive,
  onDelete,
  onAssignToMe,
}: {
  ticket: Ticket;
  categories: { id: string; name: string; color_hex?: string | null }[];
  isSelected: boolean;
  onSelect: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onAssignToMe?: () => void;
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
            onAssignToMe();
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
        onClick={onSelect}
        className={`flex-1 min-w-0 text-left px-3 py-3 hover:bg-[var(--hiver-bg)] transition-colors flex gap-2 items-center ${
          isSelected ? 'bg-[var(--hiver-selected-bg)]' : ''
        }`}
      >
        <div className="w-3 shrink-0 flex items-center justify-center">
          {isNew && (
            <span
              className="w-2.5 h-2.5 rounded-full bg-[var(--hiver-unread-dot)]"
              aria-hidden
            />
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
          onClick={onArchive}
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
          onClick={onDelete}
          className="shrink-0 p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-red-100 hover:text-red-600 self-center"
          title="Slett sak"
          aria-label="Slett sak"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

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
  const { tickets, selectedTicket, selectTicket, loading, error, fetchTickets, loadMoreTickets, updateTicket, deleteTicket, assignmentView, loadingMore, hasMoreTickets } = useTickets();
  const { user } = useAuth();
  const { role } = useCurrentUserRole();
  const { categories, statuses } = useMasterData();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMoreTickets || loadingMore) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreTickets();
      },
      { root: el.parentElement, rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreTickets, loadingMore, loadMoreTickets]);

  const isArchivedView = assignmentView === 'archived';
  const listTickets = isArchivedView
    ? tickets
    : tickets.filter((t) => t.status !== ARCHIVED_STATUS && (assignmentView !== 'all' || t.status !== 'closed'));
  const showArchiveButton = !isArchivedView;
  const showDeleteButton = isArchivedView && isAdmin(role);

  const applyFilters = (status?: string) => {
    const nextStatus = status !== undefined ? status : statusFilter;
    fetchTickets({
      status: nextStatus || undefined,
      search: search.trim() || undefined,
      assignmentView,
      userId: user?.id ?? null,
    });
  };

  const handleSearch = () => applyFilters();
  const hasSearchText = search.trim().length > 0;
  const clearSearch = () => {
    setSearch('');
    fetchTickets({
      status: statusFilter || undefined,
      search: undefined,
      assignmentView,
      userId: user?.id ?? null,
    });
  };
  const handleQuickFilter = (code: string) => {
    const next = code === '' || statusFilter === code ? '' : code;
    setStatusFilter(next);
    fetchTickets({
      status: next || undefined,
      search: search.trim() || undefined,
      assignmentView,
      userId: user?.id ?? null,
    });
  };

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
                !statusFilter
                  ? 'bg-[var(--hiver-accent)] text-white'
                  : 'bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-border)] hover:text-[var(--hiver-text)]'
              }`}
            >
              Alle
            </button>
            {statuses.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleQuickFilter(s.code)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                  statusFilter === s.code
                    ? 'text-white'
                    : 'bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-border)] hover:text-[var(--hiver-text)]'
                }`}
                style={statusFilter === s.code && s.color_hex ? { backgroundColor: s.color_hex } : undefined}
              >
                {s.label}
              </button>
            ))}
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
            <ul className="divide-y divide-[var(--hiver-border)]">
              {listTickets.map((ticket: Ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  categories={categories}
                  isSelected={selectedTicket?.id === ticket.id}
                  onSelect={() => {
                    selectTicket(ticket);
                    onSelectTicket?.();
                  }}
                  onArchive={showArchiveButton ? () => updateTicket(ticket.id, { status: ARCHIVED_STATUS }) : undefined}
                  onDelete={
                    showDeleteButton
                      ? () => {
                          if (window.confirm('Er du sikker på at du vil slette denne saken permanent? Denne handlingen kan ikke angres.')) {
                            deleteTicket(ticket.id);
                          }
                        }
                      : undefined
                  }
                  onAssignToMe={
                    user && !ticket.assigned_to
                      ? () => updateTicket(ticket.id, { assigned_to: user.id, status: 'pending' })
                      : undefined
                  }
                />
              ))}
            </ul>
            {hasMoreTickets && (
              <div ref={loadMoreSentinelRef} className="min-h-[1px]" aria-hidden>
                {loadingMore && (
                  <div className="py-3 text-center text-sm text-[var(--hiver-text-muted)]">Laster flere…</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
