import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useMasterData } from '../contexts/MasterDataContext';
import { formatListTime } from '../utils/formatters';
import {
  Inbox,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import type { Ticket } from '../types/ticket';

const STATUS_COLOR_CLASS: Record<string, string> = {
  new: 'text-[var(--status-new)]',
  pending: 'text-[var(--status-pending)]',
  resolved: 'text-[var(--status-resolved)]',
  closed: 'text-[var(--status-closed)]',
  neutral: 'text-[var(--hiver-text-muted)]',
};

export function DashboardPage() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { statuses } = useMasterData();
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [mine, setMine] = useState(0);
  const [unassigned, setUnassigned] = useState(0);
  const [recent, setRecent] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenantId) {
      setStatusCounts({});
      setTotal(0);
      setMine(0);
      setUnassigned(0);
      setRecent([]);
      setLoading(false);
      return;
    }
    async function load() {
      const { data: tickets } = await supabase
        .from('tickets')
        .select(`
          *,
          customer:customers(email, name)
        `)
        .eq('tenant_id', currentTenantId)
        .order('updated_at', { ascending: false })
        .limit(100);
      const list = (tickets ?? []) as Ticket[];
      const byStatus: Record<string, number> = {};
      statuses.forEach((s) => {
        byStatus[s.code] = list.filter((t) => t.status === s.code).length;
      });
      setStatusCounts(byStatus);
      setTotal(list.length);
      setMine(user ? list.filter((t) => t.assigned_to === user.id).length : 0);
      setUnassigned(list.filter((t) => !t.assigned_to).length);
      setRecent(list.slice(0, 8));
      setLoading(false);
    }
    load();
  }, [user?.id, statuses, currentTenantId]);

  const statusCards = statuses.map((s) => ({
    title: s.label,
    value: statusCounts[s.code] ?? 0,
    icon: s.code === 'open' ? Clock : s.code === 'resolved' ? CheckCircle : s.code === 'closed' ? XCircle : Clock,
    color: STATUS_COLOR_CLASS[s.color] ?? STATUS_COLOR_CLASS.neutral,
  }));
  const cards = [
    { title: 'Totalt antall saker', value: total, icon: Inbox, color: 'text-[var(--hiver-accent)]' },
    ...statusCards,
    { title: 'Mine', value: mine, icon: MessageSquare, color: 'text-[var(--hiver-accent)]' },
    { title: 'Ufordelte', value: unassigned, icon: AlertCircle, color: 'text-[var(--status-pending)]' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--hiver-text)]">Dashbord</h1>
          <p className="text-sm text-[var(--hiver-text-muted)] mt-0.5">
            Oversikt over support-helpdesken
          </p>
        </div>
        <Link
          to="/tickets?view=mine"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
        >
          <Plus className="w-4 h-4" />
          Ny sak
        </Link>
      </div>

      {loading ? (
        <div className="text-[var(--hiver-text-muted)] text-sm">Laster…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            {cards.map(({ title, value, icon: Icon, color }) => (
              <div
                key={title}
                className="card-panel p-5 flex items-start justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--hiver-text-muted)]">{title}</p>
                  <p className="text-2xl font-semibold text-[var(--hiver-text)] mt-0.5">{value}</p>
                </div>
                <div className={`shrink-0 ${color}`}>
                  <Icon className="w-8 h-8" />
                </div>
              </div>
            ))}
          </div>

          <div className="card-panel overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--hiver-border)]">
              <h2 className="text-base font-semibold text-[var(--hiver-text)]">Siste aktivitet</h2>
              <Link
                to="/tickets"
                className="text-sm font-medium text-[var(--hiver-accent)] hover:underline inline-flex items-center gap-1"
              >
                Se alle
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">
                Ingen saker ennå. Opprett en fra Saker-siden.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--hiver-border)]">
                {recent.map((t) => (
                  <li key={t.id}>
                    <Link
                      to="/tickets"
                      className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--hiver-bg)] transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-[var(--hiver-accent-light)] text-[var(--hiver-accent)] flex items-center justify-center text-sm font-medium shrink-0">
                        {(t.customer?.name || t.customer?.email || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--hiver-text)] truncate">
                          {t.subject}
                        </p>
                        <p className="text-xs text-[var(--hiver-text-muted)]">
                          {t.ticket_number}
                          {t.customer?.email ? ` · ${t.customer.email}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-[var(--hiver-text-muted)] shrink-0">
                        {formatListTime(t.updated_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
