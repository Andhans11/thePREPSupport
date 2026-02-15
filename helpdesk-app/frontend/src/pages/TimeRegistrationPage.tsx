import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
} from 'date-fns';
import { nb } from 'date-fns/locale';
import {
  Clock,
  Calendar,
  List,
  Plus,
  X,
  Check,
  Ban,
  Send,
  Pencil,
  Trash2,
  Briefcase,
  UserX,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Settings,
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useCurrentUserRole } from '../hooks/useCurrentUserRole';
import { canApproveTimeRegistration, isAdmin } from '../types/roles';
import { useToast } from '../contexts/ToastContext';
import { Select } from '../components/ui/Select';

const DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const WEEK_FIRST_HOUR = 7;
const WEEK_LAST_HOUR = 20;
const SEGMENTS_PER_HOUR = 2; // 30 min slots
const WEEK_SEGMENT_HEIGHT = 28;
const WEEK_GRID_HEADER_HEIGHT = 40;

/** Format hours for display: use comma as decimal separator */
function formatHours(h: number): string {
  const s = typeof h === 'number' && !Number.isNaN(h) ? String(h) : '0';
  return s.replace('.', ',');
}

/** Parse "HH:mm" to minutes from midnight; invalid returns 0 */
function timeToMinutes(t: string): number {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t.trim())) return 0;
  const [h, m] = t.trim().split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
/** Minutes from midnight to "HH:mm" */
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** Decimal hours to hours and minutes (for form) */
function hoursToHoursMinutes(decimalHours: number): { hours: number; minutes: number } {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return { hours: h, minutes: m > 59 ? 59 : m };
}

/** Hours + minutes to decimal hours */
function hoursMinutesToDecimal(hours: number, minutes: number): number {
  return hours + minutes / 60;
}

export interface WorkType {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
}

export interface AbsenceType {
  id: string;
  tenant_id: string;
  code: string;
  label: string;
  sort_order: number;
}

export type TimeEntryStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface TimeEntry {
  id: string;
  tenant_id: string;
  team_member_id: string;
  entry_date: string;
  entry_type: 'work' | 'absence';
  work_type_id: string | null;
  project_id: string | null;
  absence_type_id: string | null;
  hours: number;
  start_time: string | null; // "HH:mm:ss" from DB
  description: string | null;
  status: TimeEntryStatus;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_comment: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamMemberOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function TimeRegistrationPage() {
  const { currentTenantId } = useTenant();
  const { role, teamMemberId } = useCurrentUserRole();
  const toast = useToast();
  const canApprove = canApproveTimeRegistration(role);

  const [view, setView] = useState<'list' | 'week' | 'month'>('week');
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [members, setMembers] = useState<TeamMemberOption[]>([]);
  const [approverIds, setApproverIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [formDate, setFormDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [formType, setFormType] = useState<'work' | 'absence'>('work');
  const [formWorkTypeId, setFormWorkTypeId] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formAbsenceTypeId, setFormAbsenceTypeId] = useState('');
  const [formHoursInt, setFormHoursInt] = useState(7);
  const [formMinutesInt, setFormMinutesInt] = useState(30);
  const [formStartTime, setFormStartTime] = useState(''); // "HH:mm" optional
  const [formEndTime, setFormEndTime] = useState(''); // "HH:mm" optional, syncs with hours/minutes
  const [formDescription, setFormDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [approvalTab, setApprovalTab] = useState(false);
  const [rejectModal, setRejectModal] = useState<TimeEntry | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);

  const weekGridRef = useRef<HTMLDivElement>(null);
  const weekDragRef = useRef<{ dayIndex: number; segIndex: number } | null>(null);
  const [weekSelection, setWeekSelection] = useState<{ dayIndex: number; segStart: number; segEnd: number } | null>(null);
  const weekSelectionRef = useRef(weekSelection);
  weekSelectionRef.current = weekSelection;

  const isApprover = canApprove || (teamMemberId && approverIds.has(teamMemberId));

  const fetchData = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const [workRes, projRes, absRes, entriesRes, membersRes, approversRes] = await Promise.all([
        supabase.from('time_registration_work_types').select('*').eq('tenant_id', currentTenantId).order('sort_order'),
        supabase.from('time_registration_projects').select('*').eq('tenant_id', currentTenantId),
        supabase.from('time_registration_absence_types').select('*').eq('tenant_id', currentTenantId).order('sort_order'),
        supabase.from('time_entries').select('*').eq('tenant_id', currentTenantId).order('entry_date', { ascending: false }),
        supabase.from('team_members').select('id, name, email, role').eq('tenant_id', currentTenantId).eq('is_active', true),
        supabase.from('time_registration_approvers').select('team_member_id').eq('tenant_id', currentTenantId),
      ]);
      if (workRes.data) setWorkTypes(workRes.data as WorkType[]);
      if (projRes.data) setProjects(projRes.data as Project[]);
      if (absRes.data) setAbsenceTypes(absRes.data as AbsenceType[]);
      if (entriesRes.data) setEntries(entriesRes.data as TimeEntry[]);
      if (membersRes.data) setMembers(membersRes.data as TeamMemberOption[]);
      if (approversRes.data) setApproverIds(new Set((approversRes.data as { team_member_id: string }[]).map((r) => r.team_member_id)));
    } catch (e) {
      toast.error('Kunne ikke laste timeregistrering.');
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAdd = (date?: string, startTime?: string, initialHoursMinutes?: { hours: number; minutes: number }) => {
    setEditingEntry(null);
    setFormDate(date || format(new Date(), 'yyyy-MM-dd'));
    setFormType('work');
    setFormWorkTypeId(workTypes[0]?.id ?? '');
    setFormProjectId('');
    setFormAbsenceTypeId(absenceTypes[0]?.id ?? '');
    if (initialHoursMinutes) {
      setFormHoursInt(initialHoursMinutes.hours);
      setFormMinutesInt(initialHoursMinutes.minutes);
    } else {
      setFormHoursInt(7);
      setFormMinutesInt(30);
    }
    const startStr = startTime ?? '';
    setFormStartTime(startStr);
    if (startStr && initialHoursMinutes) {
      const totalMins = initialHoursMinutes.hours * 60 + initialHoursMinutes.minutes;
      setFormEndTime(minutesToTime(timeToMinutes(startStr) + totalMins));
    } else {
      setFormEndTime('');
    }
    setFormDescription('');
    setModalOpen(true);
  };

  const openEdit = (entry: TimeEntry) => {
    if (entry.status !== 'draft' && entry.status !== 'submitted') return;
    setEditingEntry(entry);
    setFormDate(entry.entry_date);
    setFormType(entry.entry_type);
    setFormWorkTypeId(entry.work_type_id ?? '');
    setFormProjectId(entry.project_id ?? '');
    setFormAbsenceTypeId(entry.absence_type_id ?? '');
    const { hours: h, minutes: m } = hoursToHoursMinutes(entry.hours);
    setFormHoursInt(h);
    setFormMinutesInt(m);
    const startStr = entry.start_time ? entry.start_time.slice(0, 5) : '';
    setFormStartTime(startStr);
    const totalMins = h * 60 + m;
    setFormEndTime(startStr ? minutesToTime(timeToMinutes(startStr) + totalMins) : '');
    setFormDescription(entry.description ?? '');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEntry(null);
    setRejectModal(null);
    setRejectComment('');
  };

  const handleSave = async () => {
    if (!currentTenantId || !teamMemberId) return;
    const hoursNum = hoursMinutesToDecimal(formHoursInt, formMinutesInt);
    if (hoursNum <= 0 || hoursNum > 24) {
      toast.error('Totalt må være mellom 0 og 24 timer.');
      return;
    }
    if (formType === 'work' && !formWorkTypeId) {
      toast.error('Velg arbeidstype.');
      return;
    }
    if (formType === 'absence' && !formAbsenceTypeId) {
      toast.error('Velg fraværstype.');
      return;
    }
    const startTimeVal = formStartTime.trim() ? (formStartTime.trim().length === 5 ? formStartTime.trim() + ':00' : formStartTime.trim()) : null;
    setSaving(true);
    try {
      const payload = {
        tenant_id: currentTenantId,
        team_member_id: teamMemberId,
        entry_date: formDate,
        entry_type: formType,
        work_type_id: formType === 'work' ? formWorkTypeId || null : null,
        project_id: formProjectId || null,
        absence_type_id: formType === 'absence' ? formAbsenceTypeId || null : null,
        hours: hoursNum,
        start_time: startTimeVal,
        description: formDescription.trim() || null,
        status: editingEntry?.status ?? 'draft',
      };
      if (editingEntry) {
        const { error } = await supabase.from('time_entries').update(payload).eq('id', editingEntry.id);
        if (error) throw error;
        toast.success('Timeregistrering oppdatert.');
      } else {
        const { error } = await supabase.from('time_entries').insert(payload);
        if (error) throw error;
        toast.success('Timeregistrering lagt til.');
      }
      closeModal();
      fetchData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Kunne ikke lagre.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (entry: TimeEntry) => {
    const { error } = await supabase
      .from('time_entries')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Sendt til godkjenning.');
    fetchData();
  };

  const handleSubmitMany = async (entriesToSubmit: TimeEntry[]) => {
    const draftOnes = entriesToSubmit.filter((e) => e.status === 'draft');
    if (draftOnes.length === 0) {
      toast.error('Ingen utkast å sende inn.');
      return;
    }
    for (const entry of draftOnes) {
      const { error } = await supabase
        .from('time_entries')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', entry.id);
      if (error) {
        toast.error(error.message);
        fetchData();
        return;
      }
    }
    toast.success(`${draftOnes.length} registrering${draftOnes.length === 1 ? '' : 'er'} sendt til godkjenning.`);
    fetchData();
  };

  const handleApprove = async (entry: TimeEntry) => {
    if (!teamMemberId) return;
    setApprovalActionLoading(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          status: 'approved',
          approved_by: teamMemberId,
          approved_at: new Date().toISOString(),
          rejection_comment: null,
        })
        .eq('id', entry.id);
      if (error) throw error;
      toast.success('Timeregistrering godkjent.');
      fetchData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Kunne ikke godkjenne.');
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !teamMemberId) return;
    setApprovalActionLoading(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          status: 'rejected',
          approved_by: teamMemberId,
          approved_at: new Date().toISOString(),
          rejection_comment: rejectComment.trim() || null,
        })
        .eq('id', rejectModal.id);
      if (error) throw error;
      toast.success('Timeregistrering avvist.');
      closeModal();
      fetchData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Kunne ikke avvise.');
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const handleDelete = async (entry: TimeEntry) => {
    if (entry.status !== 'draft') return;
    if (!confirm('Slette denne timeregistreringen?')) return;
    const { error } = await supabase.from('time_entries').delete().eq('id', entry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Slettet.');
    fetchData();
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekDateStrs = weekDates.map((d) => format(d, 'yyyy-MM-dd'));
  const myEntries = entries.filter((e) => e.team_member_id === teamMemberId);
  /** Admins see all entries in list/week/month; others see only their own. */
  const displayEntries = isAdmin(role) ? entries : myEntries;
  const submittedPending = entries.filter((e) => e.status === 'submitted');
  const draftInWeek = myEntries.filter((e) => e.status === 'draft' && weekDateStrs.includes(e.entry_date));
  const draftInMonth = myEntries.filter((e) => {
    if (e.status !== 'draft') return false;
    const d = parseISO(e.entry_date);
    return isWithinInterval(d, { start: startOfMonth(monthStart), end: endOfMonth(monthStart) });
  });

  const weekSegmentCount = (WEEK_LAST_HOUR - WEEK_FIRST_HOUR) * SEGMENTS_PER_HOUR;
  const segmentIndexToTimeLabel = useCallback((segIndex: number): string => {
    const totalMins = segIndex * (60 / SEGMENTS_PER_HOUR);
    const hour = WEEK_FIRST_HOUR + Math.floor(totalMins / 60);
    const min = totalMins % 60;
    return `${hour.toString().padStart(2, '0')}:${min === 0 ? '00' : '30'}`;
  }, []);
  const selectionToHoursMinutes = useCallback((segStart: number, segEnd: number): { hours: number; minutes: number } => {
    const segments = Math.max(1, segEnd - segStart + 1);
    const totalMinutes = segments * (60 / SEGMENTS_PER_HOUR);
    return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
  }, []);

  const getWeekCellFromEvent = useCallback(
    (clientX: number, clientY: number): { dayIndex: number; segIndex: number } | null => {
      const el = weekGridRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (y < WEEK_GRID_HEADER_HEIGHT) return null;
      const segIndex = Math.floor((y - WEEK_GRID_HEADER_HEIGHT) / WEEK_SEGMENT_HEIGHT);
      if (segIndex < 0 || segIndex >= weekSegmentCount) return null;
      const col = Math.floor(x / (rect.width / 8));
      if (col < 1 || col > 7) return null;
      return { dayIndex: col - 1, segIndex };
    },
    [weekSegmentCount]
  );

  const handleWeekCellMouseDown = useCallback((dayIndex: number, segIndex: number, hasBlock: boolean) => {
    if (hasBlock) return;
    weekDragRef.current = { dayIndex, segIndex };
    setWeekSelection({ dayIndex, segStart: segIndex, segEnd: segIndex });
  }, []);

  const handleWeekCellMouseEnter = useCallback((dayIndex: number, segIndex: number) => {
    if (weekDragRef.current === null) return;
    const start = weekDragRef.current;
    if (start.dayIndex !== dayIndex) return;
    const segStart = Math.min(start.segIndex, segIndex);
    const segEnd = Math.max(start.segIndex, segIndex);
    setWeekSelection({ dayIndex, segStart, segEnd });
  }, []);

  const handleWeekCellMouseUp = useCallback(
    (e: MouseEvent) => {
      if (weekDragRef.current === null) return;
      const start = weekDragRef.current;
      let finalSelection = weekSelectionRef.current;
      const cell = getWeekCellFromEvent(e.clientX, e.clientY);
      if (cell && cell.dayIndex === start.dayIndex) {
        const segStart = Math.min(start.segIndex, cell.segIndex, finalSelection?.segStart ?? start.segIndex, finalSelection?.segEnd ?? start.segIndex);
        const segEnd = Math.max(start.segIndex, cell.segIndex, finalSelection?.segStart ?? start.segIndex, finalSelection?.segEnd ?? start.segIndex);
        finalSelection = { dayIndex: start.dayIndex, segStart, segEnd };
      }
      weekDragRef.current = null;
      setWeekSelection(null);
      if (!finalSelection) return;
      const dateStr = format(weekDates[finalSelection.dayIndex], 'yyyy-MM-dd');
      const startTimeLabel = segmentIndexToTimeLabel(finalSelection.segStart);
      const { hours, minutes } = selectionToHoursMinutes(finalSelection.segStart, finalSelection.segEnd);
      openAdd(dateStr, startTimeLabel, { hours, minutes });
    },
    [getWeekCellFromEvent, weekDates, segmentIndexToTimeLabel, selectionToHoursMinutes]
  );

  useEffect(() => {
    const up = (e: MouseEvent) => handleWeekCellMouseUp(e);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [handleWeekCellMouseUp]);
  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name ?? '—';
  const getWorkTypeName = (id: string | null) => (id ? workTypes.find((w) => w.id === id)?.name : '—');
  const getProjectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name : '—');
  const getAbsenceLabel = (id: string | null) => (id ? absenceTypes.find((a) => a.id === id)?.label : '—');

  const weekRange = useMemo(() => ({ start: startOfWeek(weekStart, { weekStartsOn: 1 }), end: endOfWeek(weekStart, { weekStartsOn: 1 }) }), [weekStart]);
  const monthRange = useMemo(() => ({ start: startOfMonth(monthStart), end: endOfMonth(monthStart) }), [monthStart]);
  const hoursThisWeek = useMemo(() => {
    return myEntries
      .filter((e) => isWithinInterval(parseISO(e.entry_date), weekRange))
      .reduce((sum, e) => sum + e.hours, 0);
  }, [myEntries, weekRange]);
  const hoursThisMonth = useMemo(() => {
    return myEntries
      .filter((e) => isWithinInterval(parseISO(e.entry_date), monthRange))
      .reduce((sum, e) => sum + e.hours, 0);
  }, [myEntries, monthRange]);

  /** For week view: get start minutes from midnight (start_time or default 08:00) */
  const getEntryStartMinutes = (entry: TimeEntry): number => {
    if (entry.start_time) {
      const [h, m] = entry.start_time.split(':').map(Number);
      return (h ?? 8) * 60 + (m ?? 0);
    }
    return 8 * 60;
  };

  /** Segment index in week grid (0 = 07:00); clamp to valid range */
  const entryToWeekBlock = (entry: TimeEntry): { dayIndex: number; segStart: number; heightPx: number } | null => {
    const dateStr = entry.entry_date;
    const dayIndex = weekDates.findIndex((d) => format(d, 'yyyy-MM-dd') === dateStr);
    if (dayIndex < 0) return null;
    const startMins = getEntryStartMinutes(entry);
    const gridStartMins = WEEK_FIRST_HOUR * 60;
    const segStart = Math.max(0, Math.floor((startMins - gridStartMins) / (60 / SEGMENTS_PER_HOUR)));
    const segmentCount = (WEEK_LAST_HOUR - WEEK_FIRST_HOUR) * SEGMENTS_PER_HOUR;
    if (segStart >= segmentCount) return null;
    const segmentsSpan = Math.min(segmentCount - segStart, Math.ceil(entry.hours * SEGMENTS_PER_HOUR));
    const heightPx = segmentsSpan * WEEK_SEGMENT_HEIGHT;
    return { dayIndex, segStart, heightPx };
  };

  const statusLabel: Record<TimeEntryStatus, string> = {
    draft: 'Utkast',
    submitted: 'Sendt inn',
    approved: 'Godkjent',
    rejected: 'Avvist',
  };

  if (!currentTenantId) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <p className="text-[var(--hiver-text-muted)]">Velg en organisasjon.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Clock className="w-6 h-6 text-[var(--hiver-accent)]" />
          <h1 className="text-2xl font-semibold text-[var(--hiver-text)]">Timeregistrering</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openAdd()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
          >
            <Plus className="w-4 h-4" />
            Ny registrering
          </button>
          {isApprover && submittedPending.length > 0 && (
            <button
              type="button"
              onClick={() => setApprovalTab(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/60 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100"
            >
              Godkjenninger ({submittedPending.length})
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-[var(--hiver-text-muted)] mb-4">
        Registrer arbeidstimer og fravær (syk, sykt barn, permisjon, velferdspermisjon). Send inn for godkjenning.
      </p>

      {/* Summary: timer denne uken / denne måneden */}
      <div className="flex flex-wrap items-center gap-6 mb-6 p-4 rounded-xl bg-[var(--hiver-panel-bg)] border border-[var(--hiver-border)]">
        <div>
          <span className="text-sm text-[var(--hiver-text-muted)]">Denne uken</span>
          <p className="text-xl font-semibold text-[var(--hiver-text)]">{formatHours(hoursThisWeek)} t</p>
        </div>
        <div>
          <span className="text-sm text-[var(--hiver-text-muted)]">Denne måneden</span>
          <p className="text-xl font-semibold text-[var(--hiver-text)]">{formatHours(hoursThisMonth)} t</p>
        </div>
        {isAdmin(role) && (
          <Link
            to="/settings?tab=time_registration"
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
          >
            <Settings className="w-4 h-4" />
            Innstillinger for timeregistrering
          </Link>
        )}
      </div>

      {/* Tabs: Liste | Uke | Måned */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--hiver-bg)] border border-[var(--hiver-border)] w-fit mb-6">
        <button
          type="button"
          onClick={() => { setApprovalTab(false); setView('list'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            view === 'list' ? 'bg-[var(--hiver-panel-bg)] text-[var(--hiver-accent)] shadow-sm' : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
          }`}
        >
          <List className="w-4 h-4" />
          Liste
        </button>
        <button
          type="button"
          onClick={() => { setApprovalTab(false); setView('week'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            view === 'week' ? 'bg-[var(--hiver-panel-bg)] text-[var(--hiver-accent)] shadow-sm' : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Uke
        </button>
        <button
          type="button"
          onClick={() => { setApprovalTab(false); setView('month'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            view === 'month' ? 'bg-[var(--hiver-panel-bg)] text-[var(--hiver-accent)] shadow-sm' : 'text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)]'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Måned
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--hiver-text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : approvalTab && isApprover ? (
        /* Godkjenninger */
        <div className="card-panel p-6">
          <h2 className="text-lg font-semibold text-[var(--hiver-text)] mb-4">Venter på godkjenning</h2>
          {submittedPending.length === 0 ? (
            <p className="text-sm text-[var(--hiver-text-muted)]">Ingen registreringer venter på godkjenning.</p>
          ) : (
            <ul className="space-y-3">
              {submittedPending.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg border border-[var(--hiver-border)] bg-[var(--hiver-bg)]"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--hiver-text)]">
                      {getMemberName(entry.team_member_id)} – {entry.entry_date}
                    </p>
                    <p className="text-sm text-[var(--hiver-text-muted)]">
                      {entry.entry_type === 'work' ? (
                        <>
                          <Briefcase className="w-3.5 h-3.5 inline mr-1" />
                          {getWorkTypeName(entry.work_type_id)}
                          {entry.project_id && ` · ${getProjectName(entry.project_id)}`}
                        </>
                      ) : (
                        <>
                          <UserX className="w-3.5 h-3.5 inline mr-1" />
                          {getAbsenceLabel(entry.absence_type_id)}
                        </>
                      )}
                      {' · '}
                      {formatHours(entry.hours)} t
                    </p>
                    {entry.description && (
                      <p className="text-xs text-[var(--hiver-text-muted)] mt-1">{entry.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApprove(entry)}
                      disabled={approvalActionLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {approvalActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Godkjenn
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectModal(entry);
                        setRejectComment('');
                      }}
                      disabled={approvalActionLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-600 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Ban className="w-4 h-4" />
                      Avvis
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : view === 'week' ? (
        /* Ukevisning med tidsluker */
        <div className="card-panel p-5 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 min-w-[700px]">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="p-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="p-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]">
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium text-[var(--hiver-text)]">
                {format(weekStart, 'd. MMM', { locale: nb })} – {format(addDays(weekStart, 6), 'd. MMM yyyy', { locale: nb })}
              </span>
            </div>
            {draftInWeek.length > 0 && (
              <button
                type="button"
                onClick={() => handleSubmitMany(draftInWeek)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-accent)] bg-[var(--hiver-accent-light)] text-[var(--hiver-accent)] text-sm font-medium hover:bg-[var(--hiver-accent)] hover:text-white"
              >
                <Send className="w-4 h-4" />
                Send inn alle for uken ({draftInWeek.length})
              </button>
            )}
          </div>
          <div className="relative min-w-[700px]">
            <div ref={weekGridRef} className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
              <div className="border-b border-r border-[var(--hiver-border)] p-1.5 bg-[var(--hiver-bg)]" style={{ minHeight: WEEK_GRID_HEADER_HEIGHT }} />
              {weekDates.map((d) => (
                <div
                  key={d.toISOString()}
                  className={`border-b border-r border-[var(--hiver-border)] p-1.5 text-center text-xs font-medium last:border-r-0 ${
                    isSameDay(d, new Date()) ? 'bg-[var(--hiver-accent-light)] text-[var(--hiver-accent)]' : 'bg-[var(--hiver-bg)] text-[var(--hiver-text)]'
                  }`}
                  style={{ minHeight: WEEK_GRID_HEADER_HEIGHT }}
                >
                  {DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]} {format(d, 'd')}
                </div>
              ))}
              {Array.from({ length: (WEEK_LAST_HOUR - WEEK_FIRST_HOUR) * SEGMENTS_PER_HOUR }, (_, segIndex) => {
                const totalMins = segIndex * (60 / SEGMENTS_PER_HOUR);
                const hour = WEEK_FIRST_HOUR + Math.floor(totalMins / 60);
                const min = totalMins % 60;
                const timeLabel = `${hour.toString().padStart(2, '0')}:${min === 0 ? '00' : '30'}`;
                return (
                  <div key={segIndex} className="contents">
                    <div className="border-b border-r border-[var(--hiver-border)] py-0.5 px-1 text-[10px] text-[var(--hiver-text-muted)] bg-[var(--hiver-panel-bg)] pointer-events-none select-none" style={{ minHeight: WEEK_SEGMENT_HEIGHT }}>
                      {timeLabel}
                    </div>
                    {weekDates.map((d, dayIndex) => {
                      const dateStr = format(d, 'yyyy-MM-dd');
                      const dayEntries = displayEntries.filter((e) => e.entry_date === dateStr);
                      const segStartMins = (hour - WEEK_FIRST_HOUR) * 60 + min;
                      const segEndMins = segStartMins + 30;
                      const blockInThisSeg = dayEntries.find((e) => {
                        const startMins = getEntryStartMinutes(e);
                        const endMins = startMins + e.hours * 60;
                        return startMins < segEndMins && endMins > segStartMins;
                      });
                      const isEmpty = !blockInThisSeg;
                      const isInSelection =
                        weekSelection &&
                        weekSelection.dayIndex === dayIndex &&
                        segIndex >= weekSelection.segStart &&
                        segIndex <= weekSelection.segEnd;
                      return (
                        <div
                          key={d.toISOString()}
                          className={`relative border-b border-r border-[var(--hiver-border)] last:border-r-0 ${isEmpty ? 'cursor-crosshair' : ''}`}
                          style={{ minHeight: WEEK_SEGMENT_HEIGHT }}
                          onMouseDown={() => handleWeekCellMouseDown(dayIndex, segIndex, !!blockInThisSeg)}
                          onMouseEnter={() => handleWeekCellMouseEnter(dayIndex, segIndex)}
                        >
                          {isInSelection && (
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
                );
              })}
            </div>
            {/* Entry blocks overlay: start at start_time, span by hours (like Planning) */}
            <div
              className="absolute pointer-events-none z-10"
              style={{
                top: WEEK_GRID_HEADER_HEIGHT,
                left: 56,
                right: 0,
                bottom: 0,
              }}
            >
              {displayEntries
                .filter((e) => weekDateStrs.includes(e.entry_date))
                .map((entry) => {
                  const block = entryToWeekBlock(entry);
                  if (!block) return null;
                  return (
                    <div
                      key={entry.id}
                      className="absolute rounded-md overflow-hidden flex flex-col font-medium text-xs shadow-sm pointer-events-auto cursor-pointer border border-[var(--hiver-border)] hover:shadow-md"
                      style={{
                        left: `${(block.dayIndex / 7) * 100}%`,
                        width: `${100 / 7}%`,
                        top: block.segStart * WEEK_SEGMENT_HEIGHT + 2,
                        height: block.heightPx - 4,
                        backgroundColor: entry.entry_type === 'work' ? 'var(--hiver-accent-light)' : '#fef3c7',
                        color: entry.entry_type === 'work' ? 'var(--hiver-accent)' : '#92400e',
                        borderLeftWidth: 3,
                        borderLeftColor: entry.entry_type === 'work' ? 'var(--hiver-accent)' : '#f59e0b',
                      }}
                      title={`${isAdmin(role) && entry.team_member_id !== teamMemberId ? getMemberName(entry.team_member_id) + ' · ' : ''}${entry.entry_type === 'work' ? getWorkTypeName(entry.work_type_id) : getAbsenceLabel(entry.absence_type_id)} ${formatHours(entry.hours)} t`}
                      onClick={(ev) => { ev.stopPropagation(); if (entry.team_member_id === teamMemberId) openEdit(entry); }}
                      onMouseDown={(ev) => ev.stopPropagation()}
                    >
                      <div className="p-1.5 flex-1 flex items-start justify-between gap-1 min-h-0 overflow-hidden">
                        <span className="truncate">
                          {isAdmin(role) && entry.team_member_id !== teamMemberId && <span className="opacity-80">{getMemberName(entry.team_member_id)} · </span>}
                          {entry.entry_type === 'work' ? getWorkTypeName(entry.work_type_id) : getAbsenceLabel(entry.absence_type_id)} {formatHours(entry.hours)} t
                        </span>
                        {entry.team_member_id === teamMemberId && entry.status === 'draft' && (
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); handleSubmit(entry); }}
                            className="shrink-0 p-0.5 rounded hover:bg-black/10"
                            title="Send til godkjenning"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      ) : view === 'month' ? (
        /* Månedsvisning */
        <div className="card-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMonthStart(subMonths(monthStart, 1))} className="p-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => setMonthStart(addMonths(monthStart, 1))} className="p-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]">
                <ChevronRight className="w-5 h-5" />
              </button>
              <span className="text-lg font-semibold text-[var(--hiver-text)]">
                {format(monthStart, 'MMMM yyyy', { locale: nb })}
              </span>
            </div>
            {draftInMonth.length > 0 && (
              <button
                type="button"
                onClick={() => handleSubmitMany(draftInMonth)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-accent)] bg-[var(--hiver-accent-light)] text-[var(--hiver-accent)] text-sm font-medium hover:bg-[var(--hiver-accent)] hover:text-white"
              >
                <Send className="w-4 h-4" />
                Send inn alle for måneden ({draftInMonth.length})
              </button>
            )}
          </div>
          <div className="grid grid-cols-7 gap-px bg-[var(--hiver-border)] rounded-lg overflow-hidden">
            {DAYS.map((day) => (
              <div key={day} className="bg-[var(--hiver-bg)] p-2 text-center text-xs font-medium text-[var(--hiver-text-muted)]">
                {day}
              </div>
            ))}
            {(() => {
              const start = startOfMonth(monthStart);
              const end = endOfMonth(monthStart);
              const startPad = (start.getDay() + 6) % 7;
              const daysInMonth = end.getDate();
              const cells = startPad + daysInMonth;
              const rows = Math.ceil(cells / 7);
              const totalCells = rows * 7;
              const result: React.ReactNode[] = [];
              for (let i = 0; i < totalCells; i++) {
                if (i < startPad) {
                  result.push(<div key={`pad-${i}`} className="min-h-[100px] bg-[var(--hiver-bg)] p-2" />);
                  continue;
                }
                const dayNum = i - startPad + 1;
                if (dayNum > daysInMonth) {
                  result.push(<div key={`pad-end-${i}`} className="min-h-[100px] bg-[var(--hiver-bg)] p-2" />);
                  continue;
                }
                const d = addDays(start, dayNum - 1);
                const dateStr = format(d, 'yyyy-MM-dd');
                const dayEntries = displayEntries.filter((e) => e.entry_date === dateStr);
                const dayHours = dayEntries.reduce((s, e) => s + e.hours, 0);
                const isToday = isSameDay(d, new Date());
                result.push(
                  <div
                    key={dateStr}
                    className={`min-h-[100px] p-2 flex flex-col rounded-sm ${
                      isToday ? 'bg-[var(--hiver-accent-light)] border border-[var(--hiver-accent)]' : 'bg-[var(--hiver-panel-bg)]'
                    } ${!isSameMonth(d, monthStart) ? 'opacity-50' : ''}`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm font-medium ${isToday ? 'text-[var(--hiver-accent)]' : 'text-[var(--hiver-text)]'}`}>{dayNum}</span>
                      <button
                        type="button"
                        onClick={() => openAdd(dateStr)}
                        className="p-1 rounded text-[var(--hiver-accent)] hover:bg-[var(--hiver-accent)]/15 text-xs"
                        title="Legg til"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 space-y-0.5 overflow-auto">
                      {dayEntries.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          className="text-[10px] py-0.5 px-1.5 rounded bg-[var(--hiver-bg)] truncate cursor-pointer hover:bg-[var(--hiver-accent)]/15 flex items-center justify-between gap-1 group"
                          onClick={() => e.team_member_id === teamMemberId && openEdit(e)}
                          title={`${isAdmin(role) && e.team_member_id !== teamMemberId ? getMemberName(e.team_member_id) + ' · ' : ''}${e.entry_type === 'work' ? getWorkTypeName(e.work_type_id) : getAbsenceLabel(e.absence_type_id)} ${formatHours(e.hours)} t`}
                        >
                          <span className="truncate min-w-0">
                            {isAdmin(role) && e.team_member_id !== teamMemberId && <span className="opacity-70">{getMemberName(e.team_member_id)} · </span>}
                            {e.entry_type === 'work' ? getWorkTypeName(e.work_type_id) : getAbsenceLabel(e.absence_type_id)} {formatHours(e.hours)} t
                          </span>
                          {e.team_member_id === teamMemberId && e.status === 'draft' && (
                            <button
                              type="button"
                              onClick={(ev) => { ev.stopPropagation(); handleSubmit(e); }}
                              className="shrink-0 p-0.5 rounded hover:bg-[var(--hiver-accent)]/20"
                              title="Send til godkjenning"
                            >
                              <Send className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      {dayEntries.length > 3 && <span className="text-[10px] text-[var(--hiver-text-muted)]">+{dayEntries.length - 3}</span>}
                    </div>
                    {dayHours > 0 && (
                      <p className="text-[10px] font-medium text-[var(--hiver-text-muted)] mt-1">{formatHours(dayHours)} t</p>
                    )}
                  </div>
                );
              }
              return result;
            })()}
          </div>
        </div>
      ) : (
        /* Listevisning */
        <div className="card-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--hiver-border)] bg-[var(--hiver-bg)]">
                  {isAdmin(role) && <th className="text-left p-3 font-medium text-[var(--hiver-text)]">Bruker</th>}
                  <th className="text-left p-3 font-medium text-[var(--hiver-text)]">Dato</th>
                  <th className="text-left p-3 font-medium text-[var(--hiver-text)]">Type</th>
                  <th className="text-left p-3 font-medium text-[var(--hiver-text)]">Beskrivelse</th>
                  <th className="text-right p-3 font-medium text-[var(--hiver-text)]">Timer</th>
                  <th className="text-left p-3 font-medium text-[var(--hiver-text)]">Status</th>
                  <th className="p-3 w-24 text-right font-medium text-[var(--hiver-text)]">Handlinger</th>
                </tr>
              </thead>
              <tbody>
                {displayEntries.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin(role) ? 7 : 6} className="p-6 text-center text-[var(--hiver-text-muted)]">
                      Ingen timeregistreringer. Klikk «Ny registrering» for å legge til.
                    </td>
                  </tr>
                ) : (
                  [...displayEntries]
                    .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
                    .map((entry) => (
                      <tr key={entry.id} className="border-b border-[var(--hiver-border)] hover:bg-[var(--hiver-bg)]/50">
                        {isAdmin(role) && <td className="p-3 text-[var(--hiver-text-muted)]">{getMemberName(entry.team_member_id)}</td>}
                        <td className="p-3 text-[var(--hiver-text)]">{entry.entry_date}</td>
                        <td className="p-3">
                          {entry.entry_type === 'work' ? (
                            <span>
                              {getWorkTypeName(entry.work_type_id)}
                              {entry.project_id && ` · ${getProjectName(entry.project_id)}`}
                            </span>
                          ) : (
                            getAbsenceLabel(entry.absence_type_id)
                          )}
                        </td>
                        <td className="p-3 text-[var(--hiver-text-muted)] max-w-[200px] truncate">
                          {entry.description || '—'}
                        </td>
                        <td className="p-3 text-right font-medium">{formatHours(entry.hours)}</td>
                        <td className="p-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              entry.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : entry.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : entry.status === 'submitted'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)]'
                            }`}
                          >
                            {statusLabel[entry.status]}
                          </span>
                          {entry.rejection_comment && (
                            <p className="text-xs text-red-600 mt-0.5">{entry.rejection_comment}</p>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {entry.team_member_id === teamMemberId && entry.status === 'draft' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSubmit(entry)}
                                className="p-1.5 rounded text-[var(--hiver-accent)] hover:bg-[var(--hiver-accent)]/15"
                                title="Send til godkjenning"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(entry)}
                                className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                                title="Rediger"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(entry)}
                                className="p-1.5 rounded text-red-600 hover:bg-red-50"
                                title="Slett"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {entry.team_member_id === teamMemberId && entry.status === 'submitted' && (
                            <button
                              type="button"
                              onClick={() => openEdit(entry)}
                              className="p-1.5 rounded text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                              title="Rediger (trekke tilbake)"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Legg til / Rediger */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={closeModal}
          onKeyDown={(e) => e.key === 'Escape' && closeModal()}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl card-panel shadow-[var(--hiver-shadow-md)] p-6"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && closeModal()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--hiver-text)]">
                {editingEntry ? 'Rediger timeregistrering' : 'Ny timeregistrering'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)]"
                aria-label="Lukk"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Dato</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] bg-[var(--hiver-panel-bg)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="entryType"
                      checked={formType === 'work'}
                      onChange={() => setFormType('work')}
                      className="text-[var(--hiver-accent)]"
                    />
                    <span className="text-sm">Arbeid</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="entryType"
                      checked={formType === 'absence'}
                      onChange={() => setFormType('absence')}
                      className="text-[var(--hiver-accent)]"
                    />
                    <span className="text-sm">Fravær</span>
                  </label>
                </div>
              </div>
              {formType === 'work' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Arbeidstype</label>
                    <Select
                      value={formWorkTypeId}
                      onChange={setFormWorkTypeId}
                      options={workTypes.map((w) => ({ value: w.id, label: w.name }))}
                      placeholder="Velg type"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Prosjekt (valgfritt)</label>
                    <Select
                      value={formProjectId}
                      onChange={setFormProjectId}
                      options={projects.map((p) => ({ value: p.id, label: p.name }))}
                      placeholder="—"
                      className="w-full"
                    />
                  </div>
                </>
              )}
              {formType === 'absence' && (
                <div>
                  <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Fraværstype</label>
                  <Select
                    value={formAbsenceTypeId}
                    onChange={setFormAbsenceTypeId}
                    options={absenceTypes.map((a) => ({ value: a.id, label: a.label }))}
                    placeholder="Velg type"
                    className="w-full"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Starttid</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormStartTime(v);
                      if (formEndTime) {
                        const startM = timeToMinutes(v);
                        const endM = timeToMinutes(formEndTime);
                        if (endM > startM) {
                          const dur = endM - startM;
                          setFormHoursInt(Math.floor(dur / 60));
                          setFormMinutesInt(dur % 60);
                        }
                      } else if (formHoursInt > 0 || formMinutesInt > 0) {
                        setFormEndTime(minutesToTime(timeToMinutes(v) + formHoursInt * 60 + formMinutesInt));
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] bg-[var(--hiver-panel-bg)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Sluttid</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormEndTime(v);
                      if (formStartTime) {
                        const startM = timeToMinutes(formStartTime);
                        const endM = timeToMinutes(v);
                        if (endM > startM) {
                          const dur = endM - startM;
                          setFormHoursInt(Math.floor(dur / 60));
                          setFormMinutesInt(dur % 60);
                        }
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] bg-[var(--hiver-panel-bg)]"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Timer</label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={1}
                    value={formHoursInt}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      const v = raw === '' ? 0 : Math.min(24, parseInt(raw, 10) || 0);
                      setFormHoursInt(v);
                      if (formStartTime) setFormEndTime(minutesToTime(timeToMinutes(formStartTime) + v * 60 + formMinutesInt));
                    }}
                    placeholder="0"
                    className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] bg-[var(--hiver-panel-bg)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Minutter</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    step={1}
                    value={formMinutesInt}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      const v = raw === '' ? 0 : Math.min(59, parseInt(raw, 10) || 0);
                      setFormMinutesInt(v);
                      if (formStartTime) setFormEndTime(minutesToTime(timeToMinutes(formStartTime) + formHoursInt * 60 + v));
                    }}
                    placeholder="0"
                    className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] bg-[var(--hiver-panel-bg)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--hiver-text)] mb-1">Kommentar (valgfritt)</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] bg-[var(--hiver-panel-bg)]"
                  placeholder="Kort beskrivelse"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--hiver-accent)] text-sm font-medium text-white hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {editingEntry ? 'Lagre' : 'Legg til'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Avvis med kommentar */}
      {rejectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !approvalActionLoading && closeModal()}
          onKeyDown={(e) => e.key === 'Escape' && !approvalActionLoading && closeModal()}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl card-panel shadow-[var(--hiver-shadow-md)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[var(--hiver-text)] mb-2">Avvis timeregistrering</h2>
            <p className="text-sm text-[var(--hiver-text-muted)] mb-4">
              Valgfri begrunnelse som vises til brukeren:
            </p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm mb-4"
              placeholder="F.eks. Mangler prosjektkode"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={approvalActionLoading}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--hiver-border)] text-sm font-medium hover:bg-[var(--hiver-bg)]"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={approvalActionLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {approvalActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Avvis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
