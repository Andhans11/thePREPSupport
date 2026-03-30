import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addWeeks, format, isSameDay, startOfWeek, subWeeks } from 'date-fns';
import { nb } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useCurrentUserRole } from '../hooks/useCurrentUserRole';
import { isAdmin, isManager } from '../types/roles';
import { useGoogleCalendar } from '../contexts/GoogleCalendarContext';
import { useUnifiedSync } from '../hooks/useUnifiedSync';
import { useToast } from '../contexts/ToastContext';
import { formatDateTime } from '../utils/formatters';
import { GoogleCalendarEventModal, type GoogleCalendarEventModalData } from '../components/calendar/GoogleCalendarEventModal';
import { setCalendarEventOwner } from '../services/calendarEventOwner';
import { setCalendarEventHiddenFromApp } from '../services/calendarEventVisibility';

interface CalendarEventRow {
  id: string;
  google_event_id: string;
  summary: string | null;
  description: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  status: string | null;
  owner_team_member_id: string | null;
  raw_json: Record<string, unknown> | null;
  hidden_from_app?: boolean;
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hiver-accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-[var(--hiver-accent)]' : 'bg-[var(--hiver-border)]'
      }`}
      aria-label={label}
    >
      <span
        className={`pointer-events-none absolute top-1/2 inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 -translate-y-1/2 ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

interface TimeEntryRow {
  id: string;
  team_member_id: string;
  entry_date: string;
  entry_type: 'work' | 'absence';
  hours: number;
  start_time: string | null;
  description: string | null;
}

interface TeamMemberRow {
  id: string;
  name: string | null;
  email: string | null;
}

export function CalendarPage() {
  const { currentTenantId } = useTenant();
  const { role, teamMemberId } = useCurrentUserRole();
  const canManageGoogleCalendarUi = isAdmin(role) || isManager(role);
  const { connection: calendarConnection } = useGoogleCalendar();
  const toast = useToast();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventRow[]>([]);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<GoogleCalendarEventModalData | null>(null);
  const [showHiddenEvents, setShowHiddenEvents] = useState(false);

  const loadWeekData = useCallback(async () => {
    if (!currentTenantId) {
      setEntries([]);
      setMembers([]);
      setCalendarEvents([]);
      setEntriesLoading(false);
      return;
    }
    setEntriesLoading(true);
    const weekDatesLocal = Array.from({ length: 7 }, (_, i) =>
      format(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i), 'yyyy-MM-dd')
    );
    const weekEnd = weekDatesLocal[6];
    const [entriesRes, membersRes, calendarRes] = await Promise.all([
      supabase
        .from('time_entries')
        .select('id, team_member_id, entry_date, entry_type, hours, start_time, description')
        .eq('tenant_id', currentTenantId)
        .gte('entry_date', weekDatesLocal[0])
        .lte('entry_date', weekEnd)
        .order('entry_date', { ascending: true }),
      supabase
        .from('team_members')
        .select('id, name, email')
        .eq('tenant_id', currentTenantId)
        .eq('is_active', true),
      supabase
        .from('google_calendar_events')
        .select('id, google_event_id, summary, description, start_at, end_at, is_all_day, status, owner_team_member_id, raw_json, hidden_from_app')
        .eq('tenant_id', currentTenantId)
        .gte('start_at', `${weekDatesLocal[0]}T00:00:00.000Z`)
        .lte('start_at', `${weekEnd}T23:59:59.999Z`)
        .order('start_at', { ascending: true }),
    ]);
    setEntries((entriesRes.data as TimeEntryRow[]) ?? []);
    setMembers((membersRes.data as TeamMemberRow[]) ?? []);
    setCalendarEvents((calendarRes.data as CalendarEventRow[]) ?? []);
    setEntriesLoading(false);
  }, [currentTenantId, weekStart]);

  useEffect(() => {
    void loadWeekData();
  }, [loadWeekData]);

  const { syncAll, combinedSyncing } = useUnifiedSync(() => {
    void loadWeekData();
  });

  const handleManualCalendarSync = async () => {
    const result = await syncAll();
    if (!result.success) {
      toast.error(result.error || 'Kunne ikke synkronisere.');
      return;
    }
    if (result.created != null && result.created > 0) {
      toast.success(`${result.created} nye saker. E-post og kalender er oppdatert.`);
    } else {
      toast.success('Synkronisert.');
    }
  };

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
    [weekStart]
  );

  /** Visible time window (08:00–16:00). */
  const WEEK_FIRST_HOUR = 8;
  const WEEK_LAST_HOUR = 16;
  const SEGMENTS_PER_HOUR = 2;
  const SEGMENT_HEIGHT = 28;
  const WEEK_HEADER_HEIGHT = 40;
  const DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

  const getMemberLabel = (teamMemberId: string) => {
    const member = members.find((m) => m.id === teamMemberId);
    if (!member) return 'Ukjent bruker';
    return member.name?.trim() || member.email?.trim() || 'Ukjent bruker';
  };

  const getEntryStartMinutes = (entry: TimeEntryRow): number => {
    if (entry.start_time) {
      const parts = entry.start_time.split(':').map(Number);
      const h = parts[0] ?? 8;
      const m = parts[1] ?? 0;
      return h * 60 + m;
    }
    return 8 * 60;
  };

  const entryToWeekBlock = (entry: TimeEntryRow): { dayIndex: number; segStart: number; heightPx: number } | null => {
    const dayIndex = weekDates.findIndex((d) => format(d, 'yyyy-MM-dd') === entry.entry_date);
    if (dayIndex < 0) return null;
    const gridStartMins = WEEK_FIRST_HOUR * 60;
    const gridEndMins = WEEK_LAST_HOUR * 60;
    const startMins = getEntryStartMinutes(entry);
    const endMins = startMins + entry.hours * 60;
    const clipStart = Math.max(startMins, gridStartMins);
    const clipEnd = Math.min(endMins, gridEndMins);
    if (clipEnd <= clipStart) return null;
    const segmentCount = (WEEK_LAST_HOUR - WEEK_FIRST_HOUR) * SEGMENTS_PER_HOUR;
    const segStart = Math.floor((clipStart - gridStartMins) / (60 / SEGMENTS_PER_HOUR));
    if (segStart < 0 || segStart >= segmentCount) return null;
    const durationMins = clipEnd - clipStart;
    const segmentsSpan = Math.min(segmentCount - segStart, Math.max(1, Math.ceil(durationMins / 30)));
    return { dayIndex, segStart, heightPx: segmentsSpan * SEGMENT_HEIGHT };
  };

  const eventToWeekBlock = (event: CalendarEventRow): { dayIndex: number; segStart: number; heightPx: number } | null => {
    const start = new Date(event.start_at);
    const dayIndex = weekDates.findIndex((d) => format(d, 'yyyy-MM-dd') === format(start, 'yyyy-MM-dd'));
    if (dayIndex < 0) return null;
    if (event.is_all_day) {
      return { dayIndex, segStart: 0, heightPx: SEGMENT_HEIGHT };
    }
    const gridStartMins = WEEK_FIRST_HOUR * 60;
    const gridEndMins = WEEK_LAST_HOUR * 60;
    const startMins = start.getHours() * 60 + start.getMinutes();
    const end = new Date(event.end_at);
    const endMins = end.getHours() * 60 + end.getMinutes();
    const clipStart = Math.max(startMins, gridStartMins);
    const clipEnd = Math.min(Math.max(endMins, startMins + 30), gridEndMins);
    if (clipEnd <= clipStart) return null;
    const segmentCount = (WEEK_LAST_HOUR - WEEK_FIRST_HOUR) * SEGMENTS_PER_HOUR;
    const segStart = Math.floor((clipStart - gridStartMins) / (60 / SEGMENTS_PER_HOUR));
    if (segStart < 0 || segStart >= segmentCount) return null;
    const durationMins = clipEnd - clipStart;
    const segmentsSpan = Math.min(segmentCount - segStart, Math.max(1, Math.ceil(durationMins / 30)));
    return { dayIndex, segStart, heightPx: segmentsSpan * SEGMENT_HEIGHT };
  };

  const memberOptions = members.map((m) => ({
    id: m.id,
    name: m.name?.trim() || m.email?.trim() || 'Ukjent bruker',
  }));

  const eventsForWeekGrid = useMemo(
    () =>
      showHiddenEvents ? calendarEvents : calendarEvents.filter((e) => !e.hidden_from_app),
    [calendarEvents, showHiddenEvents]
  );

  const handleCalendarHiddenChange = async (hidden: boolean): Promise<{ ok: boolean; error?: string }> => {
    if (!currentTenantId || !selectedEvent) return { ok: false, error: 'Ingen hendelse valgt.' };
    const eventId = selectedEvent.id;
    const result = await setCalendarEventHiddenFromApp({
      tenantId: currentTenantId,
      eventId,
      hidden,
    });
    if (!result.ok) return result;
    setCalendarEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, hidden_from_app: hidden } : e))
    );
    if (hidden && !showHiddenEvents) {
      setSelectedEvent(null);
    } else {
      setSelectedEvent((prev) => (prev && prev.id === eventId ? { ...prev, hidden_from_app: hidden } : prev));
    }
    toast.success(
      hidden ? 'Hendelsen skjules på dashbord og kalender.' : 'Hendelsen vises igjen på dashbord og kalender.'
    );
    return { ok: true };
  };

  const assignEventOwner = async (
    eventId: string,
    ownerTeamMemberId: string | null,
    previousOwnerId: string | null
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentTenantId) return { ok: false, error: 'Ingen organisasjon valgt.' };
    const ev =
      calendarEvents.find((e) => e.id === eventId) ??
      (selectedEvent?.id === eventId ? selectedEvent : null);
    const result = await setCalendarEventOwner({
      tenantId: currentTenantId,
      eventId,
      ownerTeamMemberId,
      eventSummary: ev?.summary ?? null,
      previousOwnerId,
      notifyNewOwner: true,
    });
    if (!result.ok) return result;
    setCalendarEvents((prev) =>
      prev.map((event) => (event.id === eventId ? { ...event, owner_team_member_id: ownerTeamMemberId } : event))
    );
    setSelectedEvent((prev) => (prev && prev.id === eventId ? { ...prev, owner_team_member_id: ownerTeamMemberId } : prev));
    if (ownerTeamMemberId) {
      toast.success('Eier lagret. Ny eier har fått varsel.');
    } else {
      toast.success('Eier oppdatert.');
    }
    return { ok: true };
  };

  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      <div className="flex items-center gap-2">
        <Calendar className="w-6 h-6 text-[var(--hiver-accent)]" />
        <h1 className="text-2xl font-semibold text-[var(--hiver-text)]">Kalender</h1>
      </div>

      {!calendarConnection.connected && canManageGoogleCalendarUi && (
        <div className="card-panel p-5 border border-[var(--hiver-border)] rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--hiver-text)] flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Google Kalender
              </h3>
              <p className="text-sm text-[var(--hiver-text-muted)] mt-1">
                Egen registrering med Google-auth for kalendersynk.
              </p>
              <p className="text-xs text-[var(--hiver-text-muted)] mt-2">
                Status: Ikke tilkoblet
              </p>
            </div>
            <Link
              to="/settings/calendar/new"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--hiver-accent)] text-white text-sm font-medium hover:bg-[var(--hiver-accent-hover)]"
            >
              <Plus className="w-4 h-4" />
              Legg til kalender
            </Link>
          </div>
        </div>
      )}

      <div className="min-w-0 flex flex-col card-panel relative p-5 w-full">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--hiver-text)]">Ukesvisning av alle registreringer</h2>
            <p className="text-sm text-[var(--hiver-text-muted)]">
              {format(weekDates[0], 'MMMM yyyy', { locale: nb })} - uke {format(weekDates[0], 'w')}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {calendarConnection.connected && canManageGoogleCalendarUi && (
              <button
                type="button"
                onClick={() => void handleManualCalendarSync()}
                disabled={combinedSyncing}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] disabled:opacity-60"
                title="Samme som synk i toppfeltet: e-post og kalender (ca. hvert 15. min i bakgrunnen)"
              >
                <RefreshCw className={`w-4 h-4 ${combinedSyncing ? 'animate-spin' : ''}`} />
                {combinedSyncing ? 'Synkroniserer…' : 'Synkroniser'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setWeekStart(subWeeks(weekStart, 1))}
              className="p-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
              aria-label="Forrige uke"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              className="p-2 rounded-lg border border-[var(--hiver-border)] text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
              aria-label="Neste uke"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <p className="text-sm text-[var(--hiver-text-muted)]">
            {format(weekDates[0], 'd. MMM', { locale: nb })} – {format(weekDates[6], 'd. MMM yyyy', { locale: nb })}
            {calendarConnection.connected && calendarConnection.lastSyncAt ? (
              <span className="text-xs"> · Sist synk fra Google: {formatDateTime(calendarConnection.lastSyncAt)}</span>
            ) : null}
            {calendarConnection.connected && (
              <span className="text-xs block sm:inline sm:before:content-['·_'] sm:before:mx-1 mt-1 sm:mt-0">
                <span className="inline-flex items-center gap-1 mr-3">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" aria-hidden />
                  Din hendelse
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-400 dark:bg-zinc-500 shrink-0" aria-hidden />
                  Annen
                </span>
              </span>
            )}
          </p>
          {calendarConnection.connected && calendarEvents.some((e) => e.hidden_from_app) && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[var(--hiver-text-muted)]">Vis skjulte</span>
              <ToggleSwitch
                checked={showHiddenEvents}
                onChange={setShowHiddenEvents}
                label="Vis skjulte hendelser i kalender"
              />
            </div>
          )}
        </div>

        {entriesLoading ? (
          <div className="py-8 flex items-center justify-center text-[var(--hiver-text-muted)]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="relative min-w-[700px]">
            <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
              <div className="border-b border-r border-[var(--hiver-border)] p-1.5 bg-[var(--hiver-bg)]" style={{ minHeight: WEEK_HEADER_HEIGHT }} />
              {weekDates.map((d, dayIndex) => (
                <div
                  key={d.toISOString()}
                  className={`border-b border-r border-[var(--hiver-border)] p-1.5 text-center text-xs font-medium last:border-r-0 ${
                    isSameDay(d, new Date()) ? 'bg-[var(--hiver-accent-light)] text-[var(--hiver-accent)]' : 'bg-[var(--hiver-bg)] text-[var(--hiver-text)]'
                  }`}
                  style={{ minHeight: WEEK_HEADER_HEIGHT }}
                >
                  {DAYS[dayIndex]} {format(d, 'd')}
                  {(dayIndex === 5 || dayIndex === 6) && (
                    <div className="text-[10px] mt-0.5 text-[var(--hiver-text-muted)]">Ikke arbeidsdag</div>
                  )}
                </div>
              ))}
              {Array.from({ length: (WEEK_LAST_HOUR - WEEK_FIRST_HOUR) * SEGMENTS_PER_HOUR }, (_, segIndex) => {
                const totalMins = segIndex * (60 / SEGMENTS_PER_HOUR);
                const hour = WEEK_FIRST_HOUR + Math.floor(totalMins / 60);
                const min = totalMins % 60;
                const timeLabel = `${hour.toString().padStart(2, '0')}:${min === 0 ? '00' : '30'}`;
                return (
                  <div key={segIndex} className="contents">
                    <div
                      className="border-b border-r border-[var(--hiver-border)] py-0.5 px-1 text-[10px] text-[var(--hiver-text-muted)] bg-[var(--hiver-panel-bg)]"
                      style={{ minHeight: SEGMENT_HEIGHT }}
                    >
                      {timeLabel}
                    </div>
                    {weekDates.map((d) => (
                      <div
                        key={`${d.toISOString()}-${segIndex}`}
                        className="border-b border-r border-[var(--hiver-border)] last:border-r-0"
                        style={{ minHeight: SEGMENT_HEIGHT }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>

            <div
              className="absolute z-10"
              style={{ top: WEEK_HEADER_HEIGHT, left: 56, right: 0, bottom: 0 }}
            >
              {entries.map((entry) => {
                const block = entryToWeekBlock(entry);
                if (!block) return null;
                const isWork = entry.entry_type === 'work';
                return (
                  <div
                    key={entry.id}
                    className={`absolute rounded-md overflow-hidden flex flex-col text-xs shadow-sm border pointer-events-none ${
                      isWork ? 'border-[var(--hiver-accent)]/30' : 'border-amber-400/40'
                    }`}
                    style={{
                      left: `${(block.dayIndex / 7) * 100}%`,
                      width: `${100 / 7}%`,
                      top: block.segStart * SEGMENT_HEIGHT + 2,
                      height: block.heightPx - 4,
                      backgroundColor: isWork ? 'var(--hiver-accent-light)' : '#fef3c7',
                      color: isWork ? 'var(--hiver-accent)' : '#92400e',
                      borderLeftWidth: 3,
                      borderLeftColor: isWork ? 'var(--hiver-accent)' : '#f59e0b',
                    }}
                    title={`${getMemberLabel(entry.team_member_id)} - ${String(entry.hours).replace('.', ',')} t`}
                  >
                    <div className="p-1.5 flex-1 min-h-0 overflow-hidden">
                      <div className="truncate font-medium">{getMemberLabel(entry.team_member_id)}</div>
                      <div className="truncate">
                        {isWork ? 'Arbeid' : 'Fravær'} {String(entry.hours).replace('.', ',')} t
                      </div>
                      {entry.description ? <div className="truncate opacity-80">{entry.description}</div> : null}
                    </div>
                  </div>
                );
              })}
              {eventsForWeekGrid.map((event) => {
                const block = eventToWeekBlock(event);
                if (!block) return null;
                const isHidden = !!event.hidden_from_app;
                const isMine =
                  teamMemberId != null && event.owner_team_member_id != null && event.owner_team_member_id === teamMemberId;
                const ownerLabel = event.owner_team_member_id
                  ? getMemberLabel(event.owner_team_member_id)
                  : 'Ikke tildelt';
                const summaryLine = event.summary?.trim() || '(Uten tittel)';
                const hoverTitle = `${summaryLine} — Eier: ${ownerLabel}${isHidden ? ' (skjult i app)' : ''}`;

                const mineClasses = isHidden
                  ? 'border border-dashed border-emerald-600/45 bg-emerald-50/85 dark:bg-emerald-950/35 text-emerald-900 dark:text-emerald-100 border-l-emerald-600'
                  : 'border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/45 text-emerald-800 dark:text-emerald-200 border-l-emerald-500';
                const otherClasses = isHidden
                  ? 'border border-dashed border-zinc-400/70 bg-zinc-100 dark:bg-zinc-800/90 text-zinc-600 dark:text-zinc-300 border-l-zinc-400'
                  : 'border border-zinc-400/50 bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border-l-zinc-500';

                return (
                  <div
                    key={`gcal-${event.id}`}
                    className={`absolute rounded-md overflow-hidden flex flex-col text-xs shadow-sm pointer-events-auto cursor-pointer border-l-[3px] ${
                      isMine ? mineClasses : otherClasses
                    }`}
                    style={{
                      left: `${(block.dayIndex / 7) * 100}%`,
                      width: `${100 / 7}%`,
                      top: block.segStart * SEGMENT_HEIGHT + 2,
                      height: Math.max(18, block.heightPx - 4),
                    }}
                    title={hoverTitle}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="p-1.5 flex-1 min-h-0 overflow-hidden">
                      <div className="truncate font-medium">{event.summary || '(Uten tittel)'}</div>
                      <div className="truncate">
                        {isMine ? 'Din hendelse' : `Eier: ${ownerLabel}`}
                        {isHidden ? ' · Skjult' : ''}
                      </div>
                      {event.description ? <div className="truncate opacity-80">{event.description}</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <GoogleCalendarEventModal
        event={selectedEvent}
        memberOptions={memberOptions}
        onClose={() => setSelectedEvent(null)}
        onAssignOwner={assignEventOwner}
        onHiddenChange={canManageGoogleCalendarUi ? handleCalendarHiddenChange : undefined}
      />

    </div>
  );
}
