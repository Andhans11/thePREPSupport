import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useCurrentUserRole } from '../../hooks/useCurrentUserRole';
import { useNotifications } from '../../hooks/useNotifications';
import { isAdmin, canAccessSettings } from '../../types/roles';
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, type AvailabilityStatus } from '../../types/availability';
import { supabase } from '../../services/supabase';
import {
  LogOut,
  Mail,
  Settings,
  Users,
  ChevronRight,
  Bell,
  Building2,
  ChevronDown,
  Check,
  Moon,
  Minus,
  X,
  Plus,
  Loader2,
} from 'lucide-react';

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
  const { tenants, currentTenantId, setCurrentTenantId, refetchTenants, loading: tenantLoading } = useTenant();
  const navigate = useNavigate();
  const [userOpen, setUserOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [addingOrg, setAddingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const tenantRef = useRef<HTMLDivElement>(null);

  const { role, availableForEmail, setAvailableForEmail, availabilityStatus, setAvailabilityStatus, teamMemberId } = useCurrentUserRole();
  const { items: notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const admin = isAdmin(role);
  const currentTenant = tenants.find((t) => t.id === currentTenantId);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenantId) {
      setLogoUrl(null);
      return;
    }
    supabase
      .from('company_settings')
      .select('value')
      .eq('tenant_id', currentTenantId)
      .eq('key', 'company_logo_url')
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as { value: unknown } | null)?.value;
        setLogoUrl(typeof v === 'string' ? v : null);
      });
  }, [currentTenantId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (tenantRef.current && !tenantRef.current.contains(e.target as Node)) setTenantOpen(false);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  async function handleCreateOrg() {
    const name = newOrgName.trim();
    if (!name) return;
    setCreateOrgError(null);
    setCreatingOrg(true);
    const { data, error } = await supabase.rpc('create_tenant_and_join', { tenant_name: name });
    setCreatingOrg(false);
    if (error) {
      setCreateOrgError(error.message || 'Kunne ikke opprette organisasjon');
      return;
    }
    const payload = data as { ok?: boolean; tenant_id?: string; error?: string };
    if (!payload?.ok || !payload.tenant_id) {
      setCreateOrgError(payload?.error || 'Kunne ikke opprette organisasjon');
      return;
    }
    setAddingOrg(false);
    setNewOrgName('');
    await refetchTenants();
    setCurrentTenantId(payload.tenant_id);
    setTenantOpen(false);
  }

  const statusIcons: Record<AvailabilityStatus, typeof Check> = {
    active: Check,
    away: Moon,
    busy: Minus,
    offline: X,
  };

  const INACTIVITY_AWAY_MS = 10 * 60 * 1000;
  useEffect(() => {
    if (teamMemberId == null || availabilityStatus !== 'active') return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleAway = () => {
      timeoutId = setTimeout(() => {
        setAvailabilityStatus('away');
      }, INACTIVITY_AWAY_MS);
    };
    const onActivity = () => {
      clearTimeout(timeoutId);
      scheduleAway();
    };
    scheduleAway();
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

  return (
    <header className="h-14 border-b border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] flex items-center justify-between gap-2 px-4 shrink-0">
      {/* Tenant switcher */}
      <div className="relative" ref={tenantRef}>
        {!tenantLoading && tenants.length === 0 && (
          <p className="text-sm text-[var(--hiver-text-muted)] px-2">
            Ingen organisasjon. Hadde du en invitasjon?{' '}
            <a href="/accept-invite" className="text-[var(--hiver-accent)] hover:underline">
              Åpne invitasjonslenken fra e-posten
            </a>
            {' '}for å bli med.
          </p>
        )}
        {!tenantLoading && tenants.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setTenantOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)] border border-[var(--hiver-border)]"
              aria-label="Bytt organisasjon"
            >
              <Building2 className="w-4 h-4 text-[var(--hiver-text-muted)]" />
              <span className="max-w-[140px] truncate">{currentTenant?.name ?? 'Organisasjon'}</span>
              <ChevronDown className={`w-4 h-4 text-[var(--hiver-text-muted)] transition ${tenantOpen ? 'rotate-180' : ''}`} />
            </button>
            {tenantOpen && (
              <div className="absolute left-0 top-full mt-1 min-w-[220px] max-h-80 overflow-y-auto card-panel shadow-[var(--hiver-shadow-md)] z-50">
                <ul>
                  {tenants.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentTenantId(t.id);
                          setTenantOpen(false);
                          setAddingOrg(false);
                          setCreateOrgError(null);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--hiver-bg)] ${t.id === currentTenantId ? 'font-medium text-[var(--hiver-accent)]' : 'text-[var(--hiver-text)]'}`}
                      >
                        {t.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <hr className="border-[var(--hiver-border)] my-1" />
                {!addingOrg ? (
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingOrg(true);
                        setNewOrgName('');
                        setCreateOrgError(null);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--hiver-accent)] hover:bg-[var(--hiver-bg)]"
                    >
                      <Plus className="w-4 h-4" />
                      Legg til ny organisasjon
                    </button>
                  </div>
                ) : (
                  <div className="p-3 space-y-2 border-t border-[var(--hiver-border)]">
                    <input
                      type="text"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="Navn på organisasjon"
                      className="w-full rounded-lg border border-[var(--hiver-border)] px-3 py-2 text-sm text-[var(--hiver-text)] placeholder:text-[var(--hiver-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hiver-accent)]/30"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newOrgName.trim()) handleCreateOrg();
                        }
                        if (e.key === 'Escape') {
                          setAddingOrg(false);
                          setCreateOrgError(null);
                        }
                      }}
                      autoFocus
                    />
                    {createOrgError && (
                      <p className="text-xs text-red-600">{createOrgError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleCreateOrg()}
                        disabled={!newOrgName.trim() || creatingOrg}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--hiver-accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--hiver-accent-hover)] disabled:opacity-50"
                      >
                        {creatingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Opprett
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingOrg(false);
                          setNewOrgName('');
                          setCreateOrgError(null);
                        }}
                        className="px-3 py-2 rounded-lg border border-[var(--hiver-border)] text-sm text-[var(--hiver-text)] hover:bg-[var(--hiver-bg)]"
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
      {/* Company logo (top right) */}
      {logoUrl && (
        <div className="flex items-center shrink-0">
          <img
            src={logoUrl}
            alt=""
            className="h-9 w-auto max-w-[140px] object-contain object-right"
          />
        </div>
      )}
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
                  Ingen varsler ennå.
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
                        className={`w-full text-left px-4 py-3 hover:bg-[var(--hiver-bg)] border-b border-[var(--hiver-border)] last:border-0 ${
                          !n.read_at ? 'bg-[var(--hiver-accent-light)]/30' : ''
                        }`}
                      >
                        <p className="text-sm font-medium text-[var(--hiver-text)]">{n.title}</p>
                        {n.body && (
                          <p className="text-xs text-[var(--hiver-text-muted)] mt-0.5 line-clamp-2">
                            {n.body}
                          </p>
                        )}
                        <p className="text-xs text-[var(--hiver-text-muted)] mt-1">
                          {formatNotificationTime(n.created_at)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
            <div className="py-1">
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
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
