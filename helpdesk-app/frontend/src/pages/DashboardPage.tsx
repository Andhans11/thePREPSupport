import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useMasterData } from '../contexts/MasterDataContext';
import { useCurrentUserRole } from '../hooks/useCurrentUserRole';
import { canSeeTeamStatusDashboard } from '../types/roles';
import { formatListTime } from '../utils/formatters';
import { startOfWeek, endOfWeek, eachDayOfInterval, format, subDays, startOfDay, addDays, isBefore } from 'date-fns';
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  sortByAvailabilityStatus,
  type AvailabilityStatus,
} from '../types/availability';
import {
  Plus,
  ArrowRight,
  Users,
  Check,
  Moon,
  Minus,
  X,
  Ticket,
  BarChart3,
  TrendingUp,
  CalendarClock,
} from 'lucide-react';
import type { Ticket as TicketType } from '../types/ticket';

interface PlanningSlotOnDashboard {
  id: string;
  team_member_id: string;
  start_at: string;
  end_at: string;
  team_member?: { id: string; name: string; email: string };
}

interface TeamMemberForList {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  is_active: boolean;
  availability_status: string | null;
}

/** Display status: not logged in → Frakoblet, inactive → Borte, else DB availability_status. */
function getDisplayStatus(m: TeamMemberForList): AvailabilityStatus {
  if (m.user_id == null) return 'offline';
  if (!m.is_active) return 'away';
  const s = m.availability_status;
  return s && ['active', 'away', 'busy', 'offline'].includes(s) ? (s as AvailabilityStatus) : 'active';
}

const DAY_LABELS: Record<number, string> = { 0: 'Søn', 1: 'Man', 2: 'Tir', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lør' };

/** Schedule from business_hour_templates: day key -> { start, end } or null if closed. */
type BusinessSchedule = Record<string, { start: string; end: string } | null>;
const SCHEDULE_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function isWorkingDay(d: Date, schedule: BusinessSchedule | null): boolean {
  if (!schedule) return d.getDay() >= 1 && d.getDay() <= 5;
  const key = SCHEDULE_DAY_KEYS[d.getDay()];
  return !!schedule[key];
}

/** First calendar day after today that has opening hours. */
function getNextWorkingDay(fromDate: Date, schedule: BusinessSchedule | null): Date {
  let d = addDays(startOfDay(fromDate), 1);
  for (let i = 0; i < 8; i++) {
    if (isWorkingDay(d, schedule)) return d;
    d = addDays(d, 1);
  }
  return d;
}

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
  const { statuses } = useMasterData();
  const { role } = useCurrentUserRole();
  const showTeamStatus = canSeeTeamStatusDashboard(role);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState(0);
  const [unassigned, setUnassigned] = useState(0);
  const [recentMine, setRecentMine] = useState<TicketType[]>([]);
  const [recentUnassigned, setRecentUnassigned] = useState<TicketType[]>([]);
  const [recentTab, setRecentTab] = useState<'mine' | 'unassigned'>('mine');
  const [teamMembers, setTeamMembers] = useState<TeamMemberForList[]>([]);
  const [weekOpenedByDay, setWeekOpenedByDay] = useState<{ date: string; label: string; count: number }[]>([]);
  const [monthTrend, setMonthTrend] = useState<{ date: string; label: string; opened: number; closed: number }[]>([]);
  const [planningSlotsNow, setPlanningSlotsNow] = useState<PlanningSlotOnDashboard[]>([]);
  const [planningSlotsToday, setPlanningSlotsToday] = useState<PlanningSlotOnDashboard[]>([]);
  const [planningSlotsNextWorkingDay, setPlanningSlotsNextWorkingDay] = useState<PlanningSlotOnDashboard[]>([]);
  const [nextWorkingDayLabel, setNextWorkingDayLabel] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTenantId) {
      setStatusCounts({});
      setMine(0);
      setUnassigned(0);
      setRecentMine([]);
      setRecentUnassigned([]);
      setTeamMembers([]);
      setLoading(false);
      return;
    }
    async function load() {
      const [ticketsRes, membersRes] = await Promise.all([
        supabase
          .from('tickets')
          .select(`
            *,
            customer:customers(email, name)
          `)
          .eq('tenant_id', currentTenantId)
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('team_members')
          .select('id, name, email, user_id, is_active, availability_status')
          .eq('tenant_id', currentTenantId),
      ]);
      const list = (ticketsRes.data ?? []) as TicketType[];
      const byStatus: Record<string, number> = {};
      statuses.forEach((s) => {
        byStatus[s.code] = list.filter((t) => t.status === s.code).length;
      });
      setStatusCounts(byStatus);
      setMine(user ? list.filter((t) => t.assigned_to === user.id).length : 0);
      setUnassigned(list.filter((t) => !t.assigned_to).length);
      setRecentMine(user ? list.filter((t) => t.assigned_to === user.id).slice(0, 8) : []);
      setRecentUnassigned(list.filter((t) => !t.assigned_to).slice(0, 8));
      let members: TeamMemberForList[] = [];
      if (membersRes.error) {
        const fallback = await supabase
          .from('team_members')
          .select('id, name, email, user_id, is_active')
          .eq('tenant_id', currentTenantId);
        members = ((fallback.data ?? []) as TeamMemberForList[]).map((m) => ({
          ...m,
          availability_status: m.is_active && m.user_id ? 'active' : m.user_id ? 'away' : 'offline',
        }));
      } else {
        members = (membersRes.data ?? []) as TeamMemberForList[];
      }
      setTeamMembers(
        sortByAvailabilityStatus(
          members.map((m) => ({ ...m, availability_status: getDisplayStatus(m) }))
        )
      );
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
      const { data: weekTickets } = await supabase
        .from('tickets')
        .select('id, created_at')
        .eq('tenant_id', currentTenantId)
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString());
      const byDay: Record<string, number> = {};
      days.forEach((d) => {
        byDay[format(d, 'yyyy-MM-dd')] = 0;
      });
      (weekTickets ?? []).forEach((t: { id: string; created_at: string }) => {
        const key = format(new Date(t.created_at), 'yyyy-MM-dd');
        if (byDay[key] !== undefined) byDay[key]++;
      });
      setWeekOpenedByDay(
        days.map((d) => ({
          date: format(d, 'yyyy-MM-dd'),
          label: DAY_LABELS[d.getDay()],
          count: byDay[format(d, 'yyyy-MM-dd')] ?? 0,
        }))
      );

      // Last 30 days: opened (created_at) and closed (resolved_at) per day
      const thirtyDaysAgo = subDays(new Date(), 30);
      const monthDays = eachDayOfInterval({ start: thirtyDaysAgo, end: new Date() });
      const [openedRes, closedRes] = await Promise.all([
        supabase
          .from('tickets')
          .select('created_at')
          .eq('tenant_id', currentTenantId)
          .gte('created_at', thirtyDaysAgo.toISOString()),
        supabase
          .from('tickets')
          .select('resolved_at')
          .eq('tenant_id', currentTenantId)
          .not('resolved_at', 'is', null)
          .gte('resolved_at', thirtyDaysAgo.toISOString()),
      ]);
      const openedByDate: Record<string, number> = {};
      const closedByDate: Record<string, number> = {};
      monthDays.forEach((d) => {
        const key = format(d, 'yyyy-MM-dd');
        openedByDate[key] = 0;
        closedByDate[key] = 0;
      });
      (openedRes.data ?? []).forEach((t: { created_at: string }) => {
        const key = format(startOfDay(new Date(t.created_at)), 'yyyy-MM-dd');
        if (openedByDate[key] !== undefined) openedByDate[key]++;
      });
      (closedRes.data ?? []).forEach((t: { resolved_at: string }) => {
        const key = format(startOfDay(new Date(t.resolved_at)), 'yyyy-MM-dd');
        if (closedByDate[key] !== undefined) closedByDate[key]++;
      });
      setMonthTrend(
        monthDays.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          return {
            date: key,
            label: format(d, 'd. MMM'),
            opened: openedByDate[key] ?? 0,
            closed: closedByDate[key] ?? 0,
          };
        })
      );

      // Business hours: determine next working day
      let businessSchedule: BusinessSchedule | null = null;
      const { data: defaultScheduleRow } = await supabase
        .from('business_hour_templates')
        .select('schedule')
        .eq('tenant_id', currentTenantId)
        .eq('is_default', true)
        .maybeSingle();
      if (defaultScheduleRow?.schedule && typeof defaultScheduleRow.schedule === 'object' && !Array.isArray(defaultScheduleRow.schedule)) {
        businessSchedule = defaultScheduleRow.schedule as BusinessSchedule;
      } else {
        const { data: firstRow } = await supabase
          .from('business_hour_templates')
          .select('schedule')
          .eq('tenant_id', currentTenantId)
          .limit(1)
          .maybeSingle();
        if (firstRow?.schedule && typeof firstRow.schedule === 'object' && !Array.isArray(firstRow.schedule)) {
          businessSchedule = firstRow.schedule as BusinessSchedule;
        }
      }
      const now = new Date();
      const todayStart = startOfDay(now);
      const nextWorkingDay = getNextWorkingDay(now, businessSchedule);
      const nextWorkingDayStart = startOfDay(nextWorkingDay);
      const nextWorkingDayEnd = addDays(nextWorkingDayStart, 1);
      setNextWorkingDayLabel(`${DAY_LABELS[nextWorkingDay.getDay()]} ${format(nextWorkingDay, 'd. MMM')}`);

      // Planning: who is on shift now, today's slots, next working day's slots
      const rangeEnd = addDays(nextWorkingDayStart, 1);
      const { data: planningRows } = await supabase
        .from('planning_slots')
        .select('id, team_member_id, start_at, end_at, team_member:team_members(id, name, email)')
        .eq('tenant_id', currentTenantId)
        .lt('start_at', rangeEnd.toISOString())
        .gte('end_at', todayStart.toISOString());
      const allSlots = (planningRows ?? []) as unknown as PlanningSlotOnDashboard[];
      const nowTime = now.getTime();
      const tomorrowStart = addDays(todayStart, 1);
      setPlanningSlotsNow(
        allSlots.filter((s) => {
          const start = new Date(s.start_at).getTime();
          const end = new Date(s.end_at).getTime();
          return start <= nowTime && end > nowTime;
        })
      );
      setPlanningSlotsToday(allSlots.filter((s) => isBefore(new Date(s.start_at), tomorrowStart)));
      setPlanningSlotsNextWorkingDay(
        allSlots.filter(
          (s) =>
            !isBefore(new Date(s.start_at), nextWorkingDayStart) && isBefore(new Date(s.start_at), nextWorkingDayEnd)
        )
      );

      setLoading(false);
    }
    load();
  }, [user?.id, statuses, currentTenantId]);

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
            Her er oversikten over support-helpdesken
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/tickets?view=mine&new=1"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] shadow-sm transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Ny sak
          </Link>
        </div>
      </div>

      {/* Planning overview: on shift now + next working day */}
      <div className="card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm mb-6 lg:mb-8">
        <div className="p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock className="w-5 h-5 text-[var(--hiver-accent)]" />
            <h2 className="text-base font-semibold text-[var(--hiver-text)]">Supportvakt og timeplan</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* On shift now + their schedule today */}
            <div>
              <p className="text-xs font-medium text-[var(--hiver-text-muted)] uppercase tracking-wider mb-2">På vakt nå</p>
              {planningSlotsNow.length === 0 ? (
                <p className="text-sm text-[var(--hiver-text-muted)]">Ingen er planlagt på vakt akkurat nå.</p>
              ) : (
                <ul className="space-y-1.5">
                  {planningSlotsNow.map((slot) => {
                    const member = teamMembers.find((m) => m.id === slot.team_member_id);
                    const status = member ? getDisplayStatus(member) : 'active';
                    const todayForPerson = planningSlotsToday
                      .filter((s) => s.team_member_id === slot.team_member_id)
                      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
                    const name = (slot.team_member as { name?: string })?.name ?? 'Ukjent';
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
                            <span className="shrink-0 text-[var(--hiver-text-muted)]" aria-hidden>
                              ·
                            </span>
                            <span className="text-[var(--hiver-text-muted)] tabular-nums truncate">
                              {timeplanStr}
                            </span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {/* Next working day */}
            <div>
              <p className="text-xs font-medium text-[var(--hiver-text-muted)] uppercase tracking-wider mb-2">
                Neste arbeidsdag
                {nextWorkingDayLabel && (
                  <span className="font-normal normal-case ml-1.5 text-[var(--hiver-text-muted)]">
                    ({nextWorkingDayLabel})
                  </span>
                )}
              </p>
              {planningSlotsNextWorkingDay.length === 0 ? (
                <p className="text-sm text-[var(--hiver-text-muted)]">Ingen planlagte vakter den dagen.</p>
              ) : (
                <ul className="space-y-1.5">
                  {planningSlotsNextWorkingDay
                    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                    .map((slot) => {
                      const name = (slot.team_member as { name?: string })?.name ?? 'Ukjent';
                      return (
                        <li key={slot.id} className="text-sm text-[var(--hiver-text)] flex items-center gap-2">
                          <span className="text-[var(--hiver-text-muted)] tabular-nums shrink-0">
                            {format(new Date(slot.start_at), 'HH:mm')}–{format(new Date(slot.end_at), 'HH:mm')}
                          </span>
                          <span>{name}</span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

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

        {/* Last 30 days: opened vs closed trendline (full width) */}
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

        {/* Bento: Recent tickets with tabs Mine / Ufordelte (full width when Brukere hidden) */}
        <div className={`md:col-span-2 lg:row-span-2 lg:row-start-3 flex flex-col min-h-[280px] lg:min-h-0 card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm ${showTeamStatus ? 'lg:col-span-2' : 'lg:col-span-4'}`}>
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
          <div className="md:col-span-2 lg:col-span-2 lg:row-span-2 lg:row-start-3 flex flex-col min-h-[280px] lg:min-h-0 card-panel rounded-2xl overflow-hidden bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] shadow-sm">
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
                    const status = getDisplayStatus(m);
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
