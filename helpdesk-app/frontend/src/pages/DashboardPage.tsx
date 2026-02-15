import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useCurrentUserRole } from '../hooks/useCurrentUserRole';
import { useDashboard } from '../contexts/DashboardContext';
import { canSeeTeamStatusDashboard, canAccessAnalytics, isAdmin, canReplyToTickets, canApproveRejectOwnSlots, canManagePlanningSlots } from '../types/roles';
import { formatListTime } from '../utils/formatters';
import { format } from 'date-fns';
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  type AvailabilityStatus,
} from '../types/availability';
import {
  Plus,
  ArrowRight,
  Users,
  Check,
  Ban,
  Moon,
  Minus,
  X,
  Ticket,
  BarChart3,
  TrendingUp,
  CalendarClock,
  Clock,
  Bell,
} from 'lucide-react';

import { getDisplayStatus } from '../contexts/DashboardContext';

const CHART_PAD = { left: 40, right: 24, top: 16, bottom: 28 };
const CHART_HEIGHT = 200;
const CHART_VIEW_WIDTH = 800;

/** Line chart: two trendlines (åpnet / lukket) over last 30 days with grid and axes. */
function MonthTrendlineChart({
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

  const xTickIndices = n > 10 ? [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1] : Array.from({ length: n }, (_, i) => i);

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        className="w-full max-w-full h-[300px]"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Saker åpnet og lukket siste 30 dager"
      >
        {/* Grid */}
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
        {/* Y-axis labels */}
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
        {/* X-axis labels */}
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
        {/* Opened line */}
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
        {/* Closed line */}
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

export function DashboardPage() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { role } = useCurrentUserRole();
  const {
    statusCounts,
    mine,
    unassigned,
    recentMine,
    recentUnassigned,
    teamMembers,
    weekOpenedByDay,
    monthTrend,
    planningSlotsNow,
    planningSlotsToday,
    planningSlotsNextWorkingDay,
    nextWorkingDayLabel,
    emptySlotsNextWorkingDay,
    myPendingSlots,
    pendingSlotsFromTeam,
    loading,
    refetch,
  } = useDashboard();
  const showTeamStatus = canSeeTeamStatusDashboard(role);
  const canApproveRejectSlots = canApproveRejectOwnSlots(role);
  const showAnalytics = canAccessAnalytics(role);
  const showAdminLinks = isAdmin(role);
  const [recentTab, setRecentTab] = useState<'mine' | 'unassigned'>('mine');

  const statusDisplayConfig: Record<AvailabilityStatus, { Icon: typeof Check }> = {
    active: { Icon: Check },
    away: { Icon: Moon },
    busy: { Icon: Minus },
    offline: { Icon: X },
  };

  const openCount = statusCounts['open'] ?? statusCounts['new'] ?? 0;
  const weekMax = Math.max(1, ...weekOpenedByDay.map((d) => d.count));
  const monthMax = Math.max(1, ...monthTrend.flatMap((d) => [d.opened, d.closed]));

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Bruker';

  const dashboardSubtitle =
    role === 'admin'
      ? 'Oversikt over organisasjonen og support'
      : role === 'manager'
        ? 'Oversikt over teamet og saker'
        : 'Oversikt over dine saker og supportvakt';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-[var(--hiver-text-muted)] text-sm">Laster dashbord…</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto min-h-0">
      {/* Header strip: welcome + CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold text-[var(--hiver-text)] tracking-tight">
            Hei, {displayName}
          </h1>
          <p className="text-sm text-[var(--hiver-text-muted)] mt-1">
            {dashboardSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showAnalytics && (
            <Link
              to="/analytics"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)] transition-colors shrink-0"
            >
              <BarChart3 className="w-4 h-4" />
              Se analyse
            </Link>
          )}
          {showAdminLinks && (
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--hiver-border)] text-[var(--hiver-text)] text-sm font-medium hover:bg-[var(--hiver-bg)] transition-colors shrink-0"
            >
              Innstillinger
            </Link>
          )}
          {canReplyToTickets(role) && (
            <Link
              to="/tickets?view=mine&new=1"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] shadow-sm transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              Ny sak
            </Link>
          )}
        </div>
      </div>

      {/* Agent callout: prompt to pick up unassigned tickets */}
      {role === 'agent' && unassigned > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-[var(--hiver-accent-light)] border border-[var(--hiver-accent)]/30 mb-6 lg:mb-8">
          <p className="text-sm text-[var(--hiver-text)]">
            <span className="font-semibold">{unassigned} ufordelte sak{unassigned !== 1 ? 'er' : ''}</span>
            {' – ta en?'}
          </p>
          <Link
            to="/tickets?view=unassigned"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] shrink-0"
          >
            Se ufordelte
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Planning: two cards (På vakt nå | Neste arbeidsdag) + approval card for my pending slots */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5 mb-6 lg:mb-8">
        {/* Card 1: På vakt nå */}
        <div className="card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm">
          <div className="p-5 lg:p-6">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-5 h-5 text-[var(--hiver-accent)]" />
              <h2 className="text-base font-semibold text-[var(--hiver-text)]">På vakt nå</h2>
            </div>
              {planningSlotsNow.length === 0 ? (
                <p className="text-sm text-[var(--hiver-text-muted)]">Ingen er planlagt på vakt akkurat nå.</p>
              ) : (
                <ul className="space-y-1.5">
                  {planningSlotsNow.map((slot) => {
                    const member = teamMembers.find((m) => m.id === slot.team_member_id);
                    const status = (member ? getDisplayStatus(member) : 'active') as AvailabilityStatus;
                    const todayForPerson = planningSlotsToday
                      .filter((s) => s.team_member_id === slot.team_member_id)
                      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
                    const name = teamMembers.find((m) => m.id === slot.team_member_id)?.name ?? 'Ukjent';
                    const timeplanStr =
                      todayForPerson.length > 0
                        ? todayForPerson
                            .map((s) => `${format(new Date(s.start_at), 'HH:mm')}–${format(new Date(s.end_at), 'HH:mm')}`)
                            .join(', ')
                        : null;
                    return (
                      <li
                        key={slot.id}
                        className="flex items-center gap-2 text-sm min-w-0"
                        title={AVAILABILITY_LABELS[status]}
                      >
                        <span
                          className="shrink-0 w-2 h-2 rounded-full"
                          style={{ backgroundColor: AVAILABILITY_COLORS[status] }}
                          aria-hidden
                        />
                        <span className="font-medium text-[var(--hiver-text)] truncate">{name}</span>
                        <span className="shrink-0 text-[var(--hiver-text-muted)]" aria-hidden>
                          ·
                        </span>
                        <span className="text-[var(--hiver-text-muted)] shrink-0">
                          {AVAILABILITY_LABELS[status]}
                        </span>
                        {timeplanStr && (
                          <>
                            <span className="shrink-0 text-[var(--hiver-text-muted)]" aria-hidden>·</span>
                            <span className="text-[var(--hiver-text-muted)] tabular-nums truncate">{timeplanStr}</span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </div>

        {/* Card 2: Neste arbeidsdag + Ledige tidsrom */}
        <div className="card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm">
          <div className="p-5 lg:p-6">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-5 h-5 text-[var(--hiver-accent)]" />
              <h2 className="text-base font-semibold text-[var(--hiver-text)]">Neste arbeidsdag</h2>
            </div>
            {nextWorkingDayLabel && (
              <p className="text-xs font-medium text-[var(--hiver-text-muted)] uppercase tracking-wider mb-2">
                {nextWorkingDayLabel}
              </p>
            )}
              {planningSlotsNextWorkingDay.length === 0 ? (
                <p className="text-sm text-[var(--hiver-text-muted)]">Ingen planlagte vakter den dagen.</p>
              ) : (
                <ul className="space-y-1.5">
                  {planningSlotsNextWorkingDay
                    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                    .map((slot) => {
                      const member = teamMembers.find((m) => m.id === slot.team_member_id);
                      const name = member?.name ?? 'Ukjent';
                      const statusLabel = slot.status === 'approved' ? 'Godkjent' : slot.status === 'rejected' ? 'Avvist' : 'Venter';
                      const statusColor = slot.status === 'approved' ? 'text-green-600' : slot.status === 'rejected' ? 'text-red-600' : 'text-amber-600';
                      const canSendReminder = slot.status === 'pending' && member?.user_id && currentTenantId;
                      return (
                        <li key={slot.id} className="text-sm text-[var(--hiver-text)] flex items-center gap-2 flex-wrap">
                          <span className="text-[var(--hiver-text-muted)] tabular-nums shrink-0">
                            {format(new Date(slot.start_at), 'HH:mm')}–{format(new Date(slot.end_at), 'HH:mm')}
                          </span>
                          <span>{name}</span>
                          <span className={`text-xs font-medium shrink-0 ${statusColor}`}>{statusLabel}</span>
                          {canSendReminder && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!member?.user_id || !currentTenantId) return;
                                await supabase.from('notifications').insert({
                                  user_id: member.user_id,
                                  tenant_id: currentTenantId,
                                  title: 'Påminnelse: godkjenn eller avvis vakt',
                                  body: `${nextWorkingDayLabel}: ${format(new Date(slot.start_at), 'HH:mm')}–${format(new Date(slot.end_at), 'HH:mm')}. Gå til planlegging for å godkjenne eller avvise.`,
                                  link: '/planning',
                                });
                              }}
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-[var(--hiver-accent)] hover:bg-[var(--hiver-accent)]/15"
                              title="Send påminnelse til brukeren"
                            >
                              <Bell className="w-3 h-3" />
                              Påminnelse
                            </button>
                          )}
                        </li>
                      );
                    })}
                </ul>
              )}
            {showTeamStatus && emptySlotsNextWorkingDay.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--hiver-border)]">
                <p className="text-xs font-medium text-[var(--hiver-text-muted)] uppercase tracking-wider mb-1.5">
                  Ledige tidsrom
                </p>
                <p className="text-sm text-[var(--hiver-text-muted)]">{emptySlotsNextWorkingDay.join(', ')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Assigned slots not yet approved or rejected */}
        {canApproveRejectSlots && (
          <div className="card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm">
            <div className="p-5 lg:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Check className="w-5 h-5 text-[var(--hiver-accent)]" />
                <h2 className="text-base font-semibold text-[var(--hiver-text)]">Vakter som venter på godkjenning</h2>
              </div>
              <p className="text-xs text-[var(--hiver-text-muted)] mb-4">
                Vakter som er lagt inn til deg og som ikke er godkjent eller avvist ennå.
              </p>
              {myPendingSlots.length === 0 ? (
                <p className="text-sm text-[var(--hiver-text-muted)]">Ingen vakter venter på at du godkjenner eller avviser.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      onClick={async () => {
                        for (const slot of myPendingSlots) {
                          await supabase.from('planning_slots').update({ status: 'approved' }).eq('id', slot.id);
                        }
                        refetch();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Godkjenn alle
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Avvise alle ${myPendingSlots.length} vakt(er)?`)) return;
                        for (const slot of myPendingSlots) {
                          await supabase.from('planning_slots').update({ status: 'rejected' }).eq('id', slot.id);
                        }
                        refetch();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/90 text-white hover:bg-red-700"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Avvis alle
                    </button>
                  </div>
                  <ul className="space-y-2">
                  {myPendingSlots.map((slot) => (
                    <li
                      key={slot.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[var(--hiver-border)] last:border-0"
                    >
                      <span className="text-sm text-[var(--hiver-text)]">
                        <span className="font-medium tabular-nums">
                          {format(new Date(slot.start_at), 'HH:mm')}–{format(new Date(slot.end_at), 'HH:mm')}
                        </span>
                        <span className="text-[var(--hiver-text-muted)] ml-1.5">
                          {format(new Date(slot.start_at), 'd. MMM')}
                        </span>
                      </span>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await supabase.from('planning_slots').update({ status: 'approved' }).eq('id', slot.id);
                            refetch();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Godkjenn
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await supabase.from('planning_slots').update({ status: 'rejected' }).eq('id', slot.id);
                            refetch();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/90 text-white hover:bg-red-700"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Avvis
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Admin/manager: pending slot applications from team (this + next week) */}
      {canManagePlanningSlots(role) && pendingSlotsFromTeam.length > 0 && (
        <div className="mb-6 lg:mb-8 card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm">
          <div className="p-5 lg:p-6">
            <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[var(--hiver-accent)]" />
                <h2 className="text-base font-semibold text-[var(--hiver-text)]">Søknader om vakt</h2>
              </div>
              <Link
                to="/planning"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--hiver-accent)] hover:underline"
              >
                Gå til planlegging
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <p className="text-xs text-[var(--hiver-text-muted)] mb-4">
              Teammedlemmer har søkt om vakt og venter på å godkjenne eller avvise. Du finner dem i listen på planleggingssiden.
            </p>
            <ul className="space-y-2">
              {pendingSlotsFromTeam.map((slot) => {
                const name = teamMembers.find((m) => m.id === slot.team_member_id)?.name ?? 'Ukjent';
                return (
                  <li
                    key={slot.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[var(--hiver-border)] last:border-0"
                  >
                    <span className="text-sm text-[var(--hiver-text)]">
                      <span className="font-medium">{name}</span>
                      <span className="text-[var(--hiver-text-muted)] ml-1.5 tabular-nums">
                        {format(new Date(slot.start_at), 'd. MMM HH:mm')}–{format(new Date(slot.end_at), 'HH:mm')}
                      </span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          await supabase.from('planning_slots').update({ status: 'approved' }).eq('id', slot.id);
                          refetch();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                        title="Godkjenn"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Godkjenn
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await supabase.from('planning_slots').update({ status: 'rejected' }).eq('id', slot.id);
                          refetch();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/90 text-white hover:bg-red-700"
                        title="Avvis"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Avvis
                      </button>
                      <Link
                        to="/planning"
                        className="text-xs font-medium text-[var(--hiver-accent)] hover:underline ml-1"
                      >
                        Planlegging
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Bento grid: infographic + week chart, trendline, then Recent + Team. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 lg:grid-rows-[auto_auto_1fr]">
        {/* Infographic: Åpen, Mine, Ufordelt */}
        <div className="lg:col-span-2 card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm">
          <div className="p-5 lg:p-6">
            <p className="text-xs font-medium text-[var(--hiver-text-muted)] uppercase tracking-wider mb-4">
              Saker nå
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center rounded-xl bg-[var(--hiver-bg)]/80 py-4 px-3 border border-[var(--hiver-border)]/60">
                <span className="text-2xl lg:text-3xl font-bold text-[var(--status-open)] tabular-nums">{openCount}</span>
                <span className="text-xs font-medium text-[var(--hiver-text-muted)] mt-1 uppercase tracking-wider">Åpen</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-[var(--hiver-bg)]/80 py-4 px-3 border border-[var(--hiver-border)]/60">
                <span className="text-2xl lg:text-3xl font-bold text-[var(--hiver-accent)] tabular-nums">{mine}</span>
                <span className="text-xs font-medium text-[var(--hiver-text-muted)] mt-1 uppercase tracking-wider">Mine</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-[var(--hiver-bg)]/80 py-4 px-3 border border-[var(--hiver-border)]/60">
                <span className="text-2xl lg:text-3xl font-bold text-[var(--status-pending)] tabular-nums">{unassigned}</span>
                <span className="text-xs font-medium text-[var(--hiver-text-muted)] mt-1 uppercase tracking-wider">Ufordelt</span>
              </div>
            </div>
          </div>
        </div>

        {/* This week: opened tickets by day */}
        <div className="lg:col-span-2 card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm">
          <div className="p-5 lg:p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-[var(--hiver-accent)]" />
              <p className="text-xs font-medium text-[var(--hiver-text-muted)] uppercase tracking-wider">
                Åpne saker denne uken
              </p>
            </div>
            <div className="flex items-end justify-between gap-1 flex-1 min-h-[120px]">
              {weekOpenedByDay.map(({ date, label, count }) => (
                <div key={date} className="flex flex-col items-center flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-[var(--hiver-text-muted)] mb-1 truncate w-full text-center">{label}</span>
                  <div className="w-full flex justify-center" style={{ height: 80 }}>
                    <div
                      className="w-full max-w-[24px] rounded-t bg-[var(--hiver-accent)] transition-all duration-300"
                      style={{ height: `${(count / weekMax) * 100}%`, minHeight: count > 0 ? 4 : 0 }}
                      title={`${label}: ${count}`}
                    />
                  </div>
                  <span className="text-xs font-semibold text-[var(--hiver-text)] tabular-nums mt-1">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Last 30 days: opened vs closed trendline (manager + admin only) */}
        {showAnalytics && (
          <div className="lg:col-span-4 card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm">
            <div className="p-5 lg:p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-[var(--hiver-accent)]" />
                <p className="text-xs font-medium text-[var(--hiver-text-muted)] uppercase tracking-wider">
                  Saker siste 30 dager (åpnet og lukket)
                </p>
              </div>
              <MonthTrendlineChart data={monthTrend} yMax={monthMax} />
              <div className="flex items-center gap-6 mt-3 pt-3 border-t border-[var(--hiver-border)]">
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--hiver-text-muted)]">
                  <span className="w-3 h-0.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--hiver-accent)' }} aria-hidden />
                  Åpnet
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--hiver-text-muted)]">
                  <span className="w-3 h-0.5 rounded-full bg-emerald-500" aria-hidden />
                  Lukket
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bento: Recent tickets with tabs Mine / Ufordelte (full width when Brukere hidden) */}
        <div className={`md:col-span-2 lg:row-span-2 flex flex-col min-h-[280px] lg:min-h-0 card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm ${showTeamStatus ? 'lg:col-span-2' : 'lg:col-span-4'} ${showAnalytics ? 'lg:row-start-3' : 'lg:row-start-2'}`}>
          <div className="flex items-center justify-between px-5 lg:px-6 py-3 border-b border-[var(--hiver-border)] shrink-0">
            <div className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-[var(--hiver-accent)]" />
              <h2 className="text-base font-semibold text-[var(--hiver-text)]">Siste saker</h2>
              <div className="flex rounded-lg bg-[var(--hiver-bg)] p-0.5 ml-2">
                <button
                  type="button"
                  onClick={() => setRecentTab('mine')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    recentTab === 'mine' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
                  }`}
                >
                  Mine
                </button>
                <button
                  type="button"
                  onClick={() => setRecentTab('unassigned')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    recentTab === 'unassigned' ? 'bg-white text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
                  }`}
                >
                  Ufordelte
                </button>
              </div>
            </div>
            <Link
              to={recentTab === 'mine' ? '/tickets?view=mine' : '/tickets?view=unassigned'}
              className="text-sm font-medium text-[var(--hiver-accent)] hover:underline inline-flex items-center gap-1"
            >
              Se alle
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {(() => {
              const list = recentTab === 'mine' ? recentMine : recentUnassigned;
              if (list.length === 0) {
                return (
                  <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">
                    {recentTab === 'mine' ? 'Ingen saker tildelt deg.' : 'Ingen ufordelte saker.'}
                  </div>
                );
              }
              return (
                <ul className="divide-y divide-[var(--hiver-border)]">
                  {list.map((t) => (
                    <li key={t.id}>
                      <Link
                        to="/tickets"
                        className="flex items-center gap-4 px-5 lg:px-6 py-3 hover:bg-[var(--hiver-bg)] transition-colors"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[var(--hiver-accent-light)] text-[var(--hiver-accent)] flex items-center justify-center text-sm font-medium shrink-0">
                          {(t.customer?.name || t.customer?.email || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--hiver-text)] truncate">
                            {t.subject}
                          </p>
                          <p className="text-xs text-[var(--hiver-text-muted)]">
                            {t.ticket_number}
                            {t.customer?.name ? ` · ${t.customer.name}` : ''}
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
              );
            })()}
          </div>
        </div>

        {/* Bento: Team status (admin + manager only) */}
        {showTeamStatus && (
          <div className={`md:col-span-2 lg:col-span-2 lg:row-span-2 flex flex-col min-h-[280px] lg:min-h-0 card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm ${showAnalytics ? 'lg:row-start-3' : 'lg:row-start-2'}`}>
            <div className="flex items-center gap-2 px-5 lg:px-6 py-4 border-b border-[var(--hiver-border)] shrink-0">
              <Users className="w-5 h-5 text-[var(--hiver-text-muted)]" />
              <h2 className="text-base font-semibold text-[var(--hiver-text)]">Brukere</h2>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {teamMembers.length === 0 ? (
                <div className="p-8 text-center text-[var(--hiver-text-muted)] text-sm">
                  Ingen brukere i denne organisasjonen.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--hiver-border)]">
                  {teamMembers.map((m) => {
                    const status = getDisplayStatus(m) as AvailabilityStatus;
                    const label = AVAILABILITY_LABELS[status];
                    const { Icon } = statusDisplayConfig[status];
                    return (
                      <li key={m.id} className="flex items-center gap-4 px-5 lg:px-6 py-3">
                        <span
                          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white"
                          style={{ backgroundColor: AVAILABILITY_COLORS[status] }}
                          title={label}
                          aria-hidden
                        >
                          <Icon className="w-4 h-4" strokeWidth={2.5} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--hiver-text)] truncate">
                            {m.name || m.email}
                          </p>
                          {m.name && m.email && (
                            <p className="text-xs text-[var(--hiver-text-muted)] truncate">
                              {m.email}
                            </p>
                          )}
                        </div>
                        <span className="text-xs font-medium text-[var(--hiver-text-muted)] shrink-0">
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
