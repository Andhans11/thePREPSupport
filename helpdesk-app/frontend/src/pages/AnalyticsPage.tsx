import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useMasterData } from '../contexts/MasterDataContext';
import { subDays, startOfDay, eachDayOfInterval, format } from 'date-fns';
import {
  BarChart3,
  TrendingUp,
  Inbox,
  Clock,
  AlertCircle,
  UserX,
  MessageCircle,
  Target,
  Filter,
} from 'lucide-react';
import type { TicketPriority } from '../types/database';

const STATUS_BAR_COLOR: Record<string, string> = {
  new: 'bg-[var(--status-new)]',
  open: 'bg-[var(--status-new)]',
  pending: 'bg-[var(--status-pending)]',
  resolved: 'bg-[var(--status-resolved)]',
  closed: 'bg-[var(--status-closed)]',
  archived: 'bg-[var(--hiver-text-muted)]',
  neutral: 'bg-[var(--hiver-text-muted)]',
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Lav',
  medium: 'Medium',
  high: 'Høy',
  urgent: 'Haster',
};

const PRIORITY_ORDER: TicketPriority[] = ['urgent', 'high', 'medium', 'low'];

type DateRangeKey = '7d' | '30d' | '90d' | 'all';

interface TicketRow {
  id: string;
  status: string;
  priority: TicketPriority;
  category: string | null;
  team_id: string | null;
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
  first_response_at: string | null;
  team?: { id: string; name: string } | null;
}

const CHART_PAD = { left: 40, right: 24, top: 16, bottom: 28 };
const CHART_HEIGHT = 200;
const CHART_VIEW_WIDTH = 800;

function TrendChart({
  data,
  yMax,
}: {
  data: { date: string; label: string; opened: number; closed: number }[];
  yMax: number;
}) {
  const width = CHART_VIEW_WIDTH;
  const chartWidth = width - CHART_PAD.left - CHART_PAD.right;
  const chartHeight = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
  const yScale = yMax > 0 ? chartHeight / yMax : 0;
  const n = data.length;
  const stepX = n > 1 ? chartWidth / (n - 1) : 0;
  const toX = (i: number) => CHART_PAD.left + i * stepX;
  const toY = (v: number) => CHART_PAD.top + chartHeight - v * yScale;
  const openedPoints = data.map((d, i) => `${toX(i)},${toY(d.opened)}`).join(' ');
  const closedPoints = data.map((d, i) => `${toX(i)},${toY(d.closed)}`).join(' ');
  const yTicks = yMax <= 5 ? Math.max(1, Math.ceil(yMax)) : 5;
  const yStep = Math.ceil((yMax || 1) / yTicks) || 1;
  const yValues = Array.from({ length: yTicks + 1 }, (_, i) => i * yStep).filter((v) => v <= yMax);
  const xTickIndices =
    n > 10
      ? [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1]
      : Array.from({ length: n }, (_, i) => i);

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        className="w-full max-w-full h-[300px]"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Saker åpnet og lukket per dag"
      >
        {yValues.map((v) => (
          <line
            key={v}
            x1={CHART_PAD.left}
            y1={toY(v)}
            x2={width - CHART_PAD.right}
            y2={toY(v)}
            stroke="var(--hiver-border)"
            strokeWidth="1"
            strokeDasharray="4 2"
          />
        ))}
        {yValues.map((v) => (
          <text
            key={v}
            x={CHART_PAD.left - 6}
            y={toY(v) + 4}
            textAnchor="end"
            className="fill-[var(--hiver-text-muted)]"
            style={{ fontSize: 10, fontFamily: 'inherit' }}
          >
            {v}
          </text>
        ))}
        {xTickIndices.map((i) => {
          if (i >= data.length) return null;
          const d = data[i];
          return (
            <text
              key={d.date}
              x={toX(i)}
              y={CHART_HEIGHT - 6}
              textAnchor="middle"
              className="fill-[var(--hiver-text-muted)]"
              style={{ fontSize: 10, fontFamily: 'inherit' }}
            >
              {format(new Date(d.date), 'd. MMM')}
            </text>
          );
        })}
        <polyline
          points={openedPoints}
          fill="none"
          stroke="var(--hiver-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => (
          <circle
            key={`o-${d.date}`}
            cx={toX(i)}
            cy={toY(d.opened)}
            r="3.5"
            fill="var(--hiver-panel-bg)"
            stroke="var(--hiver-accent)"
            strokeWidth="2"
          />
        ))}
        <polyline
          points={closedPoints}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => (
          <circle
            key={`c-${d.date}`}
            cx={toX(i)}
            cy={toY(d.closed)}
            r="3.5"
            fill="var(--hiver-panel-bg)"
            stroke="#10b981"
            strokeWidth="2"
          />
        ))}
      </svg>
    </div>
  );
}

function formatDuration(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} min`;
  }
  if (hours < 24) return `${Math.round(hours * 10) / 10} t`;
  const days = Math.floor(hours / 24);
  const h = Math.round((hours % 24) * 10) / 10;
  return h > 0 ? `${days} d ${h} t` : `${days} d`;
}

export function AnalyticsPage() {
  const { currentTenantId } = useTenant();
  const { statuses, categories } = useMasterData();
  const [dateRange, setDateRange] = useState<DateRangeKey>('30d');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<TicketPriority[]>([]);
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null);
  const [sortBreakdown, setSortBreakdown] = useState<'valueDesc' | 'valueAsc' | 'label'>('valueDesc');
  const [showFilters, setShowFilters] = useState(false);

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenantId) {
      setTickets([]);
      setTeams([]);
      setLoading(false);
      return;
    }
    async function load() {
      setLoading(true);
      const rangeEnd = new Date();
      const rangeStart =
        dateRange === 'all' ? null : subDays(rangeEnd, dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90);

      let query = supabase
        .from('tickets')
        .select(
          'id, status, priority, category, team_id, assigned_to, created_at, resolved_at, first_response_at, team:teams(id, name)'
        )
        .eq('tenant_id', currentTenantId)
        .order('created_at', { ascending: false });

      if (rangeStart) {
        query = query.gte('created_at', rangeStart.toISOString());
      }

      const [ticketsRes, teamsRes] = await Promise.all([
        query,
        supabase.from('teams').select('id, name').eq('tenant_id', currentTenantId).order('name'),
      ]);

      const list = (ticketsRes.data ?? []) as unknown as TicketRow[];
      setTickets(list);
      setTeams((teamsRes.data as { id: string; name: string }[]) ?? []);
      setLoading(false);
    }
    load();
  }, [currentTenantId, dateRange]);

  const filtered = useMemo(() => {
    let list = tickets;
    if (filterStatus.length) list = list.filter((t) => filterStatus.includes(t.status));
    if (filterPriority.length) list = list.filter((t) => filterPriority.includes(t.priority));
    if (filterCategory.length) list = list.filter((t) => t.category && filterCategory.includes(t.category));
    if (filterTeamId) list = list.filter((t) => t.team_id === filterTeamId);
    return list;
  }, [tickets, filterStatus, filterPriority, filterCategory, filterTeamId]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const resolvedCount = filtered.filter((t) => t.status === 'resolved').length;
    const closedCount = filtered.filter((t) => t.status === 'closed').length;
    const resolutionRate = total ? Math.round((resolvedCount + closedCount) / total * 100) : 0;
    const openStatuses = ['new', 'open', 'pending'];
    const openCount = filtered.filter((t) => openStatuses.includes(t.status)).length;
    const unassignedCount = filtered.filter((t) => !t.assigned_to).length;
    const withFirstResponse = filtered.filter((t) => t.first_response_at);
    const avgFirstResponseHours =
      withFirstResponse.length > 0
        ? withFirstResponse.reduce((sum, t) => {
            const created = new Date(t.created_at).getTime();
            const first = new Date(t.first_response_at!).getTime();
            return sum + (first - created) / (1000 * 60 * 60);
          }, 0) / withFirstResponse.length
        : 0;
    const withResolved = filtered.filter((t) => t.resolved_at);
    const avgResolutionHours =
      withResolved.length > 0
        ? withResolved.reduce((sum, t) => {
            const created = new Date(t.created_at).getTime();
            const resolved = new Date(t.resolved_at!).getTime();
            return sum + (resolved - created) / (1000 * 60 * 60);
          }, 0) / withResolved.length
        : 0;
    const highUrgentCount = filtered.filter((t) => t.priority === 'high' || t.priority === 'urgent').length;
    return {
      total,
      resolutionRate,
      openCount,
      unassignedCount,
      avgFirstResponseHours,
      avgResolutionHours,
      highUrgentCount,
      resolvedCount,
      closedCount,
    };
  }, [filtered]);

  const trendData = useMemo(() => {
    const rangeEnd = new Date();
    const rangeStart =
      dateRange === 'all'
        ? subDays(rangeEnd, 30)
        : subDays(rangeEnd, dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90);
    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
    const openedByDate: Record<string, number> = {};
    const closedByDate: Record<string, number> = {};
    days.forEach((d) => {
      const key = format(d, 'yyyy-MM-dd');
      openedByDate[key] = 0;
      closedByDate[key] = 0;
    });
    filtered.forEach((t) => {
      const keyOpen = format(startOfDay(new Date(t.created_at)), 'yyyy-MM-dd');
      if (openedByDate[keyOpen] !== undefined) openedByDate[keyOpen]++;
      if (t.resolved_at) {
        const keyClosed = format(startOfDay(new Date(t.resolved_at)), 'yyyy-MM-dd');
        if (closedByDate[keyClosed] !== undefined) closedByDate[keyClosed]++;
      }
    });
    return days.map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      return {
        date: key,
        label: format(d, 'd. MMM'),
        opened: openedByDate[key] ?? 0,
        closed: closedByDate[key] ?? 0,
      };
    });
  }, [filtered, dateRange]);

  const statusItems = useMemo(() => {
    const byStatus: Record<string, number> = {};
    statuses.forEach((s) => {
      byStatus[s.code] = filtered.filter((t) => t.status === s.code).length;
    });
    let items = statuses.map((s) => ({
      label: s.label,
      value: byStatus[s.code] ?? 0,
      color: STATUS_BAR_COLOR[s.color] ?? STATUS_BAR_COLOR.neutral,
    }));
    if (sortBreakdown === 'valueDesc') items = [...items].sort((a, b) => b.value - a.value);
    else if (sortBreakdown === 'valueAsc') items = [...items].sort((a, b) => a.value - b.value);
    return items;
  }, [filtered, statuses, sortBreakdown]);

  const priorityItems = useMemo(() => {
    const byPriority: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    filtered.forEach((t) => {
      byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
    });
    let items = PRIORITY_ORDER.map((p) => ({
      label: PRIORITY_LABEL[p],
      value: byPriority[p] ?? 0,
    }));
    if (sortBreakdown === 'valueDesc') items = [...items].sort((a, b) => b.value - a.value);
    else if (sortBreakdown === 'valueAsc') items = [...items].sort((a, b) => a.value - b.value);
    return items;
  }, [filtered, sortBreakdown]);

  const categoryItems = useMemo(() => {
    const byCat: Record<string, number> = {};
    filtered.forEach((t) => {
      const key = t.category || 'Uten kategori';
      byCat[key] = (byCat[key] ?? 0) + 1;
    });
    let items = Object.entries(byCat).map(([label, value]) => ({ label, value }));
    if (sortBreakdown === 'valueDesc') items = [...items].sort((a, b) => b.value - a.value);
    else if (sortBreakdown === 'valueAsc') items = [...items].sort((a, b) => a.value - b.value);
    else items = [...items].sort((a, b) => a.label.localeCompare(b.label));
    return items;
  }, [filtered, sortBreakdown]);

  const teamItems = useMemo(() => {
    const byTeam: Record<string, number> = { '': filtered.filter((t) => !t.team_id).length };
    teams.forEach((t) => {
      byTeam[t.id] = filtered.filter((tk) => tk.team_id === t.id).length;
    });
    let items = [
      ...(byTeam[''] ? [{ label: 'Ikke tildelt team', value: byTeam[''] }] : []),
      ...teams.map((t) => ({ label: t.name, value: byTeam[t.id] ?? 0 })),
    ];
    if (sortBreakdown === 'valueDesc') items = [...items].sort((a, b) => b.value - a.value);
    else if (sortBreakdown === 'valueAsc') items = [...items].sort((a, b) => a.value - b.value);
    return items;
  }, [filtered, teams, sortBreakdown]);

  const funnelSteps = useMemo(() => {
    const newCount = filtered.filter((t) => t.status === 'new' || t.status === 'open').length;
    const pendingCount = filtered.filter((t) => t.status === 'pending').length;
    const resolvedCount = filtered.filter((t) => t.status === 'resolved').length;
    const closedCount = filtered.filter((t) => t.status === 'closed').length;
    return [
      { label: 'Nye / Åpne', value: newCount, color: 'var(--status-new)' },
      { label: 'Venter', value: pendingCount, color: 'var(--status-pending)' },
      { label: 'Løst', value: resolvedCount, color: 'var(--status-resolved)' },
      { label: 'Lukket', value: closedCount, color: 'var(--status-closed)' },
    ];
  }, [filtered]);

  const statusMax = Math.max(...statusItems.map((i) => i.value), 1);
  const trendMax = Math.max(1, ...trendData.flatMap((d) => [d.opened, d.closed]));
  const priorityMax = Math.max(...priorityItems.map((i) => i.value), 1);
  const categoryMax = Math.max(...categoryItems.map((i) => i.value), 1);
  const teamMax = Math.max(...teamItems.map((i) => i.value), 1);
  const funnelMax = Math.max(...funnelSteps.map((s) => s.value), 1);

  const hasActiveFilters =
    filterStatus.length > 0 || filterPriority.length > 0 || filterCategory.length > 0 || filterTeamId != null;

  const clearFilters = () => {
    setFilterStatus([]);
    setFilterPriority([]);
    setFilterCategory([]);
    setFilterTeamId(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-6 h-6 text-[var(--hiver-accent)]" />
            <h1 className="text-2xl font-semibold text-[var(--hiver-text)]">Analyse</h1>
          </div>
          <p className="text-sm text-[var(--hiver-text-muted)]">
            Fordeling, trender og nøkkeltall for saker. Filtrer på periode og valgfrie kriterier.
          </p>
        </div>
        <Link
          to="/tickets"
          className="text-sm font-medium text-[var(--hiver-accent)] hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <Clock className="w-4 h-4" />
          Se saker
        </Link>
      </div>

      {/* Filters */}
      <div className="card-panel p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--hiver-text-muted)]">Periode:</span>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeKey)}
              className="rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]"
            >
              <option value="7d">Siste 7 dager</option>
              <option value="30d">Siste 30 dager</option>
              <option value="90d">Siste 90 dager</option>
              <option value="all">Alt</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
              showFilters || hasActiveFilters
                ? 'border-[var(--hiver-accent)] bg-[var(--hiver-accent-light)] text-[var(--hiver-accent)]'
                : 'border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filtrer
            {hasActiveFilters && (
              <span className="bg-[var(--hiver-accent)] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                !
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)] underline"
            >
              Nullstill filtre
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-[var(--hiver-text-muted)]">Sorter diagram:</span>
            <select
              value={sortBreakdown}
              onChange={(e) => setSortBreakdown(e.target.value as 'valueDesc' | 'valueAsc' | 'label')}
              className="rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]"
            >
              <option value="valueDesc">Verdi (høy–lav)</option>
              <option value="valueAsc">Verdi (lav–høy)</option>
              <option value="label">Navn A–Å</option>
            </select>
          </div>
        </div>
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-[var(--hiver-border)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-2">Status</label>
              <div className="flex flex-wrap gap-2">
                {statuses.map((s) => (
                  <label key={s.id} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterStatus.includes(s.code)}
                      onChange={(e) =>
                        setFilterStatus((prev) =>
                          e.target.checked ? [...prev, s.code] : prev.filter((c) => c !== s.code)
                        )
                      }
                      className="rounded border-[var(--hiver-border)]"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-2">Prioritet</label>
              <div className="flex flex-wrap gap-2">
                {PRIORITY_ORDER.map((p) => (
                  <label key={p} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterPriority.includes(p)}
                      onChange={(e) =>
                        setFilterPriority((prev) =>
                          e.target.checked ? [...prev, p] : prev.filter((c) => c !== p)
                        )
                      }
                      className="rounded border-[var(--hiver-border)]"
                    />
                    {PRIORITY_LABEL[p]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-2">Kategori</label>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                {categories.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterCategory.includes(c.name)}
                      onChange={(e) =>
                        setFilterCategory((prev) =>
                          e.target.checked ? [...prev, c.name] : prev.filter((n) => n !== c.name)
                        )
                      }
                      className="rounded border-[var(--hiver-border)]"
                    />
                    {c.name}
                  </label>
                ))}
                {categories.length === 0 && (
                  <span className="text-xs text-[var(--hiver-text-muted)]">Ingen kategorier</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-2">Team</label>
              <select
                value={filterTeamId ?? ''}
                onChange={(e) => setFilterTeamId(e.target.value || null)}
                className="w-full rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]"
              >
                <option value="">Alle team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-[var(--hiver-text-muted)] text-sm py-12">Laster analyse…</div>
      ) : (
        <div className="space-y-8">
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <div className="card-panel p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--hiver-accent-light)] flex items-center justify-center shrink-0">
                <Inbox className="w-6 h-6 text-[var(--hiver-accent)]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--hiver-text-muted)]">Totalt saker</p>
                <p className="text-2xl font-semibold text-[var(--hiver-text)] tabular-nums">{stats.total}</p>
              </div>
            </div>
            <div className="card-panel p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--hiver-accent-light)] flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 text-[var(--hiver-accent)]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--hiver-text-muted)]">Løsningsrate</p>
                <p className="text-2xl font-semibold text-[var(--hiver-text)] tabular-nums">{stats.resolutionRate}%</p>
              </div>
            </div>
            <div className="card-panel p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--hiver-text-muted)]">Åpne / venter</p>
                <p className="text-2xl font-semibold text-[var(--hiver-text)] tabular-nums">{stats.openCount}</p>
              </div>
            </div>
            <div className="card-panel p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0">
                <UserX className="w-6 h-6 text-rose-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--hiver-text-muted)]">Ufordelte</p>
                <p className="text-2xl font-semibold text-[var(--hiver-text)] tabular-nums">{stats.unassignedCount}</p>
              </div>
            </div>
            <div className="card-panel p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                <MessageCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--hiver-text-muted)]">Første svar (snitt)</p>
                <p className="text-xl font-semibold text-[var(--hiver-text)] tabular-nums">
                  {stats.avgFirstResponseHours > 0 ? formatDuration(stats.avgFirstResponseHours) : '–'}
                </p>
              </div>
            </div>
            <div className="card-panel p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
                <Target className="w-6 h-6 text-sky-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--hiver-text-muted)]">Løsningstid (snitt)</p>
                <p className="text-xl font-semibold text-[var(--hiver-text)] tabular-nums">
                  {stats.avgResolutionHours > 0 ? formatDuration(stats.avgResolutionHours) : '–'}
                </p>
              </div>
            </div>
            <div className="card-panel p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--hiver-text-muted)]">Høy / Haster</p>
                <p className="text-2xl font-semibold text-[var(--hiver-text)] tabular-nums">{stats.highUrgentCount}</p>
              </div>
            </div>
          </div>

          {/* Trend: opened vs closed */}
          <div className="card-panel p-6">
            <h2 className="text-sm font-semibold text-[var(--hiver-text-muted)] uppercase tracking-wider mb-2">
              Saker åpnet og lukket per dag
            </h2>
            <p className="text-xs text-[var(--hiver-text-muted)] mb-4">
              Blå = åpnet, grønn = lukket (løst/avsluttet)
            </p>
            <TrendChart data={trendData} yMax={trendMax} />
            <div className="flex gap-6 mt-2 text-xs text-[var(--hiver-text-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full bg-[var(--hiver-accent)]" /> Åpnet
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full bg-[#10b981]" /> Lukket
              </span>
            </div>
          </div>

          {/* Funnel */}
          <div className="card-panel p-6">
            <h2 className="text-sm font-semibold text-[var(--hiver-text-muted)] uppercase tracking-wider mb-4">
              Flyt: status fra ny til lukket
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-2 items-stretch sm:items-end">
              {funnelSteps.map((step, i) => (
                <div key={step.label} className="flex-1 flex flex-col gap-2 min-w-0">
                  <div
                    className="rounded-lg h-8 flex items-center justify-center transition-all min-h-[2rem]"
                    style={{
                      backgroundColor: step.color,
                      opacity: 0.9,
                      width: `${Math.max(20, (step.value / funnelMax) * 100)}%`,
                      marginLeft: i === 0 ? 0 : 'auto',
                      marginRight: i === funnelSteps.length - 1 ? 0 : 'auto',
                    }}
                  >
                    <span className="text-xs font-semibold text-white drop-shadow-sm truncate px-2">
                      {step.value}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[var(--hiver-text-muted)]">{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bar: Status */}
          <div className="card-panel p-6">
            <h2 className="text-sm font-semibold text-[var(--hiver-text-muted)] uppercase tracking-wider mb-4">
              Saker etter status
            </h2>
            <div className="flex items-end gap-4 h-48">
              {statusItems.map(({ label, value, color }) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <div className="w-full flex-1 flex flex-col justify-end min-h-[2rem]">
                    <div
                      className={`w-full rounded-t ${color} transition-all`}
                      style={{ height: `${(value / statusMax) * 100}%`, minHeight: value ? 8 : 0 }}
                    />
                  </div>
                  <span className="text-xs font-medium text-[var(--hiver-text-muted)] truncate w-full text-center">
                    {label}
                  </span>
                  <span className="text-sm font-semibold text-[var(--hiver-text)]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bar: Priority */}
          {priorityItems.some((i) => i.value > 0) && (
            <div className="card-panel p-6">
              <h2 className="text-sm font-semibold text-[var(--hiver-text-muted)] uppercase tracking-wider mb-4">
                Saker etter prioritet
              </h2>
              <div className="flex items-end gap-4 h-40">
                {priorityItems.map(({ label, value }) => (
                  <div key={label} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                    <div className="w-full flex-1 flex flex-col justify-end min-h-[2rem]">
                      <div
                        className="w-full rounded-t bg-[var(--hiver-accent)] transition-all"
                        style={{
                          height: `${(value / priorityMax) * 100}%`,
                          minHeight: value ? 8 : 0,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-[var(--hiver-text-muted)] truncate w-full text-center">
                      {label}
                    </span>
                    <span className="text-sm font-semibold text-[var(--hiver-text)]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bar: Category */}
          {categoryItems.length > 0 && (
            <div className="card-panel p-6">
              <h2 className="text-sm font-semibold text-[var(--hiver-text-muted)] uppercase tracking-wider mb-4">
                Saker etter kategori
              </h2>
              <div className="flex items-end gap-2 h-40 overflow-x-auto pb-2">
                {categoryItems.map(({ label, value }) => (
                  <div key={label} className="flex-shrink-0 w-20 flex flex-col items-center gap-2">
                    <div className="w-full flex-1 flex flex-col justify-end min-h-[2rem]">
                      <div
                        className="w-full rounded-t bg-[var(--hiver-accent)] transition-all"
                        style={{
                          height: `${(value / categoryMax) * 100}%`,
                          minHeight: value ? 8 : 0,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-[var(--hiver-text-muted)] truncate w-full text-center">
                      {label}
                    </span>
                    <span className="text-sm font-semibold text-[var(--hiver-text)]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bar: Team */}
          {teamItems.length > 0 && (
            <div className="card-panel p-6">
              <h2 className="text-sm font-semibold text-[var(--hiver-text-muted)] uppercase tracking-wider mb-4">
                Saker etter team
              </h2>
              <div className="flex items-end gap-2 h-40 overflow-x-auto pb-2">
                {teamItems.map(({ label, value }) => (
                  <div key={label} className="flex-shrink-0 w-24 flex flex-col items-center gap-2">
                    <div className="w-full flex-1 flex flex-col justify-end min-h-[2rem]">
                      <div
                        className="w-full rounded-t bg-[var(--hiver-accent)] transition-all"
                        style={{
                          height: `${(value / teamMax) * 100}%`,
                          minHeight: value ? 8 : 0,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-[var(--hiver-text-muted)] truncate w-full text-center">
                      {label}
                    </span>
                    <span className="text-sm font-semibold text-[var(--hiver-text)]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
