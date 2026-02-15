import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { getWeek, startOfDay, format, isWithinInterval, addDays, isBefore, startOfWeek, endOfWeek, addWeeks } from 'date-fns';
import { Calendar, Users, Trash2, X, PanelRightClose, PanelRightOpen, Pencil, Check, Ban, Clock, AlertCircle, Bell } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useCurrentUserRole } from '../hooks/useCurrentUserRole';
import { canManagePlanningSlots } from '../types/roles';
import { Select } from '../components/ui/Select';

const DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const SEGMENTS_PER_HOUR = 2;
const SEGMENT_HEIGHT = 32;

/** Monday .. Sunday keys matching business_hour_templates.schedule */
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

/** Modern, accessible palette: soft but distinct. */
const USER_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#eab308',
];

/** Darken hex for readable text on light tinted backgrounds. */
function darkenHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - factor)));
  const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - factor)));
  const b = Math.max(0, Math.round((n & 0xff) * (1 - factor)));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

/** Return white or dark text hex for contrast on the given background hex. */
function contrastTextOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
}

const BOOKED_SLOT_COLOR = {
  bg: '#6b728018',
  border: '#6b728040',
  text: '#4b5563',
  textOnLight: '#374151',
  textOnDark: '#ffffff',
  leftBar: '#6b7280',
};

const REJECTED_SLOT_BG = '#fef2f2'; // red-50 – background for avvist slots in calendar

function getUserColor(memberId: string, members: TeamMemberOption[]): {
  bg: string;
  border: string;
  text: string;
  textOnLight: string;
  textOnDark: string;
  leftBar: string;
} {
  const i = members.findIndex((m) => m.id === memberId);
  const hex = USER_COLORS[(i >= 0 ? i : 0) % USER_COLORS.length];
  return {
    bg: `${hex}18`,
    border: `${hex}40`,
    text: hex,
    textOnLight: darkenHex(hex, 0.45),
    textOnDark: contrastTextOn(hex),
    leftBar: hex,
  };
}

/** Parse "HH:mm" to decimal hour (e.g. "09:30" -> 9.5). */
function parseTimeToHour(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

/** Default when no template: Mon–Fri 09:00–17:00. */
const DEFAULT_SCHEDULE: Record<string, { start: string; end: string } | null> = {
  monday: { start: '09:00', end: '17:00' },
  tuesday: { start: '09:00', end: '17:00' },
  wednesday: { start: '09:00', end: '17:00' },
  thursday: { start: '09:00', end: '17:00' },
  friday: { start: '09:00', end: '17:00' },
  saturday: null,
  sunday: null,
};

export interface CalendarHours {
  firstHour: number;
  lastHour: number;
  segmentCount: number;
  /** Per day (0=Mon .. 6=Sun): segment range [start, end] inclusive, or null if closed. */
  daySegRange: ({ start: number; end: number } | null)[];
}

function computeCalendarHours(schedule: Record<string, { start: string; end: string } | null>): CalendarHours {
  let firstHour = 9;
  let lastHour = 17;
  const daySegRange: ({ start: number; end: number } | null)[] = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const key = DAY_KEYS[dayIndex];
    const day = schedule[key];
    if (!day) {
      daySegRange.push(null);
      continue;
    }
    const startH = parseTimeToHour(day.start);
    const endH = parseTimeToHour(day.end);
    if (startH < endH) {
      firstHour = Math.min(firstHour, Math.floor(startH));
      lastHour = Math.max(lastHour, Math.ceil(endH));
    }
    daySegRange.push({ start: 0, end: 0 }); // placeholder, filled below
  }
  const segmentCount = (lastHour - firstHour) * SEGMENTS_PER_HOUR;
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const key = DAY_KEYS[dayIndex];
    const day = schedule[key];
    if (!day) continue;
    const startH = parseTimeToHour(day.start);
    const endH = parseTimeToHour(day.end);
    if (startH >= endH) {
      daySegRange[dayIndex] = null;
      continue;
    }
    const startSeg = Math.max(0, Math.floor((startH - firstHour) * SEGMENTS_PER_HOUR));
    const endSeg = Math.min(segmentCount - 1, Math.ceil((endH - firstHour) * SEGMENTS_PER_HOUR) - 1);
    daySegRange[dayIndex] = { start: Math.max(0, startSeg), end: Math.max(startSeg, endSeg) };
  }
  return { firstHour, lastHour, segmentCount, daySegRange };
}

function segmentToDate(weekStart: Date, dayIndex: number, segmentIndex: number, firstHour: number): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  const hours = firstHour + Math.floor(segmentIndex / SEGMENTS_PER_HOUR);
  const mins = (segmentIndex % SEGMENTS_PER_HOUR) * 30;
  d.setHours(hours, mins, 0, 0);
  return d;
}

function timeLabel(segmentIndex: number, firstHour: number): string {
  const hours = firstHour + Math.floor(segmentIndex / SEGMENTS_PER_HOUR);
  const mins = (segmentIndex % SEGMENTS_PER_HOUR) * 30;
  return `${hours.toString().padStart(2, '0')}:${mins === 0 ? '00' : '30'}`;
}

export type PlanningSlotStatus = 'pending' | 'approved' | 'rejected';

export interface PlanningSlot {
  id: string;
  tenant_id: string;
  team_member_id: string;
  start_at: string;
  end_at: string;
  status?: PlanningSlotStatus;
  created_by?: string | null;
  created_at?: string;
  rejection_comment?: string | null;
}

export interface PlanningSlotRequest {
  id: string;
  tenant_id: string;
  planning_slot_id: string;
  requested_by: string;
  request_type: 'change' | 'remove';
  status: 'pending' | 'approved' | 'rejected';
  requested_start_at: string | null;
  requested_end_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

function getSlotMemberName(teamMemberId: string, members: TeamMemberOption[]): string {
  return members.find((m) => m.id === teamMemberId)?.name ?? 'Ukjent';
}

interface TeamMemberOption {
  id: string;
  name: string;
  email: string;
  is_active?: boolean;
  user_id?: string | null;
}

export function PlanningPage() {
  const { currentTenantId } = useTenant();
  const { role, teamMemberId } = useCurrentUserRole();
  const canManageSlots = canManagePlanningSlots(role);
  const [businessHoursSchedule, setBusinessHoursSchedule] = useState<Record<string, { start: string; end: string } | null>>(DEFAULT_SCHEDULE);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });
  const [slots, setSlots] = useState<PlanningSlot[]>([]);
  const [members, setMembers] = useState<TeamMemberOption[]>([]);
  const [loading, setLoading] = useState(true);

  const calendarHours = useMemo(() => computeCalendarHours(businessHoursSchedule), [businessHoursSchedule]);
  const { firstHour, segmentCount, daySegRange } = calendarHours;
  const [selection, setSelection] = useState<{ dayIndex: number; segStart: number; segEnd: number } | null>(null);
  const [showSelectionPopup, setShowSelectionPopup] = useState(false);
  const [modalEdit, setModalEdit] = useState<{ dayIndex: number; segStart: number; segEnd: number } | null>(null);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
  const [scheduleForUserOpen, setScheduleForUserOpen] = useState(false);
  const [scheduleMemberId, setScheduleMemberId] = useState('');
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleStartSeg, setScheduleStartSeg] = useState(0);
  const [scheduleEndSeg, setScheduleEndSeg] = useState(2);
  const [scheduleRecurringUntil, setScheduleRecurringUntil] = useState<string | null>(null);
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [listColumnMinimized, setListColumnMinimized] = useState(false);
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ dayIndex: number; segStart: number; segEnd: number } | null>(null);
  /** Live segment range during resize drag so the slot visually follows the cursor. */
  const [resizePreview, setResizePreview] = useState<{ segStart: number; segEnd: number } | null>(null);
  const [slotDragState, setSlotDragState] = useState<{
    type: 'move' | 'resize-top' | 'resize-bottom';
    slot: PlanningSlot;
    slotDayIndex: number;
    originalStartAt: string;
    originalEndAt: string;
  } | null>(null);
  const dragRef = useRef<{ dayIndex: number; segIndex: number } | null>(null);
  const calendarGridRef = useRef<HTMLDivElement>(null);
  const slotDragHasMovedRef = useRef(false);
  /** Set when a slot was just moved/resized so we can run a brief settle animation. */
  const [recentlyUpdatedSlotId, setRecentlyUpdatedSlotId] = useState<string | null>(null);
  /** Slot detail modal: for assigned user to view approved slot and request change/remove */
  const [slotDetailSlot, setSlotDetailSlot] = useState<PlanningSlot | null>(null);
  /** Pending slot change/remove requests (for manager/admin to approve/reject) */
  const [pendingSlotRequests, setPendingSlotRequests] = useState<PlanningSlotRequest[]>([]);
  /** When requesting a change, the selected new time range */
  const [requestChangeRange, setRequestChangeRange] = useState<{ dayIndex: number; segStart: number; segEnd: number } | null>(null);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [existingRequestForSlot, setExistingRequestForSlot] = useState<PlanningSlotRequest | null>(null);
  const [sendingReminderAll, setSendingReminderAll] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'planlagte' | 'soknader' | 'dine-godkjennelser'>('planlagte');
  /** Reject søknad modal: slot to reject and optional comment */
  const [rejectSlotModal, setRejectSlotModal] = useState<PlanningSlot | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekStart = startOfDay(currentWeekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const fetchSlots = useCallback(async () => {
    if (!currentTenantId) return;
    const { data, error } = await supabase
      .from('planning_slots')
      .select('id, tenant_id, team_member_id, start_at, end_at, status, created_by, created_at, rejection_comment')
      .eq('tenant_id', currentTenantId)
      .gte('start_at', weekStart.toISOString())
      .lt('end_at', weekEnd.toISOString())
      .order('start_at');
    if (error) {
      setSlots([]);
      return;
    }
    setSlots((data as unknown as PlanningSlot[]) ?? []);
  }, [currentTenantId, weekStart.toISOString(), weekEnd.toISOString()]);

  /** Optimistically update slot(s) status in local state; call fetchSlots() on API error to revert. */
  const setSlotsStatusOptimistic = useCallback(
    (slotIds: string[], status: PlanningSlotStatus, rejectionComment?: string | null) => {
      setSlots((prev) =>
        prev.map((s) =>
          slotIds.includes(s.id)
            ? { ...s, status, ...(status === 'rejected' && rejectionComment !== undefined ? { rejection_comment: rejectionComment } : {}) }
            : s
        )
      );
    },
    []
  );

  const fetchMembers = useCallback(async () => {
    if (!currentTenantId) return;
    const { data } = await supabase
      .from('team_members')
      .select('id, name, email, is_active, user_id')
      .eq('tenant_id', currentTenantId)
      .eq('is_active', true)
      .order('name');
    const list = (data as TeamMemberOption[]) ?? [];
    setMembers(list.filter((m) => m.is_active !== false));
  }, [currentTenantId]);

  const fetchBusinessHours = useCallback(async () => {
    if (!currentTenantId) return;
    const { data: defaultRow } = await supabase
      .from('business_hour_templates')
      .select('schedule')
      .eq('tenant_id', currentTenantId)
      .eq('is_default', true)
      .maybeSingle();
    if (defaultRow?.schedule && typeof defaultRow.schedule === 'object' && !Array.isArray(defaultRow.schedule)) {
      setBusinessHoursSchedule(defaultRow.schedule as Record<string, { start: string; end: string } | null>);
      return;
    }
    const { data: firstRow } = await supabase
      .from('business_hour_templates')
      .select('schedule')
      .eq('tenant_id', currentTenantId)
      .limit(1)
      .maybeSingle();
    if (firstRow?.schedule && typeof firstRow.schedule === 'object' && !Array.isArray(firstRow.schedule)) {
      setBusinessHoursSchedule(firstRow.schedule as Record<string, { start: string; end: string } | null>);
    }
  }, [currentTenantId]);

  const fetchPendingSlotRequests = useCallback(async () => {
    if (!currentTenantId || !canManageSlots) return;
    const { data } = await supabase
      .from('planning_slot_requests')
      .select('id, tenant_id, planning_slot_id, requested_by, request_type, status, requested_start_at, requested_end_at, reviewed_by, created_at')
      .eq('tenant_id', currentTenantId)
      .eq('status', 'pending')
      .order('created_at');
    setPendingSlotRequests((data as PlanningSlotRequest[]) ?? []);
  }, [currentTenantId, canManageSlots]);

  useEffect(() => {
    if (!currentTenantId) return;
    setLoading(true);
    Promise.all([fetchSlots(), fetchMembers(), fetchBusinessHours()]).finally(() => setLoading(false));
  }, [currentTenantId, fetchSlots, fetchMembers, fetchBusinessHours]);

  useEffect(() => {
    fetchPendingSlotRequests();
  }, [fetchPendingSlotRequests]);

  useEffect(() => {
    if (!slotDetailSlot || !teamMemberId) {
      setExistingRequestForSlot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('planning_slot_requests')
        .select('id, tenant_id, planning_slot_id, requested_by, request_type, status, requested_start_at, requested_end_at, reviewed_by, created_at')
        .eq('planning_slot_id', slotDetailSlot!.id)
        .eq('requested_by', teamMemberId)
        .eq('status', 'pending')
        .maybeSingle();
      if (!cancelled) setExistingRequestForSlot((data as PlanningSlotRequest) ?? null);
    })();
    return () => { cancelled = true; };
  }, [slotDetailSlot?.id, teamMemberId]);

  const prevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };
  const nextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };
  const today = new Date();
  const goToToday = () => {
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    setCurrentWeekStart(new Date(d.setDate(diff)));
  };

  const monthName = currentWeekStart.toLocaleDateString('nb-NO', { month: 'long' });
  const monthCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const weekNumber = getWeek(currentWeekStart, { weekStartsOn: 1 });

  const getCellKey = (dayIndex: number, segIndex: number) => `${dayIndex}-${segIndex}`;

  const isSegmentInOpeningHours = (dayIndex: number, segIndex: number): boolean => {
    const range = daySegRange[dayIndex];
    if (!range) return false;
    return segIndex >= range.start && segIndex <= range.end;
  };

  const clampSelectionToOpeningHours = (dayIndex: number, segStart: number, segEnd: number) => {
    const range = daySegRange[dayIndex];
    if (!range) return null;
    const start = Math.max(range.start, Math.min(segStart, segEnd));
    const end = Math.min(range.end, Math.max(segStart, segEnd));
    if (start > end) return null;
    return { dayIndex, segStart: start, segEnd: end };
  };

  const handleCellMouseDown = (dayIndex: number, segIndex: number) => {
    if (!isSegmentInOpeningHours(dayIndex, segIndex)) return;
    dragRef.current = { dayIndex, segIndex };
    setSelection({ dayIndex, segStart: segIndex, segEnd: segIndex });
  };

  const handleCellMouseEnter = (dayIndex: number, segIndex: number) => {
    if (dragRef.current === null) return;
    const start = dragRef.current;
    if (start.dayIndex !== dayIndex) return;
    if (!isSegmentInOpeningHours(dayIndex, segIndex)) return;
    const segStart = Math.min(start.segIndex, segIndex);
    const segEnd = Math.max(start.segIndex, segIndex);
    const clamped = clampSelectionToOpeningHours(dayIndex, segStart, segEnd);
    if (clamped) setSelection(clamped);
  };

  const getSelectionRange = useCallback(
    (sel: { dayIndex: number; segStart: number; segEnd: number }) => {
      const startAt = segmentToDate(currentWeekStart, sel.dayIndex, sel.segStart, firstHour);
      const endAt = segmentToDate(currentWeekStart, sel.dayIndex, sel.segEnd + 1, firstHour);
      return { startAt, endAt };
    },
    [currentWeekStart, firstHour]
  );

  const slotsInWeek = slots.filter((s) => {
    const start = new Date(s.start_at);
    return isWithinInterval(start, { start: weekStart, end: weekEnd });
  });

  const filteredSlotsInWeek =
    filterUserIds.length === 0 ? slotsInWeek : slotsInWeek.filter((s) => filterUserIds.includes(s.team_member_id));

  /** Right column list: agents see only their own slots; managers see all (no "Opptatt" in list for agents). */
  const slotsInWeekForList = canManageSlots ? slotsInWeek : slotsInWeek.filter((s) => s.team_member_id === teamMemberId);

  /** Self-requested = agent used "Søk om vakt"; only managers/admins can approve those. */
  const isSelfRequestedSlot = (slot: PlanningSlot) =>
    slot.created_by != null && slot.created_by === slot.team_member_id;
  const canApproveRejectSlot = (slot: PlanningSlot) =>
    canManageSlots || (slot.team_member_id === teamMemberId && !isSelfRequestedSlot(slot));

  const effectiveSelection = showSelectionPopup && modalEdit ? modalEdit : selection;
  const slotsOverlappingSelection = effectiveSelection
    ? slotsInWeek.filter((slot) => {
        const { startAt, endAt } = getSelectionRange(effectiveSelection);
        const slotStart = new Date(slot.start_at);
        const slotEnd = new Date(slot.end_at);
        const dayStr = format(weekDates[effectiveSelection.dayIndex], 'yyyy-MM-dd');
        if (format(slotStart, 'yyyy-MM-dd') !== dayStr) return false;
        return slotStart.getTime() < endAt.getTime() && slotEnd.getTime() > startAt.getTime();
      })
    : [];

  const addSlotForMember = async (memberId: string) => {
    const rangeSelection = effectiveSelection ?? selection;
    if (!currentTenantId || !rangeSelection) return;
    if (editingSlotId) {
      const { startAt, endAt } = getSelectionRange(rangeSelection);
      await updateSlot(editingSlotId, startAt, endAt, memberId);
      closeSelectionPopup(true);
      return;
    }
    setAddingMemberId(memberId);
    const { startAt, endAt } = getSelectionRange(rangeSelection);
    const payload: { tenant_id: string; team_member_id: string; start_at: string; end_at: string; created_by?: string } = {
      tenant_id: currentTenantId,
      team_member_id: memberId,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    };
    if (teamMemberId) payload.created_by = teamMemberId;
    const { error } = await supabase.from('planning_slots').insert(payload);
    setAddingMemberId(null);
    if (error) return;
    fetchSlots();
    if (!canManageSlots) closeSelectionPopup(true);
  };

  const deleteSlot = async (id: string) => {
    await supabase.from('planning_slots').delete().eq('id', id);
    fetchSlots();
  };

  const updateSlot = async (
    slotId: string,
    startAt: Date,
    endAt: Date,
    teamMemberId?: string
  ) => {
    const payload: { start_at: string; end_at: string; team_member_id?: string } = {
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    };
    if (teamMemberId != null) payload.team_member_id = teamMemberId;
    const { error } = await supabase.from('planning_slots').update(payload).eq('id', slotId);
    if (error) return;
    fetchSlots();
  };

  const setSlotStatus = async (slotId: string, status: PlanningSlotStatus) => {
    setSlotsStatusOptimistic([slotId], status);
    const { error } = await supabase.from('planning_slots').update({ status }).eq('id', slotId);
    if (error) fetchSlots();
  };

  const openSlotDetailModal = (slot: PlanningSlot) => {
    setSlotDetailSlot(slot);
    setRequestChangeRange(null);
    setExistingRequestForSlot(null);
  };

  const closeSlotDetailModal = () => {
    setSlotDetailSlot(null);
    setRequestChangeRange(null);
  };

  const submitSlotRequest = async (type: 'change' | 'remove', requestedStartAt?: Date, requestedEndAt?: Date) => {
    if (!currentTenantId || !teamMemberId || !slotDetailSlot) return;
    if (type === 'change' && (!requestedStartAt || !requestedEndAt)) return;
    setRequestSubmitting(true);
    const payload: {
      tenant_id: string;
      planning_slot_id: string;
      requested_by: string;
      request_type: 'change' | 'remove';
      requested_start_at?: string;
      requested_end_at?: string;
    } = {
      tenant_id: currentTenantId,
      planning_slot_id: slotDetailSlot.id,
      requested_by: teamMemberId,
      request_type: type,
    };
    if (type === 'change' && requestedStartAt && requestedEndAt) {
      payload.requested_start_at = requestedStartAt.toISOString();
      payload.requested_end_at = requestedEndAt.toISOString();
    }
    const { error } = await supabase.from('planning_slot_requests').insert(payload);
    setRequestSubmitting(false);
    if (error) return;
    closeSlotDetailModal();
    fetchPendingSlotRequests();
  };

  const resolveSlotRequest = async (requestId: string, approve: boolean) => {
    const req = pendingSlotRequests.find((r) => r.id === requestId);
    if (!req) return;
    if (approve) {
      if (req.request_type === 'remove') {
        await supabase.from('planning_slots').delete().eq('id', req.planning_slot_id);
      } else if (req.requested_start_at && req.requested_end_at) {
        await supabase
          .from('planning_slots')
          .update({ start_at: req.requested_start_at, end_at: req.requested_end_at })
          .eq('id', req.planning_slot_id);
      }
    }
    await supabase
      .from('planning_slot_requests')
      .update({ status: approve ? 'approved' : 'rejected', reviewed_by: teamMemberId ?? null })
      .eq('id', requestId);
    fetchPendingSlotRequests();
    fetchSlots();
  };

  /** Get dayIndex and segment range for a slot (for opening edit popup). */
  const getSlotSegmentRange = useCallback(
    (slot: PlanningSlot): { dayIndex: number; segStart: number; segEnd: number } => {
      const start = new Date(slot.start_at);
      const end = new Date(slot.end_at);
      const dayStr = format(start, 'yyyy-MM-dd');
      const dayIndex = weekDates.findIndex((d) => format(d, 'yyyy-MM-dd') === dayStr);
      if (dayIndex < 0) return { dayIndex: 0, segStart: 0, segEnd: 0 };
      const segStart = (start.getHours() - firstHour) * SEGMENTS_PER_HOUR + start.getMinutes() / 30;
      const segEnd =
        (end.getHours() - firstHour) * SEGMENTS_PER_HOUR + Math.floor(end.getMinutes() / 30) - 1;
      return { dayIndex, segStart, segEnd: Math.max(segStart, segEnd) };
    },
    [weekDates, firstHour]
  );

  const openEditSlot = (slot: PlanningSlot) => {
    const range = getSlotSegmentRange(slot);
    setSelection(range);
    setModalEdit(range);
    setShowSelectionPopup(true);
    setEditingSlotId(slot.id);
  };

  const closeSelectionPopup = (skipSave = false) => {
    if (!skipSave && editingSlotId && (modalEdit || selection)) {
      const sel = modalEdit || selection;
      if (sel) {
        const { startAt, endAt } = getSelectionRange(sel);
        updateSlot(editingSlotId, startAt, endAt);
      }
    }
    setEditingSlotId(null);
    setSelection(null);
    setShowSelectionPopup(false);
    setModalEdit(null);
  };

  const addScheduleForUser = async () => {
    if (!currentTenantId || !scheduleMemberId || scheduleDays.length === 0) return;
    const inserts: { tenant_id: string; team_member_id: string; start_at: string; end_at: string; created_by?: string }[] = [];
    const endDate = scheduleRecurringUntil ? startOfDay(new Date(scheduleRecurringUntil)) : null;
    const maxWeeks = 52;
    let weekStart = new Date(currentWeekStart);
    for (let w = 0; w < maxWeeks; w++) {
      if (endDate && isBefore(endDate, weekStart)) break;
      for (const dayIndex of scheduleDays) {
        const dayStart = segmentToDate(weekStart, dayIndex, scheduleStartSeg, firstHour);
        const dayEnd = segmentToDate(weekStart, dayIndex, scheduleEndSeg, firstHour);
        if (endDate && isBefore(endDate, dayStart)) continue;
        const row: { tenant_id: string; team_member_id: string; start_at: string; end_at: string; created_by?: string } = {
          tenant_id: currentTenantId,
          team_member_id: scheduleMemberId,
          start_at: dayStart.toISOString(),
          end_at: dayEnd.toISOString(),
        };
        if (canManageSlots && teamMemberId) row.created_by = teamMemberId;
        inserts.push(row);
      }
      if (!endDate) break;
      weekStart = addDays(weekStart, 7);
    }
    if (inserts.length === 0) return;
    const { error } = await supabase.from('planning_slots').insert(inserts);
    if (error) return;
    setScheduleForUserOpen(false);
    setScheduleMemberId('');
    setScheduleDays([]);
    setScheduleRecurringUntil(null);
    fetchSlots();
  };

  const toggleScheduleDay = (dayIndex: number) => {
    setScheduleDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].sort((a, b) => a - b)
    );
  };

  const slotSegmentsByDay = (dayIndex: number) => {
    const dayStr = format(weekDates[dayIndex], 'yyyy-MM-dd');
    return filteredSlotsInWeek.filter((s) => format(new Date(s.start_at), 'yyyy-MM-dd') === dayStr);
  };

  const toggleFilterUser = (memberId: string) => {
    setFilterUserIds((prev) => {
      if (prev.length === 0) return [memberId];
      return prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId];
    });
  };
  const showAllUsers = () => setFilterUserIds([]);
  const filterActive = filterUserIds.length > 0;

  const slotsOverlap = (a: PlanningSlot, b: PlanningSlot) => {
    const aStart = new Date(a.start_at).getTime();
    const aEnd = new Date(a.end_at).getTime();
    const bStart = new Date(b.start_at).getTime();
    const bEnd = new Date(b.end_at).getTime();
    return aStart < bEnd && bStart < aEnd;
  };

  /** Build overlapping groups (transitive): slots that overlap directly or indirectly share one group. */
  const buildOverlapGroups = (daySlots: PlanningSlot[]): PlanningSlot[][] => {
    const groups: PlanningSlot[][] = [];
    const sorted = [...daySlots].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    for (const slot of sorted) {
      const overlapping = groups.filter((g) => g.some((s) => slotsOverlap(slot, s)));
      if (overlapping.length === 0) {
        groups.push([slot]);
      } else if (overlapping.length === 1) {
        overlapping[0].push(slot);
      } else {
        const merged = overlapping.flat();
        merged.push(slot);
        const indices = overlapping
          .map((g) => groups.indexOf(g))
          .sort((a, b) => b - a);
        indices.forEach((i) => groups.splice(i, 1));
        groups.push(merged);
      }
    }
    return groups.map((g) => [...g].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()));
  };

  const getSlotColumnLayout = (
    slot: PlanningSlot,
    dayIndex: number,
    daySlots: PlanningSlot[]
  ): { col: number; row: number; totalRows: number; totalCols: number; blockTop: number; blockHeight: number } => {
    const groups = buildOverlapGroups(daySlots);
    const group = groups.find((g) => g.some((s) => s.id === slot.id));
    const all = group ?? [slot];
    const myIndex = all.findIndex((s) => s.id === slot.id);
    const n = all.length;
    const totalCols = Math.min(3, n);
    const totalRows = Math.ceil(n / 3);
    const col = myIndex % 3;
    const row = Math.floor(myIndex / 3);
    const blockStart = Math.min(...all.map((s) => new Date(s.start_at).getTime()));
    const blockEnd = Math.max(...all.map((s) => new Date(s.end_at).getTime()));
    const dayStart = new Date(weekDates[dayIndex]);
    dayStart.setHours(firstHour, 0, 0, 0);
    const blockTop = ((blockStart - dayStart.getTime()) / (30 * 60 * 1000)) * SEGMENT_HEIGHT;
    const blockHeight = ((blockEnd - blockStart) / (30 * 60 * 1000)) * SEGMENT_HEIGHT;
    return { col, row, totalRows, totalCols, blockTop: Math.max(0, blockTop), blockHeight: Math.max(SEGMENT_HEIGHT, blockHeight) };
  };

  const getSlotDayIndex = (slot: PlanningSlot): number => {
    const slotDateStr = format(new Date(slot.start_at), 'yyyy-MM-dd');
    const i = weekDates.findIndex((d) => format(d, 'yyyy-MM-dd') === slotDateStr);
    return i >= 0 ? i : 0;
  };

  const getCellFromEvent = useCallback((clientX: number, clientY: number): { dayIndex: number; segIndex: number } | null => {
    const el = calendarGridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const col = Math.floor(x / (rect.width / 8));
    const dayIndex = col - 1;
    if (dayIndex < 0 || dayIndex > 6) return null;
    const segIndex = Math.floor(y / SEGMENT_HEIGHT);
    if (segIndex < 0 || segIndex >= segmentCount) return null;
    return { dayIndex, segIndex };
  }, [segmentCount]);

  const handleCellMouseUp = useCallback(
    (e?: { clientX: number; clientY: number }) => {
      if (dragRef.current === null) return;
      const start = dragRef.current;
      let finalSelection = selection;
      if (e && selection) {
        const cell = getCellFromEvent(e.clientX, e.clientY);
        if (cell && cell.dayIndex === start.dayIndex && isSegmentInOpeningHours(cell.dayIndex, cell.segIndex)) {
          const segStart = Math.min(selection.segStart, selection.segEnd, cell.segIndex);
          const segEnd = Math.max(selection.segStart, selection.segEnd, cell.segIndex);
          const clamped = clampSelectionToOpeningHours(start.dayIndex, segStart, segEnd);
          if (clamped) finalSelection = clamped;
        }
      }
      dragRef.current = null;
      if (!finalSelection) return;
      if (canManageSlots) {
        setSelection(finalSelection);
        setModalEdit({ ...finalSelection });
        setShowSelectionPopup(true);
        return;
      }
      // Agent: open "apply for slot" popup only when selected range is open (no overlapping slots)
      const slotsInWeekForCheck = slots.filter((s) => {
        const start = new Date(s.start_at);
        return start.getTime() >= weekStart.getTime() && start.getTime() < weekEnd.getTime();
      });
      const { startAt, endAt } = getSelectionRange(finalSelection);
      const dayStr = format(weekDates[finalSelection.dayIndex], 'yyyy-MM-dd');
      const overlapping = slotsInWeekForCheck.filter((slot) => {
        const slotStart = new Date(slot.start_at);
        const slotEnd = new Date(slot.end_at);
        if (format(slotStart, 'yyyy-MM-dd') !== dayStr) return false;
        return slotStart.getTime() < endAt.getTime() && slotEnd.getTime() > startAt.getTime();
      });
      if (overlapping.length === 0) {
        setSelection(finalSelection);
        setModalEdit(null);
        setShowSelectionPopup(true);
      }
    },
    [selection, getCellFromEvent, canManageSlots, slots, weekStart, weekEnd, weekDates, getSelectionRange]
  );

  useEffect(() => {
    const up = (e: MouseEvent) => handleCellMouseUp(e);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [handleCellMouseUp]);

  const updateSlotTimes = useCallback(
    async (slotId: string, startAt: Date, endAt: Date) => {
      if (endAt.getTime() <= startAt.getTime()) return;
      const { error } = await supabase
        .from('planning_slots')
        .update({ start_at: startAt.toISOString(), end_at: endAt.toISOString() })
        .eq('id', slotId);
      if (error) fetchSlots();
    },
    [fetchSlots]
  );

  const handleSlotDragEnd = useCallback(
    (e: MouseEvent) => {
      if (!slotDragState) return;
      const cell = getCellFromEvent(e.clientX, e.clientY);
      const { slot, slotDayIndex, originalStartAt, originalEndAt, type } = slotDragState;
      const origStart = new Date(originalStartAt);
      const origEnd = new Date(originalEndAt);
      const durationMs = origEnd.getTime() - origStart.getTime();
      const dayStartRef = new Date(weekDates[slotDayIndex]);
      dayStartRef.setHours(firstHour, 0, 0, 0);
      const segEndExclusive = Math.round((origEnd.getTime() - dayStartRef.getTime()) / (30 * 60 * 1000));
      const segStart = Math.round((origStart.getTime() - dayStartRef.getTime()) / (30 * 60 * 1000));

      if (type === 'move') {
        const range = cell ? daySegRange[cell.dayIndex] : null;
        if (slotDragHasMovedRef.current && cell && range && cell.segIndex >= range.start && cell.segIndex <= range.end) {
          const newStart = segmentToDate(currentWeekStart, cell.dayIndex, cell.segIndex, firstHour);
          const newEnd = new Date(newStart.getTime() + durationMs);
          const maxEndSeg = segmentToDate(currentWeekStart, cell.dayIndex, Math.min(segmentCount, range.end + 1), firstHour);
          if (newEnd.getTime() <= maxEndSeg.getTime()) {
            setSlots((prev) =>
              prev.map((s) =>
                s.id === slot.id ? { ...s, start_at: newStart.toISOString(), end_at: newEnd.toISOString() } : s
              )
            );
            updateSlotTimes(slot.id, newStart, newEnd);
            setRecentlyUpdatedSlotId(slot.id);
            setTimeout(() => setRecentlyUpdatedSlotId(null), 350);
          }
        }
        slotDragHasMovedRef.current = false;
      } else if (type === 'resize-top' && cell) {
        const clampedStart = Math.max(0, Math.min(cell.segIndex, segEndExclusive - 1));
        const newStart = segmentToDate(currentWeekStart, slotDayIndex, clampedStart, firstHour);
        if (newStart.getTime() < origEnd.getTime()) {
          setSlots((prev) =>
            prev.map((s) => (s.id === slot.id ? { ...s, start_at: newStart.toISOString() } : s))
          );
          updateSlotTimes(slot.id, newStart, origEnd);
          setRecentlyUpdatedSlotId(slot.id);
          setTimeout(() => setRecentlyUpdatedSlotId(null), 350);
        }
      } else if (type === 'resize-bottom' && cell) {
        const clampedEndSeg = Math.max(segStart + 1, Math.min(cell.segIndex, segmentCount - 1));
        const newEnd = segmentToDate(currentWeekStart, slotDayIndex, clampedEndSeg + 1, firstHour);
        if (newEnd.getTime() > origStart.getTime()) {
          setSlots((prev) =>
            prev.map((s) => (s.id === slot.id ? { ...s, end_at: newEnd.toISOString() } : s))
          );
          updateSlotTimes(slot.id, origStart, newEnd);
          setRecentlyUpdatedSlotId(slot.id);
          setTimeout(() => setRecentlyUpdatedSlotId(null), 350);
        }
      }
      setSlotDragState(null);
    },
    [slotDragState, getCellFromEvent, currentWeekStart, weekDates, updateSlotTimes, firstHour, segmentCount, daySegRange]
  );

  useEffect(() => {
    if (!slotDragState) return;
    if (slotDragState.type !== 'move') setDropPreview(null);
    const { originalStartAt, originalEndAt, slotDayIndex } = slotDragState;
    const dayStartRef = new Date(currentWeekStart);
    dayStartRef.setDate(dayStartRef.getDate() + slotDayIndex);
    dayStartRef.setHours(firstHour, 0, 0, 0);
    const origSegStart = Math.round((new Date(originalStartAt).getTime() - dayStartRef.getTime()) / (30 * 60 * 1000));
    const origSegEndExcl = Math.round((new Date(originalEndAt).getTime() - dayStartRef.getTime()) / (30 * 60 * 1000));
    const origSegEnd = origSegEndExcl - 1;
    if (slotDragState.type === 'resize-top' || slotDragState.type === 'resize-bottom') {
      const initial = { segStart: origSegStart, segEnd: origSegEnd };
      setResizePreview(initial);
      setDropPreview({ dayIndex: slotDayIndex, segStart: initial.segStart, segEnd: initial.segEnd });
    } else {
      setResizePreview(null);
    }

    const onUp = (e: MouseEvent) => {
      handleSlotDragEnd(e);
      setDropPreview(null);
      setResizePreview(null);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const cell = getCellFromEvent(e.clientX, e.clientY);
      if (slotDragState.type === 'move') {
        slotDragHasMovedRef.current = true;
        if (cell) {
          const range = daySegRange[cell.dayIndex];
          if (!range || cell.segIndex < range.start || cell.segIndex > range.end) {
            setDropPreview(null);
          } else {
            const durationMs =
              new Date(slotDragState.originalEndAt).getTime() - new Date(slotDragState.originalStartAt).getTime();
            const durationSegments = Math.max(1, Math.round(durationMs / (30 * 60 * 1000)));
            const segStart = Math.max(range.start, cell.segIndex);
            const segEnd = Math.min(segStart + durationSegments - 1, segmentCount - 1, range.end);
            setDropPreview({ dayIndex: cell.dayIndex, segStart, segEnd });
          }
        } else {
          setDropPreview(null);
        }
      } else if (slotDragState.type === 'resize-top' && cell && cell.dayIndex === slotDayIndex) {
        const range = daySegRange[slotDayIndex];
        const clamped = range
          ? Math.max(range.start, Math.min(cell.segIndex, origSegEnd - 1))
          : Math.max(0, Math.min(cell.segIndex, origSegEnd - 1));
        const next = { segStart: clamped, segEnd: origSegEnd };
        setResizePreview(next);
        setDropPreview({ dayIndex: slotDayIndex, segStart: next.segStart, segEnd: next.segEnd });
      } else if (slotDragState.type === 'resize-bottom' && cell && cell.dayIndex === slotDayIndex) {
        const range = daySegRange[slotDayIndex];
        const clamped = range
          ? Math.max(origSegStart + 1, Math.min(cell.segIndex, range.end))
          : Math.max(origSegStart + 1, Math.min(cell.segIndex, segmentCount - 1));
        const next = { segStart: origSegStart, segEnd: clamped };
        setResizePreview(next);
        setDropPreview({ dayIndex: slotDayIndex, segStart: next.segStart, segEnd: next.segEnd });
      }
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove, { passive: false });
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [slotDragState, handleSlotDragEnd, getCellFromEvent, daySegRange, segmentCount, currentWeekStart, firstHour]);

  if (!currentTenantId) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <p className="text-[var(--hiver-text-muted)]">Velg en tenant.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-6 h-6 text-[var(--hiver-accent)]" />
          <h1 className="text-2xl font-semibold text-[var(--hiver-text)]">Planlegging</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={prevWeek}
            className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
          >
            ← Forrige
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
          >
            I dag
          </button>
          <button
            type="button"
            onClick={nextWeek}
            className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
          >
            Neste →
          </button>
          {canManageSlots && (
            <button
              type="button"
              onClick={() => setScheduleForUserOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
            >
              <Users className="w-4 h-4" />
              Timeplan for bruker
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-[var(--hiver-text-muted)] mb-4">
        {canManageSlots
          ? 'Planlegg supporttimer og kapasitet. Dra i kalenderen for å velge tid, velg bruker og lagre. Eller bruk «Timeplan for bruker» for å legge til samme tid flere dager.'
          : 'Opptatte tider vises som booket. Godkjenn eller avvis vakter leder har lagt inn, eller søk om ledige tider.'}
      </p>

      {/* Filter by user (managers/admins only) */}
      {canManageSlots && (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--hiver-text-muted)] shrink-0">Filtrer på bruker:</span>
        <button
          type="button"
          onClick={showAllUsers}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !filterActive ? 'bg-[var(--hiver-accent)] text-white' : 'border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]'
          }`}
        >
          Alle
        </button>
        {members.map((member) => {
          const isSelected = !filterActive || filterUserIds.includes(member.id);
          const colors = getUserColor(member.id, members);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => toggleFilterUser(member.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                isSelected ? '' : 'opacity-50 hover:opacity-70 border-[var(--hiver-border)] text-[var(--hiver-text-muted)]'
              }`}
              style={isSelected ? { backgroundColor: colors.bg, borderColor: colors.leftBar, color: colors.textOnLight } : undefined}
              title={isSelected ? `Klikk for å vise kun ${member.name}` : `Klikk for å vise ${member.name}`}
            >
              {member.name}
            </button>
          );
        })}
      </div>
      )}

      {/* Pending slot change/remove requests (managers/admins) */}
      {canManageSlots && pendingSlotRequests.length > 0 && (
        <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Forespørsler om vakt ({pendingSlotRequests.length})
          </p>
          <ul className="space-y-2">
            {pendingSlotRequests.map((req) => {
              const slot = slots.find((s) => s.id === req.planning_slot_id);
              const requesterName = getSlotMemberName(req.requested_by, members);
              const currentRange = slot ? `${format(new Date(slot.start_at), 'd. MMM HH:mm')}–${format(new Date(slot.end_at), 'HH:mm')}` : '';
              const requestedRange = req.requested_start_at && req.requested_end_at ? `${format(new Date(req.requested_start_at), 'd. MMM HH:mm')}–${format(new Date(req.requested_end_at), 'HH:mm')}` : null;
              return (
                <li key={req.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-amber-200/60 dark:border-amber-800/50 last:border-0">
                  <span className="text-sm text-[var(--hiver-text)]">
                    <strong>{requesterName}</strong>
                    {' '}ber om {req.request_type === 'remove' ? 'å fjerne vakt' : 'å endre vakt'}
                    {currentRange && ` (${currentRange})`}
                    {requestedRange && req.request_type === 'change' && (
                      <span className="text-[var(--hiver-text-muted)]"> → {requestedRange}</span>
                    )}
                  </span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => resolveSlotRequest(req.id, true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Godkjenn
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveSlotRequest(req.id, false)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/90 text-white hover:bg-red-700"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Avvis
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
      {/* Calendar - 2/3 width when list visible, full width when list minimized; no internal scroll */}
      <div className={`min-w-0 flex flex-col card-panel relative p-5 ${listColumnMinimized ? 'w-full' : 'lg:w-2/3 w-full'}`}>
        <div className="grid grid-cols-8 border-b border-[var(--hiver-border)] sticky top-0 bg-[var(--hiver-panel-bg)] z-10 min-w-[600px]">
          <div className="p-2 border-r border-[var(--hiver-border)] flex flex-col">
            <span className="text-sm font-semibold text-[var(--hiver-text)]">{monthCapitalized}</span>
            <span className="text-xs text-[var(--hiver-text-muted)]">Uke {weekNumber}</span>
          </div>
          {weekDates.map((d, dayIndex) => {
            const isClosedDay = daySegRange[dayIndex] === null;
            const range = daySegRange[dayIndex];
            const canAddOnDay = canManageSlots && range && range.end > range.start;
            return (
              <div
                key={d.toISOString()}
                className={`p-2 text-center text-sm font-medium min-w-[80px] border-r border-[var(--hiver-border)] ${
                  isClosedDay
                    ? 'bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)]'
                    : d.toDateString() === today.toDateString()
                      ? 'text-[var(--hiver-accent)] bg-[var(--hiver-accent-light)]'
                      : 'text-[var(--hiver-text)]'
                }`}
              >
                {DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]}
                <br />
                <span className="text-xs">{d.getDate()}</span>
                {isClosedDay && (
                  <>
                    <br />
                    <span className="text-[10px] font-normal text-[var(--hiver-text-muted)] italic mt-0.5 block">
                      Ikke arbeidsdag
                    </span>
                  </>
                )}
                {canAddOnDay && (
                  <button
                    type="button"
                    onClick={() => {
                      const segStart = range.start;
                      const segEnd = Math.min(range.end, Math.max(segStart + 1, range.start + 2));
                      const sel = { dayIndex, segStart, segEnd };
                      setSelection(sel);
                      setModalEdit(sel);
                      setShowSelectionPopup(true);
                    }}
                    className="mt-1.5 w-full py-1 rounded text-xs font-medium text-[var(--hiver-accent)] hover:bg-[var(--hiver-accent)]/15 border border-[var(--hiver-border)] hover:border-[var(--hiver-accent)]/50"
                    title="Legg til vakt denne dagen"
                  >
                    + Legg til
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div ref={calendarGridRef} className="relative min-w-[600px]">
          {Array.from({ length: segmentCount }, (_, segIndex) => (
            <div
              key={segIndex}
              className="grid grid-cols-8 border-b border-[var(--hiver-border)] min-h-[32px]"
              style={{ minHeight: SEGMENT_HEIGHT }}
            >
              <div className="p-1 text-xs text-[var(--hiver-text-muted)] border-r border-[var(--hiver-border)] flex items-center pointer-events-none select-none bg-[var(--hiver-panel-bg)]">
                {timeLabel(segIndex, firstHour)}
              </div>
              {weekDates.map((_, dayIndex) => {
                const inHours = isSegmentInOpeningHours(dayIndex, segIndex);
                const isClosedDay = daySegRange[dayIndex] === null;
                return (
                <div
                  key={getCellKey(dayIndex, segIndex)}
                  className={`relative p-0 border-r border-[var(--hiver-border)] last:border-r-0 ${
                    isClosedDay ? 'bg-[var(--hiver-bg)] pointer-events-none' : !inHours ? 'bg-[var(--hiver-bg)]/60 pointer-events-none' : ''
                  }`}
                  style={{ minHeight: SEGMENT_HEIGHT }}
                  onMouseDown={() => handleCellMouseDown(dayIndex, segIndex)}
                  onMouseEnter={() => handleCellMouseEnter(dayIndex, segIndex)}
                  onMouseUp={handleCellMouseUp}
                >
                  {selection &&
                    selection.dayIndex === dayIndex &&
                    segIndex >= selection.segStart &&
                    segIndex <= selection.segEnd && (
                      <div
                        className="absolute inset-0 rounded-md border-2 border-dashed border-[var(--hiver-accent)] bg-[var(--hiver-accent)]/15 pointer-events-none z-[1]"
                        style={{ left: 0, right: 0, top: 0, bottom: 0 }}
                        aria-hidden
                      />
                    )}
                </div>
              );
              })}
            </div>
          ))}

          {/* Drop preview: dotted lines showing where the slot will be put (move and resize) - above slots (z-40) when dragging so it stays visible */}
          {dropPreview && (
            <div
              className="absolute rounded-xl pointer-events-none border-2 border-dashed border-[var(--hiver-accent)] bg-[var(--hiver-accent)]/10"
              style={{
                left: `calc(12.5% * ${dropPreview.dayIndex + 1} + 3px)`,
                width: 'calc(12.5% - 6px)',
                top: dropPreview.segStart * SEGMENT_HEIGHT + 3,
                height: (dropPreview.segEnd - dropPreview.segStart + 1) * SEGMENT_HEIGHT - 6,
                zIndex: slotDragState ? 40 : 14,
              }}
              aria-hidden
            />
          )}

          {/* Slot blocks overlay - up to 3 columns when overlapping; hover expands and shows full name */}
          {weekDates.map((_, dayIndex) => {
            const daySlots = slotSegmentsByDay(dayIndex);
            return daySlots.map((slot) => {
              const isDraggingThis = slotDragState?.slot.id === slot.id;
              const slotDayIndex = getSlotDayIndex(slot);
              const isOwnSlot = slot.team_member_id === teamMemberId;
              const name =
                canManageSlots
                  ? getSlotMemberName(slot.team_member_id, members)
                  : isOwnSlot
                    ? 'Din vakt'
                    : 'Opptatt';
              const start = new Date(slot.start_at);
              const end = new Date(slot.end_at);
              let timeRange = `${start.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`;
              if (isDraggingThis && resizePreview) {
                const liveStart = segmentToDate(currentWeekStart, slotDayIndex, resizePreview.segStart, firstHour);
                const liveEnd = segmentToDate(currentWeekStart, slotDayIndex, resizePreview.segEnd + 1, firstHour);
                timeRange = `${liveStart.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}–${liveEnd.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`;
              } else if (isDraggingThis && dropPreview) {
                const liveStart = segmentToDate(currentWeekStart, dropPreview.dayIndex, dropPreview.segStart, firstHour);
                const liveEnd = segmentToDate(currentWeekStart, dropPreview.dayIndex, dropPreview.segEnd + 1, firstHour);
                timeRange = `${liveStart.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}–${liveEnd.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`;
              }
              const colors =
                !canManageSlots && !isOwnSlot ? BOOKED_SLOT_COLOR : getUserColor(slot.team_member_id, members);
              const slotBg = slot.status === 'rejected' ? REJECTED_SLOT_BG : colors.bg;
              const slotBorder = slot.status === 'rejected' ? '#fecaca' : colors.border;
              const isDragging = isDraggingThis;
              const layout = getSlotColumnLayout(slot, dayIndex, daySlots);
              const isHovered = hoveredSlotId === slot.id;
              const dayWidthPct = 12.5;
              const baseLeft = (dayIndex + 1) * dayWidthPct;
              let slotWidthPct = isHovered ? dayWidthPct : dayWidthPct / layout.totalCols;
              let slotLeftPct = isHovered ? baseLeft : baseLeft + layout.col * (dayWidthPct / layout.totalCols);
              let slotTop = isHovered
                ? layout.blockTop + 1
                : layout.blockTop + 1 + layout.row * (layout.blockHeight / layout.totalRows);
              let slotHeight = isHovered
                ? layout.blockHeight - 2
                : layout.blockHeight / layout.totalRows - 2;

              if (isDraggingThis && slotDragState!.type === 'move' && dropPreview) {
                slotLeftPct = (dropPreview.dayIndex + 1) * dayWidthPct;
                slotWidthPct = dayWidthPct;
                slotTop = dropPreview.segStart * SEGMENT_HEIGHT + 2;
                slotHeight = (dropPreview.segEnd - dropPreview.segStart + 1) * SEGMENT_HEIGHT - 4;
              } else if (
                isDraggingThis &&
                (slotDragState!.type === 'resize-top' || slotDragState!.type === 'resize-bottom') &&
                resizePreview
              ) {
                slotTop = resizePreview.segStart * SEGMENT_HEIGHT + 2;
                slotHeight = (resizePreview.segEnd - resizePreview.segStart + 1) * SEGMENT_HEIGHT - 4;
              }
              const showDottedOutline = isDraggingThis && (resizePreview != null || dropPreview != null);
              const justUpdated = recentlyUpdatedSlotId === slot.id;

              const isMyApprovedSlot = slot.team_member_id === teamMemberId && slot.status === 'approved';
              return (
                <div
                  key={slot.id}
                  className={`group absolute rounded-xl text-xs overflow-hidden flex flex-col font-medium shadow-sm hover:shadow-md ${isMyApprovedSlot ? 'cursor-pointer' : canManageSlots ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                  style={{
                    left: `${slotLeftPct}%`,
                    width: `calc(${slotWidthPct}% - 2px)`,
                    marginLeft: '2px',
                    top: slotTop,
                    height: Math.max(20, slotHeight),
                    backgroundColor: slotBg,
                    borderLeft: `3px solid ${slot.status === 'rejected' ? '#dc2626' : colors.leftBar}`,
                    borderTop: `1px solid ${slotBorder}`,
                    borderRight: `1px solid ${slotBorder}`,
                    borderBottom: `1px solid ${slotBorder}`,
                    color: slot.status === 'rejected' ? '#991b1b' : colors.textOnLight,
                    pointerEvents: 'auto',
                    opacity: isDragging ? 0.95 : slot.status === 'rejected' ? 0.85 : 1,
                    transform: isDragging ? 'scale(1.02)' : undefined,
                    boxShadow: justUpdated
                      ? '0 0 0 2px var(--hiver-accent)'
                      : isDragging
                        ? '0 8px 24px rgba(0,0,0,0.15)'
                        : undefined,
                    zIndex: isDragging ? 30 : isHovered ? 20 : 10,
                    transition: 'top 0.25s ease-out, height 0.25s ease-out, left 0.25s ease-out, width 0.25s ease-out, box-shadow 0.25s ease-out, opacity 0.2s ease-out, transform 0.2s ease-out',
                  }}
                  onMouseEnter={() => setHoveredSlotId(slot.id)}
                  onMouseLeave={() => setHoveredSlotId(null)}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('[data-resize-handle], [data-delete-slot], [data-edit-slot]')) return;
                    if (isMyApprovedSlot) return;
                    if (!canManageSlots) return;
                    e.preventDefault();
                    e.stopPropagation();
                    slotDragHasMovedRef.current = false;
                    setSlotDragState({
                      type: 'move',
                      slot,
                      slotDayIndex,
                      originalStartAt: slot.start_at,
                      originalEndAt: slot.end_at,
                    });
                  }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-resize-handle], [data-delete-slot], [data-edit-slot], button')) return;
                    if (isMyApprovedSlot) {
                      e.preventDefault();
                      e.stopPropagation();
                      openSlotDetailModal(slot);
                    }
                  }}
                >
                  {/* Dotted outline on top of slot during resize/move so it's always visible while dragging */}
                  {showDottedOutline && (
                    <div
                      className="absolute inset-0 rounded-xl border-2 border-dashed border-[var(--hiver-accent)] pointer-events-none z-[50]"
                      style={{ boxShadow: 'inset 0 0 0 2px var(--hiver-accent)' }}
                      aria-hidden
                    />
                  )}
                  {slot.team_member_id === teamMemberId && slot.status === 'pending' ? (
                    <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 z-20 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSlotStatus(slot.id, 'approved'); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-0.5 rounded hover:bg-green-500/20 text-green-600"
                        title="Godkjenn"
                        aria-label="Godkjenn"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSlotStatus(slot.id, 'rejected'); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-0.5 rounded hover:bg-red-500/20 text-red-600"
                        title="Avvis"
                        aria-label="Avvis"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : canManageSlots ? (
                    <>
                      <button
                        type="button"
                        data-edit-slot
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEditSlot(slot);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute right-0.5 top-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/15 focus:opacity-100 focus:outline-none z-20 transition-opacity"
                        title="Rediger vakt"
                        aria-label="Rediger vakt"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[var(--hiver-text)]" />
                      </button>
                      <button
                        type="button"
                        data-delete-slot
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteSlot(slot.id);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute right-7 top-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/15 focus:opacity-100 focus:outline-none z-20 transition-opacity"
                        title="Fjern vakt"
                        aria-label="Fjern vakt"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      </button>
                    </>
                  ) : null}
                  {canManageSlots && (
                  <div
                    data-resize-handle="top"
                    className="absolute left-0 right-0 top-0 h-2 cursor-n-resize shrink-0 z-10 bg-gradient-to-b from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-t-xl"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSlotDragState({
                        type: 'resize-top',
                        slot,
                        slotDayIndex,
                        originalStartAt: slot.start_at,
                        originalEndAt: slot.end_at,
                      });
                    }}
                    title="Juster starttid"
                  />
                  )}
                  <div className={`flex flex-col px-1.5 pt-2.5 pb-0.5 flex-1 min-w-0 ${isHovered ? 'whitespace-normal' : ''}`}>
                    <span className={isHovered ? '' : 'truncate'} title={name}>{name}</span>
                    <span className="text-[10px] opacity-90 tabular-nums mt-0.5">{timeRange}</span>
                    {((canManageSlots && slot.status) || (!canManageSlots && isOwnSlot && slot.status)) && (
                      <span className={`text-[10px] mt-0.5 font-medium ${
                        slot.status === 'approved' ? 'text-green-600' : slot.status === 'rejected' ? 'text-red-600' : 'text-amber-600'
                      }`}>
                        {slot.status === 'approved' ? 'Godkjent' : slot.status === 'rejected' ? 'Avvist' : 'Venter'}
                      </span>
                    )}
                  </div>
                  {canManageSlots && (
                  <div
                    data-resize-handle="bottom"
                    className="absolute left-0 right-0 bottom-0 h-2 cursor-s-resize shrink-0 z-10 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-b-xl"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSlotDragState({
                        type: 'resize-bottom',
                        slot,
                        slotDayIndex,
                        originalStartAt: slot.start_at,
                        originalEndAt: slot.end_at,
                      });
                    }}
                    title="Juster sluttid"
                  />
                  )}
                </div>
              );
            });
          })}
        </div>
      </div>

      {/* Selection popup: date/time + list of users (click to add / click to remove) */}
      {selection && showSelectionPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => closeSelectionPopup()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="selection-popup-title"
        >
          <div
            className="bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--hiver-border)] flex items-center justify-between shrink-0">
              <h3 id="selection-popup-title" className="text-lg font-semibold text-[var(--hiver-text)]">
                {canManageSlots
                  ? (editingSlotId ? 'Rediger vakt' : 'Valgt tid')
                  : 'Ledig tid'}
              </h3>
              <button
                type="button"
                onClick={() => closeSelectionPopup()}
                className="p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
                aria-label="Lukk"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {canManageSlots ? (
              <>
                <div className="p-4 shrink-0 space-y-4">
                  <p className="text-xs text-[var(--hiver-text-muted)]">Endre dag og tid om nødvendig, deretter velg brukere.</p>
                  {modalEdit && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Dag</label>
                        <Select
                          value={String(modalEdit.dayIndex)}
                          onChange={(v) => {
                            const dayIndex = Number(v);
                            setModalEdit((prev) => (prev ? { ...prev, dayIndex } : null));
                          }}
                          options={weekDates.map((d, i) => ({
                            value: String(i),
                            label: `${DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()}.`,
                          }))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Fra</label>
                        <Select
                          value={String(modalEdit.segStart)}
                          onChange={(v) => {
                            const segStart = Number(v);
                            setModalEdit((prev) =>
                              prev ? { ...prev, segStart, segEnd: Math.max(prev.segEnd, segStart) } : null
                            );
                          }}
                          options={Array.from({ length: segmentCount }, (_, i) => ({ value: String(i), label: timeLabel(i, firstHour) }))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--hiver-text-muted)] mb-1">Til</label>
                        <Select
                          value={String(modalEdit.segEnd)}
                          onChange={(v) => {
                            const segEnd = Number(v);
                            setModalEdit((prev) => (prev ? { ...prev, segEnd } : null));
                          }}
                          options={Array.from({ length: segmentCount - modalEdit.segStart }, (_, j) => {
                            const i = j + modalEdit.segStart;
                            return {
                              value: String(i),
                              label: timeLabel(Math.min(i + 1, segmentCount), firstHour),
                            };
                          })}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-[var(--hiver-text-muted)]">Klikk på en bruker for å legge til eller fjerne fra denne tiden.</p>
                </div>
                <ul className="overflow-y-auto flex-1 min-h-0 p-4 pt-0 space-y-1">
                  {members.map((member) => {
                    const existingSlot = slotsOverlappingSelection.find((s) => s.team_member_id === member.id);
                    const isAdding = addingMemberId === member.id;
                    return (
                      <li
                        key={member.id}
                        className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg border ${
                          existingSlot ? 'border-[var(--hiver-accent)]/50 bg-[var(--hiver-accent)]/10' : 'border-[var(--hiver-border)]'
                        }`}
                      >
                        <span className="text-sm font-medium text-[var(--hiver-text)] truncate">
                          {member.name}
                          {member.email ? (
                            <span className="text-[var(--hiver-text-muted)] font-normal"> ({member.email})</span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          disabled={isAdding}
                          onClick={() => {
                            if (existingSlot) {
                              deleteSlot(existingSlot.id);
                              if (editingSlotId === existingSlot.id) closeSelectionPopup(true);
                            } else {
                              addSlotForMember(member.id);
                            }
                          }}
                          className={`shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                            existingSlot
                              ? 'bg-red-500/15 text-red-600 hover:bg-red-500/25'
                              : 'bg-[var(--hiver-accent)] text-white hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50'
                          }`}
                        >
                          {isAdding ? 'Legger til…' : existingSlot ? 'Fjern' : editingSlotId ? 'Flytt til' : 'Legg til'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="p-4 space-y-4">
                <p className="text-sm text-[var(--hiver-text-muted)]">
                  Søk om å ta denne vakten. Leder godkjenner eller avviser.
                </p>
                {selection && (
                  <p className="text-sm font-medium text-[var(--hiver-text)] tabular-nums">
                    {weekDates[selection.dayIndex] && (() => {
                      const { startAt, endAt } = getSelectionRange(selection);
                      return `${DAYS[weekDates[selection.dayIndex].getDay() === 0 ? 6 : weekDates[selection.dayIndex].getDay() - 1]} ${weekDates[selection.dayIndex].getDate()}. ${startAt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}–${endAt.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`;
                    })()}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => closeSelectionPopup()}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    disabled={addingMemberId === teamMemberId}
                    onClick={() => teamMemberId && addSlotForMember(teamMemberId)}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium bg-[var(--hiver-accent)] text-white hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
                  >
                    {addingMemberId === teamMemberId ? 'Sender…' : 'Søk om vakt'}
                  </button>
                </div>
              </div>
            )}
            <div className="p-4 border-t border-[var(--hiver-border)] shrink-0">
              <button
                type="button"
                onClick={() => closeSelectionPopup()}
                className="text-sm text-[var(--hiver-text-muted)] hover:underline"
              >
                Lukk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Planlagte timer denne uken - 1/3 width when expanded, narrow strip when minimized */}
      <div
        className={`min-w-0 flex flex-col card-panel shrink-0 ${listColumnMinimized ? 'lg:w-14 w-full p-2 cursor-pointer hover:bg-[var(--hiver-bg)]/50' : 'lg:w-1/3 w-full p-5'}`}
        role={listColumnMinimized ? 'button' : undefined}
        tabIndex={listColumnMinimized ? 0 : undefined}
        title={listColumnMinimized ? 'Klikk for å vise Planlagte timer' : undefined}
        onClick={listColumnMinimized ? () => setListColumnMinimized(false) : undefined}
        onKeyDown={listColumnMinimized ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setListColumnMinimized(false); } } : undefined}
      >
        {listColumnMinimized ? (
          <div className="flex flex-col items-center justify-center gap-3 py-4 px-1 text-[var(--hiver-text-muted)] transition-colors w-full min-h-[120px] pointer-events-none">
            <PanelRightOpen className="w-6 h-6 shrink-0" />
            <span className="text-xs font-medium [writing-mode:vertical-rl] [text-orientation:mixed] inline-block h-20">Planlagte timer</span>
          </div>
        ) : (
          <>
        {/* Send påminnelse – above the right column (managers/admins only) */}
        {canManageSlots && (
          <div className="mb-4 p-4 rounded-xl border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] shrink-0">
            <p className="text-sm font-medium text-[var(--hiver-text)] flex items-center gap-1.5 mb-1">
              <Bell className="w-4 h-4 text-[var(--hiver-accent)]" />
              Påminnelse for neste uke
            </p>
            <p className="text-xs text-[var(--hiver-text-muted)] mb-3">
              Send påminnelse til alle som har vakter som venter på godkjenning neste uke.
            </p>
            <button
              type="button"
              disabled={sendingReminderAll}
              onClick={async () => {
                if (!currentTenantId || sendingReminderAll) return;
                setSendingReminderAll(true);
                try {
                  const now = new Date();
                  const nextWeekStart = startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
                  const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 1 });
                  const { data: nextWeekSlots } = await supabase
                    .from('planning_slots')
                    .select('id, team_member_id, start_at, end_at')
                    .eq('tenant_id', currentTenantId)
                    .eq('status', 'pending')
                    .gte('start_at', nextWeekStart.toISOString())
                    .lte('start_at', nextWeekEnd.toISOString());
                  const pending = (nextWeekSlots ?? []) as { id: string; team_member_id: string; start_at: string; end_at: string }[];
                  const byMember = new Map<string, typeof pending>();
                  for (const s of pending) {
                    const list = byMember.get(s.team_member_id) ?? [];
                    list.push(s);
                    byMember.set(s.team_member_id, list);
                  }
                  let sent = 0;
                  for (const [tmId, memberSlots] of byMember) {
                    const member = members.find((m) => m.id === tmId);
                    const userId = member?.user_id;
                    if (!userId) continue;
                    const slotLines = memberSlots
                      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                      .map((s) => `${format(new Date(s.start_at), 'EEE d. MMM HH:mm')}–${format(new Date(s.end_at), 'HH:mm')}`)
                      .join('\n');
                    await supabase.from('notifications').insert({
                      user_id: userId,
                      tenant_id: currentTenantId,
                      title: 'Påminnelse: godkjenn eller avvis vakter for neste uke',
                      body: `Du har ${memberSlots.length} vakt(er) som venter på godkjenning:\n${slotLines}\n\nGå til planlegging for å godkjenne eller avvise.`,
                      link: '/planning',
                    });
                    sent += 1;
                  }
                  if (sent === 0 && byMember.size > 0) {
                    alert('Ingen av brukerene med ventende vakter har koblet konto. Påminnelse kan ikke sendes.');
                  } else if (sent > 0) {
                    alert(`Påminnelse sendt til ${sent} bruker(e).`);
                  }
                } finally {
                  setSendingReminderAll(false);
                }
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--hiver-accent)] text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Bell className="w-4 h-4" />
              {sendingReminderAll ? 'Sender…' : 'Send påminnelse til alle for neste uke'}
            </button>
          </div>
        )}

        {(() => {
          const pendingFromOthersInWeek = slotsInWeek.filter(
            (s) => s.status === 'pending' && s.created_by != null && s.created_by !== teamMemberId
          );
          const myPendingInWeek = slotsInWeek.filter((s) => s.team_member_id === teamMemberId && s.status === 'pending');
          const myApprovablePendingInWeek = myPendingInWeek.filter((s) => canApproveRejectSlot(s));
          const showTabs = true;
          return (
            <>
        {showTabs ? (
          <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
            <div className="flex rounded-lg border border-[var(--hiver-border)] p-0.5 bg-[var(--hiver-bg)]">
              <button
                type="button"
                onClick={() => setRightPanelTab('planlagte')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${rightPanelTab === 'planlagte' ? 'bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'}`}
              >
                Planlagt
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab('dine-godkjennelser')}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${rightPanelTab === 'dine-godkjennelser' ? 'bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'}`}
              >
                Godkjenn ({myPendingInWeek.length})
              </button>
              {canManageSlots && (
                <button
                  type="button"
                  onClick={() => setRightPanelTab('soknader')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${rightPanelTab === 'soknader' ? 'bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] shadow-sm' : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'}`}
                >
                  Søknader ({pendingFromOthersInWeek.length})
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setListColumnMinimized(true)}
              className="p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)] shrink-0"
              title="Minimer panel"
              aria-label="Minimer"
            >
              <PanelRightClose className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
            <h2 className="text-lg font-semibold text-[var(--hiver-text)]">Planlagte timer denne uken</h2>
            <button
              type="button"
              onClick={() => setListColumnMinimized(true)}
              className="p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
              title="Minimer panel"
              aria-label="Minimer"
            >
              <PanelRightClose className="w-5 h-5" />
            </button>
          </div>
        )}

        {rightPanelTab === 'dine-godkjennelser' && showTabs ? (
          <div className="-mx-1 px-1 space-y-3">
            <p className="text-xs text-[var(--hiver-text-muted)]">
              Vakter du er lagt til i som venter på at du godkjenner eller avviser.
            </p>
            {myPendingInWeek.length === 0 ? (
              <p className="text-sm text-[var(--hiver-text-muted)]">Ingen ventende godkjennelser denne uken.</p>
            ) : (
              <>
                {myApprovablePendingInWeek.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const ids = myApprovablePendingInWeek.map((s) => s.id);
                        setSlotsStatusOptimistic(ids, 'approved');
                        let hadError = false;
                        for (const slot of myApprovablePendingInWeek) {
                          const { error } = await supabase.from('planning_slots').update({ status: 'approved' }).eq('id', slot.id);
                          if (error) { hadError = true; break; }
                        }
                        if (hadError) fetchSlots();
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Godkjenn alle
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Avvise alle ${myApprovablePendingInWeek.length} vakt(er)?`)) return;
                        const ids = myApprovablePendingInWeek.map((s) => s.id);
                        setSlotsStatusOptimistic(ids, 'rejected');
                        let hadError = false;
                        for (const slot of myApprovablePendingInWeek) {
                          const { error } = await supabase.from('planning_slots').update({ status: 'rejected' }).eq('id', slot.id);
                          if (error) { hadError = true; break; }
                        }
                        if (hadError) fetchSlots();
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/90 text-white hover:bg-red-700"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Avvis alle
                    </button>
                  </div>
                )}
                <ul className="space-y-1.5">
                  {myPendingInWeek
                    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                    .map((slot) => (
                      <li key={slot.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-b border-[var(--hiver-border)] last:border-0 text-sm">
                        <span className="text-[var(--hiver-text-muted)] tabular-nums">
                          {format(new Date(slot.start_at), 'EEE d. MMM')} {format(new Date(slot.start_at), 'HH:mm')}–{format(new Date(slot.end_at), 'HH:mm')}
                        </span>
                        {canApproveRejectSlot(slot) ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={async () => {
                                setSlotsStatusOptimistic([slot.id], 'approved');
                                const { error } = await supabase.from('planning_slots').update({ status: 'approved' }).eq('id', slot.id);
                                if (error) fetchSlots();
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Godkjenn
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectSlotModal(slot);
                                setRejectComment('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/90 text-white hover:bg-red-700"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Avvis
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--hiver-text-muted)] shrink-0">Venter på godkjenning</span>
                        )}
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        ) : rightPanelTab === 'soknader' && showTabs ? (
          <div className="-mx-1 px-1 space-y-3">
            <p className="text-xs text-[var(--hiver-text-muted)]">
              Søknader fra andre som venter på at den tilordnede skal godkjenne eller avvise.
            </p>
            {pendingFromOthersInWeek.length === 0 ? (
              <p className="text-sm text-[var(--hiver-text-muted)]">Ingen søknader denne uken.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const ids = pendingFromOthersInWeek.map((s) => s.id);
                      setSlotsStatusOptimistic(ids, 'approved');
                      let hadError = false;
                      for (const slot of pendingFromOthersInWeek) {
                        const { error } = await supabase.from('planning_slots').update({ status: 'approved' }).eq('id', slot.id);
                        if (error) { hadError = true; break; }
                      }
                      if (hadError) fetchSlots();
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Godkjenn alle
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Avvise alle ${pendingFromOthersInWeek.length} søknad(er)?`)) return;
                      const ids = pendingFromOthersInWeek.map((s) => s.id);
                      setSlotsStatusOptimistic(ids, 'rejected');
                      let hadError = false;
                      for (const slot of pendingFromOthersInWeek) {
                        const { error } = await supabase.from('planning_slots').update({ status: 'rejected' }).eq('id', slot.id);
                        if (error) { hadError = true; break; }
                      }
                      if (hadError) fetchSlots();
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/90 text-white hover:bg-red-700"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Avvis alle
                  </button>
                </div>
                <ul className="space-y-1.5">
                {pendingFromOthersInWeek
                  .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                  .map((slot) => (
                    <li key={slot.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-b border-[var(--hiver-border)] last:border-0 text-sm">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0 flex-1">
                        <span className="font-medium text-[var(--hiver-text)]">
                          {getSlotMemberName(slot.team_member_id, members)}
                        </span>
                        <span className="text-[var(--hiver-text-muted)] tabular-nums">
                          {format(new Date(slot.start_at), 'EEE d. MMM')} {format(new Date(slot.start_at), 'HH:mm')}–{format(new Date(slot.end_at), 'HH:mm')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            setSlotsStatusOptimistic([slot.id], 'approved');
                            const { error } = await supabase.from('planning_slots').update({ status: 'approved' }).eq('id', slot.id);
                            if (error) fetchSlots();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Godkjenn
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectSlotModal(slot);
                            setRejectComment('');
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
        ) : (
          <>
        {(() => {
          const myPendingInWeek = slotsInWeek.filter((s) => s.team_member_id === teamMemberId && s.status === 'pending');
          const myApprovablePendingInWeek = myPendingInWeek.filter((s) => canApproveRejectSlot(s));
          return myApprovablePendingInWeek.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  const ids = myApprovablePendingInWeek.map((s) => s.id);
                  setSlotsStatusOptimistic(ids, 'approved');
                  let hadError = false;
                  for (const slot of myApprovablePendingInWeek) {
                    const { error } = await supabase.from('planning_slots').update({ status: 'approved' }).eq('id', slot.id);
                    if (error) { hadError = true; break; }
                  }
                  if (hadError) fetchSlots();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
              >
                <Check className="w-3.5 h-3.5" />
                Godkjenn alle
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Avvise alle ${myApprovablePendingInWeek.length} vakt(er) i listen?`)) return;
                  const ids = myApprovablePendingInWeek.map((s) => s.id);
                  setSlotsStatusOptimistic(ids, 'rejected');
                  let hadError = false;
                  for (const slot of myApprovablePendingInWeek) {
                    const { error } = await supabase.from('planning_slots').update({ status: 'rejected' }).eq('id', slot.id);
                    if (error) { hadError = true; break; }
                  }
                  if (hadError) fetchSlots();
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/90 text-white hover:bg-red-700"
              >
                <Ban className="w-3.5 h-3.5" />
                Avvis alle
              </button>
            </div>
          ) : null;
        })()}
        <div className="-mx-1 px-1 min-h-0">
        {loading ? (
          <p className="text-sm text-[var(--hiver-text-muted)]">Laster…</p>
        ) : slotsInWeekForList.length === 0 ? (
          <p className="text-sm text-[var(--hiver-text-muted)]">{canManageSlots ? 'Ingen planlagte timer. Dra i kalenderen og velg bruker for å legge til.' : 'Ingen av dine planlagte timer denne uken.'}</p>
        ) : (
          <div className="space-y-4">
            {weekDates.map((d) => {
              const dayStr = format(d, 'yyyy-MM-dd');
              const daySlots = slotsInWeekForList
                .filter((s) => format(new Date(s.start_at), 'yyyy-MM-dd') === dayStr)
                .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
              if (daySlots.length === 0) return null;
              const dayName = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
              return (
                <div key={dayStr}>
                  <h3 className="text-base font-semibold text-[var(--hiver-accent)] mb-2 sticky top-0 bg-[var(--hiver-panel-bg)] py-0.5">
                    {dayName} {d.getDate()}. {monthCapitalized}
                  </h3>
                  <ul className="divide-y divide-[var(--hiver-border)]">
                    {daySlots.map((slot) => {
                      const start = new Date(slot.start_at);
                      const end = new Date(slot.end_at);
                      const isOwnSlot = slot.team_member_id === teamMemberId;
                      const name =
                        canManageSlots
                          ? getSlotMemberName(slot.team_member_id, members)
                          : isOwnSlot
                            ? 'Din vakt'
                            : 'Opptatt';
                      const colors =
                        !canManageSlots && !isOwnSlot ? BOOKED_SLOT_COLOR : getUserColor(slot.team_member_id, members);
                      return (
                        <li
                          key={slot.id}
                          className={`py-2 flex items-center justify-between gap-4 group/list-item ${slot.status === 'rejected' ? 'border-l-2 border-red-500 pl-2 opacity-90' : ''}`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-sm font-medium text-[var(--hiver-text)] shrink-0 tabular-nums">
                              {start.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}–
                              {end.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span
                              className="text-sm truncate px-2 py-0.5 rounded font-medium"
                              style={{ color: colors.textOnLight, backgroundColor: colors.bg }}
                            >
                              {name}
                            </span>
                            {((canManageSlots && slot.status) || (!canManageSlots && isOwnSlot && slot.status)) && (
                              <span className={`text-xs font-medium shrink-0 ${
                                slot.status === 'approved' ? 'text-green-600' : slot.status === 'rejected' ? 'text-red-600' : 'text-amber-600'
                              }`}>
                                {slot.status === 'approved' ? 'Godkjent' : slot.status === 'rejected' ? 'Avvist' : 'Venter'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {slot.team_member_id === teamMemberId && slot.status === 'pending' && canApproveRejectSlot(slot) ? (
                              <>
                                <button type="button" onClick={() => setSlotStatus(slot.id, 'approved')} className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-green-500/20 hover:text-green-600 shrink-0" title="Godkjenn" aria-label="Godkjenn"><Check className="w-4 h-4" /></button>
                                <button type="button" onClick={() => setSlotStatus(slot.id, 'rejected')} className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-red-500/20 hover:text-red-600 shrink-0" title="Avvis" aria-label="Avvis"><Ban className="w-4 h-4" /></button>
                              </>
                            ) : (
                              <>
                                {slot.team_member_id === teamMemberId && slot.status === 'approved' && (
                                  <button type="button" onClick={() => openSlotDetailModal(slot)} className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-accent)] shrink-0" title="Åpne – be om endring eller fjerning" aria-label="Åpne"><Clock className="w-4 h-4" /></button>
                                )}
                                {canManageSlots && (
                                  <>
                                    <button type="button" onClick={() => openEditSlot(slot)} className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-accent)] shrink-0" title="Rediger" aria-label="Rediger"><Pencil className="w-4 h-4" /></button>
                                    <button type="button" onClick={() => deleteSlot(slot.id)} className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-red-600 shrink-0" aria-label="Slett"><Trash2 className="w-4 h-4" /></button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        </div>
          </>
        )}
            </>
          );
        })()}
          </>
        )}
      </div>
      </div>

      {/* Slot detail modal: for assigned user to view approved slot and request change/remove */}
      {slotDetailSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeSlotDetailModal} role="dialog" aria-modal="true" aria-labelledby="slot-detail-title">
          <div className="bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] rounded-xl shadow-xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[var(--hiver-border)] flex items-center justify-between">
              <h3 id="slot-detail-title" className="text-lg font-semibold text-[var(--hiver-text)]">Din vakt</h3>
              <button type="button" onClick={closeSlotDetailModal} className="p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]" aria-label="Lukk">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-[var(--hiver-text)]">
                <span className="font-medium tabular-nums">
                  {format(new Date(slotDetailSlot.start_at), 'HH:mm')}–{format(new Date(slotDetailSlot.end_at), 'HH:mm')}
                </span>
                <span className="text-[var(--hiver-text-muted)] ml-1.5">
                  {format(new Date(slotDetailSlot.start_at), 'EEEE d. MMMM', { weekStartsOn: 1 })}
                </span>
              </p>
              {existingRequestForSlot ? (
                <p className="text-sm text-amber-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Du har allerede sendt en forespørsel om {existingRequestForSlot.request_type === 'remove' ? 'fjerning' : 'endring'} som venter på svar fra leder.
                </p>
              ) : (
                <>
                  <p className="text-xs text-[var(--hiver-text-muted)]">
                    Kan du ikke? Be om endring av tid eller fjerning av vakten. Leder må godkjenne.
                  </p>
                  {requestChangeRange === null ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setRequestChangeRange({ dayIndex: getSlotSegmentRange(slotDetailSlot).dayIndex, segStart: getSlotSegmentRange(slotDetailSlot).segStart, segEnd: getSlotSegmentRange(slotDetailSlot).segEnd })}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
                      >
                        <Clock className="w-4 h-4" />
                        Be om endring
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Er du sikker på at du vil be om å fjerne denne vakten? Leder må godkjenne.')) {
                            submitSlotRequest('remove');
                          }
                        }}
                        disabled={requestSubmitting}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Be om å fjerne vakt
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2 border-t border-[var(--hiver-border)]">
                      <p className="text-xs font-medium text-[var(--hiver-text-muted)]">Velg ny tid (innen denne uken)</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-[var(--hiver-text-muted)] mb-0.5">Dag</label>
                          <Select
                            value={String(requestChangeRange.dayIndex)}
                            onChange={(v) => setRequestChangeRange((r) => (r ? { ...r, dayIndex: Number(v) } : null))}
                            options={weekDates.map((d, i) => ({ value: String(i), label: `${DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getDate()}.` }))}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--hiver-text-muted)] mb-0.5">Fra</label>
                          <Select
                            value={String(requestChangeRange.segStart)}
                            onChange={(v) => setRequestChangeRange((r) => (r ? { ...r, segStart: Number(v), segEnd: Math.max(r.segEnd, Number(v)) } : null))}
                            options={Array.from({ length: segmentCount }, (_, i) => ({ value: String(i), label: timeLabel(i, firstHour) }))}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--hiver-text-muted)] mb-0.5">Til</label>
                          <Select
                            value={String(requestChangeRange.segEnd)}
                            onChange={(v) => setRequestChangeRange((r) => (r ? { ...r, segEnd: Number(v) } : null))}
                            options={Array.from({ length: segmentCount - requestChangeRange.segStart }, (_, j) => {
                              const seg = j + requestChangeRange.segStart;
                              return { value: String(seg), label: timeLabel(seg + 1, firstHour) };
                            })}
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRequestChangeRange(null)}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                        >
                          Avbryt
                        </button>
                        <button
                          type="button"
                          disabled={requestSubmitting}
                          onClick={() => {
                            const { startAt, endAt } = getSelectionRange(requestChangeRange!);
                            submitSlotRequest('change', startAt, endAt);
                          }}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--hiver-accent)] text-white hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
                        >
                          {requestSubmitting ? 'Sender…' : 'Send forespørsel om endring'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Schedule for user modal */}
      {scheduleForUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setScheduleForUserOpen(false)}>
          <div
            className="bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--hiver-text)]">Timeplan for bruker</h3>
              <button
                type="button"
                onClick={() => setScheduleForUserOpen(false)}
                className="p-1 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                aria-label="Lukk"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[var(--hiver-text-muted)] mb-4">
              Velg bruker, dager og tid. Standard er kun denne uken; du kan velge gjentakende til en dato.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Bruker</label>
                <Select
                  value={scheduleMemberId}
                  onChange={setScheduleMemberId}
                  options={members.map((m) => ({ value: m.id, label: `${m.name} (${m.email})` }))}
                  placeholder="Velg bruker"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-2">Dager</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleScheduleDay(i)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                        scheduleDays.includes(i)
                          ? 'bg-[var(--hiver-accent)] text-white'
                          : 'border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]'
                      }`}
                    >
                      {DAYS[i]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Fra</label>
                  <Select
                    value={String(scheduleStartSeg)}
                    onChange={(v) => setScheduleStartSeg(Number(v))}
                    options={Array.from({ length: segmentCount }, (_, i) => ({ value: String(i), label: timeLabel(i, firstHour) }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Til</label>
                  <Select
                    value={String(scheduleEndSeg)}
                    onChange={(v) => setScheduleEndSeg(Number(v))}
                    options={Array.from({ length: segmentCount }, (_, i) => ({ value: String(i), label: timeLabel(i, firstHour) }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-2">Periode</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="schedulePeriod"
                      checked={scheduleRecurringUntil === null}
                      onChange={() => setScheduleRecurringUntil(null)}
                      className="text-[var(--hiver-accent)] focus:ring-[var(--hiver-accent)]"
                    />
                    <span className="text-sm text-[var(--hiver-text)]">Kun denne uken</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="schedulePeriod"
                      checked={scheduleRecurringUntil !== null}
                      onChange={() => setScheduleRecurringUntil(format(addDays(currentWeekStart, 27), 'yyyy-MM-dd'))}
                      className="text-[var(--hiver-accent)] focus:ring-[var(--hiver-accent)]"
                    />
                    <span className="text-sm text-[var(--hiver-text)]">Gjentakende til dato</span>
                  </label>
                  {scheduleRecurringUntil !== null && (
                    <div className="ml-6 mt-2">
                      <input
                        type="date"
                        value={scheduleRecurringUntil}
                        min={format(currentWeekStart, 'yyyy-MM-dd')}
                        onChange={(e) => setScheduleRecurringUntil(e.target.value || null)}
                        className="rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] text-[var(--hiver-text)] text-sm px-3 py-2 w-full max-w-[200px]"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setScheduleForUserOpen(false)}
                className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)]"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={addScheduleForUser}
                disabled={!scheduleMemberId || scheduleDays.length === 0 || scheduleStartSeg >= scheduleEndSeg}
                className="px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scheduleRecurringUntil ? 'Legg til gjentakende' : 'Legg til i uken'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject søknad modal: optional reason, then notify assigned user */}
      {rejectSlotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="reject-modal-title">
          <div className="bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)] rounded-xl shadow-xl max-w-md w-full p-4 space-y-3">
            <h3 id="reject-modal-title" className="text-lg font-semibold text-[var(--hiver-text)]">Avvis søknad</h3>
            <p className="text-sm text-[var(--hiver-text-muted)]">
              {getSlotMemberName(rejectSlotModal.team_member_id, members)} – {format(new Date(rejectSlotModal.start_at), 'EEE d. MMM HH:mm')}–{format(new Date(rejectSlotModal.end_at), 'HH:mm')}
            </p>
            <label className="block text-sm font-medium text-[var(--hiver-text)]">
              Begrunnelse (valgfritt) – sendes til den som søkte
            </label>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="F.eks. kapasitet er full for den uken"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)] text-[var(--hiver-text)] placeholder-[var(--hiver-text-muted)] text-sm resize-y min-h-[4rem]"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setRejectSlotModal(null); setRejectComment(''); }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--hiver-text)] bg-[var(--hiver-bg)] hover:opacity-90"
              >
                Avbryt
              </button>
              <button
                type="button"
                disabled={rejectSubmitting}
                onClick={async () => {
                  const slotId = rejectSlotModal.id;
                  setRejectSubmitting(true);
                  const comment = rejectComment.trim() || null;
                  setSlotsStatusOptimistic([slotId], 'rejected', comment);
                  setRejectSlotModal(null);
                  setRejectComment('');
                  setRejectSubmitting(false);
                  const { error } = await supabase
                    .from('planning_slots')
                    .update({ status: 'rejected', rejection_comment: comment })
                    .eq('id', slotId);
                  if (error) fetchSlots();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600/90 text-white hover:bg-red-700 disabled:opacity-60"
              >
                <Ban className="w-3.5 h-3.5" />
                {rejectSubmitting ? 'Avviser…' : 'Avvis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
