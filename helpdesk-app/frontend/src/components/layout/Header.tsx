import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUnifiedSync } from '../../hooks/useUnifiedSync';
import { useTickets } from '../../contexts/TicketContext';
import { useTenant } from '../../contexts/TenantContext';
import { useCurrentUserRole } from '../../hooks/useCurrentUserRole';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase } from '../../services/supabase';
import { formatDateTime } from '../../utils/formatters';
import { getNotificationIcon } from '../../utils/notificationIcons';
import { isAdmin, canAccessSettings } from '../../types/roles';
import { canAccessModule } from '../../types/modules';
import { useModules } from '../../contexts/ModulesContext';
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, type AvailabilityStatus } from '../../types/availability';
import {
  LogOut,
  Mail,
  Settings,
  Users,
  ChevronRight,
  Bell,
  Check,
  Moon,
  Minus,
  X,
  List,
  RefreshCw,
} from 'lucide-react';

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

function getInitials(email: string, fullName?: string | null): string {
  if (fullName && fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    return fullName.slice(0, 2).toUpperCase();
  }
  const local = email.split('@')[0] || '?';
  return local.slice(0, 2).toUpperCase();
}

function formatNotificationTime(created_at: string): string {
  const d = new Date(created_at);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Akkurat nå';
  if (diffMins < 60) return `For ${diffMins} min siden`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `For ${diffHours} t siden`;
  return d.toLocaleDateString();
}

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { currentTenantId } = useTenant();
  const [userOpen, setUserOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const { role, availableForEmail, setAvailableForEmail, availabilityStatus, setAvailabilityStatus, teamMemberId } = useCurrentUserRole();
  const { planningEnabled, roleAccess } = useModules();
  const showPlanningInMenu = canAccessModule('planning', planningEnabled, roleAccess.planning, role);
  const { fetchTickets } = useTickets();
  const { combinedLastSyncAt, lastSyncNewTicketsCount, syncAll, combinedSyncing, gmailConnected, calendarConnected } =
    useUnifiedSync(() => {
      fetchTickets();
    });
  const { items: notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications({ unreadOnly: true });
  const admin = isAdmin(role);
  const [notifPrefs, setNotifPrefs] = useState({
    notify_owner_assignment: true,
    notify_owner_activity: true,
    notify_team_activity: true,
    notify_team_changes: true,
  });
  const [prefsSaving, setPrefsSaving] = useState(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const statusIcons: Record<AvailabilityStatus, typeof Check> = {
    active: Check,
    away: Moon,
    busy: Minus,
    offline: X,
  };

  const availabilityStatusRef = useRef(availabilityStatus);
  availabilityStatusRef.current = availabilityStatus;

  const INACTIVITY_AWAY_MS = 10 * 60 * 1000;
  useEffect(() => {
    if (teamMemberId == null) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleAway = () => {
      timeoutId = setTimeout(() => {
        setAvailabilityStatus('away');
      }, INACTIVITY_AWAY_MS);
    };
    const onActivity = () => {
      clearTimeout(timeoutId);
      if (availabilityStatusRef.current === 'away') {
        setAvailabilityStatus('active');
      }
      scheduleAway();
    };
    if (availabilityStatus === 'active') scheduleAway();
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
    };
  }, [teamMemberId, availabilityStatus, setAvailabilityStatus]);

  const initials = user?.email ? getInitials(user.email, user.user_metadata?.full_name) : '?';
  const displayName = user?.user_metadata?.full_name || user?.email;

  useEffect(() => {
    const loadPrefs = async () => {
      if (!user?.id || !currentTenantId || !userOpen) return;
      const { data } = await supabase
        .from('team_members')
        .select('notify_owner_assignment, notify_owner_activity, notify_team_activity, notify_team_changes')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      const row = (data as {
        notify_owner_assignment?: boolean;
        notify_owner_activity?: boolean;
        notify_team_activity?: boolean;
        notify_team_changes?: boolean;
      } | null) ?? null;
      if (row) {
        setNotifPrefs({
          notify_owner_assignment: row.notify_owner_assignment !== false,
          notify_owner_activity: row.notify_owner_activity !== false,
          notify_team_activity: row.notify_team_activity !== false,
          notify_team_changes: row.notify_team_changes !== false,
        });
      }
    };
    loadPrefs();
  }, [user?.id, currentTenantId, userOpen]);

  const savePref = async (
    key: 'notify_owner_assignment' | 'notify_owner_activity' | 'notify_team_activity' | 'notify_team_changes',
    value: boolean
  ) => {
    if (!user?.id || !currentTenantId) return;
    setPrefsSaving(true);
    setNotifPrefs((prev) => ({ ...prev, [key]: value }));
    await supabase
      .from('team_members')
      .update({ [key]: value })
      .eq('tenant_id', currentTenantId)
      .eq('user_id', user.id);
    setPrefsSaving(false);
  };

  return (
    <header className="h-14 border-b border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] flex items-center justify-between gap-4 px-4 shrink-0">
      <button
        type="button"
        onClick={async () => {
          await syncAll();
        }}
        disabled={combinedSyncing || (!gmailConnected && !calendarConnected)}
        className="flex items-center gap-2 min-w-0 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--hiver-bg)] transition-colors disabled:opacity-70 disabled:cursor-wait"
        title="Synkroniser e-post og kalender (samme som bakgrunnssynk ca. hvert 15. min)"
      >
        <RefreshCw className={`w-4 h-4 text-[var(--hiver-text-muted)] shrink-0 ${combinedSyncing ? 'animate-spin' : ''}`} aria-hidden />
        <span className="text-xs text-[var(--hiver-text-muted)] truncate" title={combinedLastSyncAt ? formatDateTime(combinedLastSyncAt) : undefined}>
          {combinedSyncing
            ? 'Synkroniserer…'
            : combinedLastSyncAt
              ? `Sist synkronisert: ${formatDateTime(combinedLastSyncAt)}${
                  gmailConnected && lastSyncNewTicketsCount != null
                    ? ` · ${lastSyncNewTicketsCount} nye sak${lastSyncNewTicketsCount === 1 ? '' : 'er'}`
                    : ''
                }`
              : 'Ingen sync ennå'}
        </span>
      </button>
      <div className="flex items-center gap-2 shrink-0">
      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          className="relative p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
          aria-label="Varsler"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--hiver-accent)] text-white text-xs font-medium flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-full mt-1 w-80 max-h-[24rem] overflow-hidden card-panel shadow-[var(--hiver-shadow-md)] z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--hiver-border)]">
              <span className="text-sm font-semibold text-[var(--hiver-text)]">Varsler</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-xs font-medium text-[var(--hiver-accent)] hover:underline"
                >
                  Merk alle som lest
                </button>
              )}
            </div>
            <div className="overflow-y-auto max-h-64">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-sm text-[var(--hiver-text-muted)]">
                  {unreadCount > 0 ? 'Ingen uleste varsler.' : 'Ingen varsler ennå.'}
                </div>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.read_at) markAsRead(n.id);
                          if (n.link) navigate(n.link);
                          setNotifOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-[var(--hiver-bg)] border-b border-[var(--hiver-border)] last:border-0 flex gap-3 ${
                          !n.read_at ? 'bg-[var(--hiver-accent-light)]/30' : ''
                        }`}
                      >
                        <span className="relative shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)]">
                          {(() => {
                            const Icon = getNotificationIcon(n);
                            return <Icon className="w-4 h-4" />;
                          })()}
                          {!n.read_at && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--hiver-accent)] border-2 border-[var(--hiver-panel-bg)]" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--hiver-text)]">{n.title}</p>
                          {n.body && (
                            <p className="text-xs text-[var(--hiver-text-muted)] mt-0.5 line-clamp-2">
                              {n.body}
                            </p>
                          )}
                          <p className="text-xs text-[var(--hiver-text-muted)] mt-1">
                            {formatNotificationTime(n.created_at)}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="shrink-0 border-t border-[var(--hiver-border)] p-2">
              <Link
                to="/notifications"
                onClick={() => setNotifOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium text-[var(--hiver-accent)] hover:bg-[var(--hiver-bg)]"
              >
                <List className="w-4 h-4" />
                Se alle varsler
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Status (next to avatar) + User menu – always visible when logged in */}
      <div className="relative flex items-center gap-2" ref={userRef}>
        <div className="relative shrink-0" ref={statusRef}>
          {teamMemberId != null ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setStatusOpen((v) => !v);
                }}
                className="flex items-center gap-2 rounded-lg pl-1 pr-2.5 py-1 border border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] hover:bg-[var(--hiver-bg)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/50 focus:ring-offset-2 focus:ring-offset-[var(--hiver-panel-bg)]"
                title={AVAILABILITY_LABELS[availabilityStatus] + ' – klikk for å endre'}
                aria-label={`Status: ${AVAILABILITY_LABELS[availabilityStatus]}`}
                aria-expanded={statusOpen}
                aria-haspopup="true"
              >
                <span
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white shadow border-2 border-[var(--hiver-panel-bg)]"
                  style={{ backgroundColor: AVAILABILITY_COLORS[availabilityStatus] }}
                  aria-hidden
                >
                  {(() => {
                    const Icon = statusIcons[availabilityStatus];
                    return <Icon className="w-4 h-4" strokeWidth={2.5} />;
                  })()}
                </span>
                <span className="text-sm font-medium text-[var(--hiver-text)] hidden sm:inline">
                  {AVAILABILITY_LABELS[availabilityStatus]}
                </span>
              </button>
              {statusOpen && (
                <div className="absolute right-0 top-full mt-1.5 py-2 rounded-xl card-panel shadow-[var(--hiver-shadow-md)] z-50 min-w-[160px]">
                  <p className="px-3 py-2 text-xs font-medium text-[var(--hiver-text-muted)] uppercase tracking-wider border-b border-[var(--hiver-border)]">
                    Velg status
                  </p>
                  <ul className="py-1" role="listbox">
                    {(['active', 'away', 'busy', 'offline'] as const).map((s) => {
                      const Icon = statusIcons[s];
                      const isSelected = availabilityStatus === s;
                      return (
                        <li key={s}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setAvailabilityStatus(s);
                              setStatusOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
                              isSelected ? 'bg-[var(--hiver-accent-light)]' : 'hover:bg-[var(--hiver-bg)]'
                            }`}
                            aria-label={AVAILABILITY_LABELS[s]}
                          >
                            <span
                              className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white"
                              style={{ backgroundColor: AVAILABILITY_COLORS[s] }}
                              aria-hidden
                            >
                              <Icon className="w-3 h-3" strokeWidth={2.5} />
                            </span>
                            <span className="text-sm font-medium text-[var(--hiver-text)]">
                              {AVAILABILITY_LABELS[s]}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <span
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white bg-neutral-500 border-2 border-[var(--hiver-panel-bg)] shadow-md"
              title="Velg organisasjon for å sette din status"
              aria-label="Status: velg organisasjon"
            >
              <X className="w-4 h-4" strokeWidth={2.5} aria-hidden />
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setStatusOpen(false);
            setUserOpen((v) => !v);
          }}
          className="flex items-center gap-2 rounded-full p-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/40"
          aria-label="Kontomeny"
        >
          <div className="w-9 h-9 rounded-full bg-[var(--hiver-accent)] text-white text-sm font-medium flex items-center justify-center shadow">
            {initials}
          </div>
        </button>
        {userOpen && (
          <div className="absolute right-0 top-full mt-1 w-72 card-panel shadow-[var(--hiver-shadow-md)] z-50 overflow-hidden">
            <div className="p-4 border-b border-[var(--hiver-border)]">
              <p className="font-semibold text-[var(--hiver-text)]">{displayName}</p>
              <p className="text-sm text-[var(--hiver-text-muted)] truncate">{user?.email}</p>
            </div>
            <div className="p-3 border-b border-[var(--hiver-border)]">
              <label className="flex items-center gap-3 cursor-pointer">
                <Mail className="w-4 h-4 text-[var(--hiver-text-muted)]" />
                <span className="text-sm text-[var(--hiver-text)] flex-1">Tilgjengelig for e-post</span>
                <input
                  type="checkbox"
                  checked={availableForEmail}
                  onChange={(e) => setAvailableForEmail(e.target.checked)}
                  className="rounded border-[var(--hiver-border)] text-[var(--hiver-accent)] focus:ring-[var(--hiver-accent)]"
                />
              </label>
            </div>
            <div className="p-3 border-b border-[var(--hiver-border)] space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--hiver-text-muted)]">E-postvarsler</p>
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--hiver-text)]">
                <span>Email ved tildelt sak</span>
                <ToggleSwitch
                  checked={notifPrefs.notify_owner_assignment}
                  onChange={(v) => savePref('notify_owner_assignment', v)}
                  disabled={prefsSaving}
                  label="Email ved tildelt sak"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--hiver-text)]">
                <span>Email ved tildelt til team</span>
                <ToggleSwitch
                  checked={notifPrefs.notify_team_changes}
                  onChange={(v) => savePref('notify_team_changes', v)}
                  disabled={prefsSaving}
                  label="Email ved tildelt til team"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--hiver-text)]">
                <span>Email ved svar til meg</span>
                <ToggleSwitch
                  checked={notifPrefs.notify_owner_activity}
                  onChange={(v) => savePref('notify_owner_activity', v)}
                  disabled={prefsSaving}
                  label="Email ved svar til meg"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--hiver-text)]">
                <span>Email ved svar til team</span>
                <ToggleSwitch
                  checked={notifPrefs.notify_team_activity}
                  onChange={(v) => savePref('notify_team_activity', v)}
                  disabled={prefsSaving}
                  label="Email ved svar til team"
                />
              </label>
            </div>
            <div className="py-1">
              {showPlanningInMenu && (
                <Link
                  to="/planning"
                  onClick={() => setUserOpen(false)}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[var(--hiver-text-muted)]" />
                    Teamtilgjengelighet
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--hiver-text-muted)]" />
                </Link>
              )}
              {admin && (
                <Link
                  to="/settings?tab=users"
                  onClick={() => setUserOpen(false)}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-[var(--hiver-text-muted)]" />
                    Adminpanel
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--hiver-text-muted)]" />
                </Link>
              )}
            </div>
              {canAccessSettings(role) && (
                <Link
                  to="/settings"
                  onClick={() => setUserOpen(false)}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-[var(--hiver-text-muted)]" />
                    Mine innstillinger
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--hiver-text-muted)]" />
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  setUserOpen(false);
                  signOut();
                }}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
              >
                <LogOut className="w-4 h-4" />
                Logg ut
              </button>
          </div>
        )}
      </div>
      </div>

    </header>
  );
}
