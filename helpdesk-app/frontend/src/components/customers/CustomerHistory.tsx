import { Link } from 'react-router-dom';
import type { Ticket } from '../../types/ticket';
import { formatListTime } from '../../utils/formatters';
import { StatusBadge } from '../tickets/StatusBadge';
import { ArrowRight } from 'lucide-react';

function getInitial(subject: string): string {
  const s = (subject || '?').trim();
  if (!s) return '?';
  const first = s[0].toUpperCase();
  const second = s.length > 1 ? s[1].toUpperCase() : '';
  return first + second;
}

interface CustomerHistoryProps {
  tickets: Ticket[];
}

export function CustomerHistory({ tickets }: CustomerHistoryProps) {
  if (tickets.length === 0) {
    return (
      <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">
        Ingen saker for denne kunden.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--hiver-border)]">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <Link
            to={`/tickets?select=${ticket.id}&view=all`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--hiver-bg)] transition-colors"
          >
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-full bg-[var(--hiver-accent)]/15 text-[var(--hiver-accent)] text-sm font-medium flex items-center justify-center">
                {getInitial(ticket.subject)}
              </div>
              {ticket.status === 'open' && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--hiver-unread-dot)]"
                  aria-hidden
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-[var(--hiver-text)] truncate">
                  {ticket.ticket_number}
                </span>
                <span className="text-xs text-[var(--hiver-text-muted)] shrink-0">
                  {formatListTime(ticket.updated_at)}
                </span>
              </div>
              <p className="text-sm font-medium text-[var(--hiver-text)] truncate mt-0.5">
                {ticket.subject}
              </p>
              <div className="mt-1">
                <StatusBadge status={ticket.status} />
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[var(--hiver-text-muted)] shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
