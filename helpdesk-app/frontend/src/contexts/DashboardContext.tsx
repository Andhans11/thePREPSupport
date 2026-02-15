import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { useTenant } from './TenantContext';
import { useMasterData } from './MasterDataContext';
import { useCurrentUserRole } from '../hooks/useCurrentUserRole';
import { canManagePlanningSlots } from '../types/roles';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  subDays,
  startOfDay,
  addDays,
  isBefore,
  addWeeks,
} from 'date-fns';
import { sortByAvailabilityStatus } from '../types/availability';
import type { Ticket as TicketType } from '../types/ticket';

export interface PlanningSlotOnDashboard {
  id: string;
  team_member_id: string;
  start_at: string;
  end_at: string;
  status?: 'pending' | 'approved' | 'rejected';
  created_by?: string | null;
  team_member?: { id: string; name: string; email: string };
}

export interface TeamMemberForList {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  is_active: boolean;
  availability_status: string | null;
  last_seen_at: string | null;
}

/** Consider "no active session" if last_seen_at is older than this (ms). */
const LAST_SEEN_OFFLINE_MS = 5 * 60 * 1000;

export function getDisplayStatus(m: TeamMemberForList): string {
  if (m.user_id == null) return 'offline';
  if (!m.is_active) return 'away';
  if (m.last_seen_at) {
    const age = Date.now() - new Date(m.last_seen_at).getTime();
    if (age > LAST_SEEN_OFFLINE_MS) return 'offline';
  } else {
    return 'offline';
  }
  const s = m.availability_status;
  return s && ['active', 'away', 'busy', 'offline'].includes(s) ? s : 'active';
}

type BusinessSchedule = Record<string, { start: string; end: string } | null>;
const SCHEDULE_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function isWorkingDay(d: Date, schedule: BusinessSchedule | null): boolean {
  if (!schedule) return d.getDay() >= 1 && d.getDay() <= 5;
  const key = SCHEDULE_DAY_KEYS[d.getDay()];
  return !!schedule[key];
}

function getNextWorkingDay(fromDate: Date, schedule: BusinessSchedule | null): Date {
  let d = addDays(startOfDay(fromDate), 1);
  for (let i = 0; i < 8; i++) {
    if (isWorkingDay(d, schedule)) return d;
    d = addDays(d, 1);
  }
  return d;
}

function parseScheduleTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function getEmptyRangesForDay(
  day: Date,
  schedule: BusinessSchedule | null,
  slots: { start_at: string; end_at: string }[]
): string[] {
  if (!schedule) return [];
  const key = SCHEDULE_DAY_KEYS[day.getDay()];
  const daySchedule = schedule[key];
  if (!daySchedule?.start || !daySchedule?.end) return [];
  const dayStart = startOfDay(day);
  const startMins = parseScheduleTime(daySchedule.start);
  const endMins = parseScheduleTime(daySchedule.end);
  const rangeStart = addDays(dayStart, 0);
  rangeStart.setMinutes(startMins % 60);
  rangeStart.setHours(Math.floor(startMins / 60));
  const rangeEnd = addDays(dayStart, 0);
  rangeEnd.setMinutes(endMins % 60);
  rangeEnd.setHours(Math.floor(endMins / 60));
  const segmentMs = 30 * 60 * 1000;
  const covered = new Set<number>();
  slots.forEach((s) => {
    const sStart = new Date(s.start_at).getTime();
    const sEnd = new Date(s.end_at).getTime();
    for (let t = rangeStart.getTime(); t < rangeEnd.getTime(); t += segmentMs) {
      if (t < sEnd && t + segmentMs > sStart) covered.add(t);
    }
  });
  const ranges: string[] = [];
  for (let t = rangeStart.getTime(); t < rangeEnd.getTime(); t += segmentMs) {
    if (covered.has(t)) continue;
    const segStart = new Date(t);
    let segEnd = new Date(t + segmentMs);
    while (segEnd.getTime() < rangeEnd.getTime() && !covered.has(segEnd.getTime())) {
      segEnd = new Date(segEnd.getTime() + segmentMs);
    }
    ranges.push(`${format(segStart, 'HH:mm')}–${format(segEnd, 'HH:mm')}`);
    t = segEnd.getTime() - segmentMs;
  }
  return ranges;
}

const DAY_LABELS: Record<number, string> = { 0: 'Søn', 1: 'Man', 2: 'Tir', 3: 'Ons', 4: 'Tor', 5: 'Fre', 6: 'Lør' };

export interface DashboardState {
  statusCounts: Record<string, number>;
  mine: number;
  unassigned: number;
  recentMine: TicketType[];
  recentUnassigned: TicketType[];
  teamMembers: TeamMemberForList[];
  weekOpenedByDay: { date: string; label: string; count: number }[];
  monthTrend: { date: string; label: string; opened: number; closed: number }[];
  planningSlotsNow: PlanningSlotOnDashboard[];
  planningSlotsToday: PlanningSlotOnDashboard[];
  planningSlotsNextWorkingDay: PlanningSlotOnDashboard[];
  nextWorkingDayLabel: string;
  emptySlotsNextWorkingDay: string[];
  myPendingSlots: PlanningSlotOnDashboard[];
  pendingSlotsFromTeam: PlanningSlotOnDashboard[];
}

const initialDashboardState: DashboardState = {
  statusCounts: {},
  mine: 0,
  unassigned: 0,
  recentMine: [],
  recentUnassigned: [],
  teamMembers: [],
  weekOpenedByDay: [],
  monthTrend: [],
  planningSlotsNow: [],
  planningSlotsToday: [],
  planningSlotsNextWorkingDay: [],
  nextWorkingDayLabel: '',
  emptySlotsNextWorkingDay: [],
  myPendingSlots: [],
  pendingSlotsFromTeam: [],
};

interface DashboardContextValue extends DashboardState {
  loading: boolean;
  refetch: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { statuses } = useMasterData();
  const { role, teamMemberId } = useCurrentUserRole();
  const [state, setState] = useState<DashboardState>(initialDashboardState);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refetch = useCallback(async () => {
    if (!currentTenantId) {
      setState(initialDashboardState);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ticketsRes, membersRes] = await Promise.all([
        supabase
          .from('tickets')
          .select('*, customer:customers(email, name)')
          .eq('tenant_id', currentTenantId)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('team_members')
          .select('id, name, email, user_id, is_active, availability_status, last_seen_at')
          .eq('tenant_id', currentTenantId),
      ]);
      const list = (ticketsRes.data ?? []) as TicketType[];
      const byStatus: Record<string, number> = {};
      statuses.forEach((s) => {
        byStatus[s.code] = list.filter((t) => t.status === s.code).length;
      });
      let members: TeamMemberForList[] = [];
      if (membersRes.error) {
        const fallback = await supabase
          .from('team_members')
          .select('id, name, email, user_id, is_active, last_seen_at')
          .eq('tenant_id', currentTenantId);
        members = ((fallback.data ?? []) as TeamMemberForList[]).map((m) => ({
          ...m,
          availability_status: m.is_active && m.user_id ? 'active' : m.user_id ? 'away' : 'offline',
          last_seen_at: (m as TeamMemberForList).last_seen_at ?? null,
        }));
      } else {
        members = (membersRes.data ?? []) as TeamMemberForList[];
      }
      const teamMembers = sortByAvailabilityStatus(
        members.map((m) => ({ ...m, availability_status: getDisplayStatus(m) }))
      ) as TeamMemberForList[];

      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
      const { data: weekTickets } = await supabase
        .from('tickets')
        .select('id, created_at')
        .eq('tenant_id', currentTenantId)
        .neq('status', 'archived')
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
      const weekOpenedByDay = days.map((d) => ({
        date: format(d, 'yyyy-MM-dd'),
        label: DAY_LABELS[d.getDay()],
        count: byDay[format(d, 'yyyy-MM-dd')] ?? 0,
      }));

      const thirtyDaysAgo = subDays(new Date(), 30);
      const monthDays = eachDayOfInterval({ start: thirtyDaysAgo, end: new Date() });
      const [openedRes, closedRes] = await Promise.all([
        supabase
          .from('tickets')
          .select('created_at')
          .eq('tenant_id', currentTenantId)
          .neq('status', 'archived')
          .gte('created_at', thirtyDaysAgo.toISOString()),
        supabase
          .from('tickets')
          .select('resolved_at')
          .eq('tenant_id', currentTenantId)
          .neq('status', 'archived')
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
      const monthTrend = monthDays.map((d) => {
        const key = format(d, 'yyyy-MM-dd');
        return {
          date: key,
          label: format(d, 'd. MMM'),
          opened: openedByDate[key] ?? 0,
          closed: closedByDate[key] ?? 0,
        };
      });

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
      const nextWorkingDayLabel = `${DAY_LABELS[nextWorkingDay.getDay()]} ${format(nextWorkingDay, 'd. MMM')}`;

      const rangeEnd = addDays(nextWorkingDayStart, 1);
      const { data: planningRows } = await supabase
        .from('planning_slots')
        .select('id, team_member_id, start_at, end_at, status')
        .eq('tenant_id', currentTenantId)
        .lt('start_at', rangeEnd.toISOString())
        .gte('end_at', todayStart.toISOString());
      const allSlots = (planningRows ?? []) as unknown as PlanningSlotOnDashboard[];
      const nowTime = now.getTime();
      const tomorrowStart = addDays(todayStart, 1);
      const approvedOnly = (arr: PlanningSlotOnDashboard[]) => arr.filter((s) => s.status === 'approved');
      const planningSlotsNow = approvedOnly(
        allSlots.filter((s) => {
          const start = new Date(s.start_at).getTime();
          const end = new Date(s.end_at).getTime();
          return start <= nowTime && end > nowTime;
        })
      );
      const planningSlotsToday = allSlots.filter((s) => isBefore(new Date(s.start_at), tomorrowStart));
      const nextDaySlots = allSlots.filter(
        (s) =>
          !isBefore(new Date(s.start_at), nextWorkingDayStart) &&
          isBefore(new Date(s.start_at), nextWorkingDayEnd)
      );
      const emptySlotsNextWorkingDay = getEmptyRangesForDay(nextWorkingDay, businessSchedule, nextDaySlots);

      let myPendingSlots: PlanningSlotOnDashboard[] = [];
      if (teamMemberId) {
        const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
        const nextWeekEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
        const { data: pendingRows } = await supabase
          .from('planning_slots')
          .select('id, team_member_id, start_at, end_at, status')
          .eq('tenant_id', currentTenantId)
          .eq('team_member_id', teamMemberId)
          .eq('status', 'pending')
          .gte('start_at', thisWeekStart.toISOString())
          .lte('start_at', nextWeekEnd.toISOString())
          .order('start_at');
        myPendingSlots = (pendingRows ?? []) as unknown as PlanningSlotOnDashboard[];
      }

      let pendingSlotsFromTeam: PlanningSlotOnDashboard[] = [];
      if (canManagePlanningSlots(role)) {
        const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
        const nextWeekEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
        const { data: teamPendingRows } = await supabase
          .from('planning_slots')
          .select('id, team_member_id, start_at, end_at, status, created_by')
          .eq('tenant_id', currentTenantId)
          .eq('status', 'pending')
          .gte('start_at', thisWeekStart.toISOString())
          .lte('start_at', nextWeekEnd.toISOString())
          .order('start_at');
        const rows = (teamPendingRows ?? []) as unknown as PlanningSlotOnDashboard[];
        pendingSlotsFromTeam =
          teamMemberId == null
            ? []
            : rows.filter((s) => s.created_by != null && s.created_by !== teamMemberId);
      }

      setState({
        statusCounts: byStatus,
        mine: user ? list.filter((t) => t.assigned_to === user.id).length : 0,
        unassigned: list.filter((t) => !t.assigned_to).length,
        recentMine: user ? list.filter((t) => t.assigned_to === user.id).slice(0, 8) : [],
        recentUnassigned: list.filter((t) => !t.assigned_to).slice(0, 8),
        teamMembers,
        weekOpenedByDay,
        monthTrend,
        planningSlotsNow,
        planningSlotsToday,
        planningSlotsNextWorkingDay: nextDaySlots,
        nextWorkingDayLabel,
        emptySlotsNextWorkingDay,
        myPendingSlots,
        pendingSlotsFromTeam,
      });
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, user?.id, teamMemberId, role, statuses]);

  // Load when tenant / user / role change (not on every dashboard mount)
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Realtime: refetch when tickets or planning_slots change for this tenant
  useEffect(() => {
    if (!currentTenantId) return;
    channelRef.current?.unsubscribe();
    const channel = supabase
      .channel(`dashboard-${currentTenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `tenant_id=eq.${currentTenantId}`,
        },
        () => {
          refetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'planning_slots',
          filter: `tenant_id=eq.${currentTenantId}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [currentTenantId, refetch]);

  const value: DashboardContextValue = {
    ...state,
    loading,
    refetch,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
