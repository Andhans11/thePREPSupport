import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { getNotificationIcon } from '../utils/notificationIcons';
import { Bell, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../services/supabase';
import { useEffect, useState } from 'react';

function formatNotificationTime(created_at: string): string {
  const d = new Date(created_at);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Akkurat nå';
  if (diffMins < 60) return `For ${diffMins} min siden`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `For ${diffHours} t siden`;
  return d.toLocaleDateString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { items: notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications({ limit: 100 });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    notify_owner_assignment: true,
    notify_owner_activity: true,
    notify_team_activity: true,
    notify_team_changes: true,
  });

  useEffect(() => {
    const loadPrefs = async () => {
      if (!user?.id || !currentTenantId) {
        setPrefsLoading(false);
        return;
      }
      setPrefsLoading(true);
      const { data } = await supabase
        .from('team_members')
        .select('notify_owner_assignment, notify_owner_activity, notify_team_activity, notify_team_changes')
        .eq('tenant_id', currentTenantId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      const row = (data as {
        notify_owner_activity?: boolean;
        notify_team_activity?: boolean;
        notify_team_changes?: boolean;
        notify_owner_assignment?: boolean;
      } | null) ?? null;
      if (row) {
        setPrefs({
          notify_owner_assignment: row.notify_owner_assignment !== false,
          notify_owner_activity: row.notify_owner_activity !== false,
          notify_team_activity: row.notify_team_activity !== false,
          notify_team_changes: row.notify_team_changes !== false,
        });
      }
      setPrefsLoading(false);
    };
    loadPrefs();
  }, [user?.id, currentTenantId]);

  const savePref = async (key: 'notify_owner_assignment' | 'notify_owner_activity' | 'notify_team_activity' | 'notify_team_changes', value: boolean) => {
    if (!user?.id || !currentTenantId) return;
    setPrefsSaving(true);
    setPrefs((prev) => ({ ...prev, [key]: value }));
    await supabase
      .from('team_members')
      .update({ [key]: value })
      .eq('tenant_id', currentTenantId)
      .eq('user_id', user.id);
    setPrefsSaving(false);
  };

  const setAllPrefs = async (value: boolean) => {
    if (!user?.id || !currentTenantId) return;
    setPrefsSaving(true);
    setPrefs({
      notify_owner_assignment: value,
      notify_owner_activity: value,
      notify_team_activity: value,
      notify_team_changes: value,
    });
    await supabase
      .from('team_members')
      .update({
        notify_owner_assignment: value,
        notify_owner_activity: value,
        notify_team_activity: value,
        notify_team_changes: value,
      })
      .eq('tenant_id', currentTenantId)
      .eq('user_id', user.id);
    setPrefsSaving(false);
  };

  return (
    <div className="h-full flex flex-col bg-[var(--hiver-panel-bg)]">
      <div className="shrink-0 border-b border-[var(--hiver-border)] bg-[var(--hiver-panel-bg)] px-4 py-4">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="p-2 rounded-lg text-[var(--hiver-text-muted)] hover:bg-[var(--hiver-bg)] hover:text-[var(--hiver-text)]"
            aria-label="Tilbake"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Bell className="w-6 h-6 text-[var(--hiver-accent)]" />
              <h1 className="text-xl font-semibold text-[var(--hiver-text)]">Varsler</h1>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-sm font-medium text-[var(--hiver-accent)] hover:underline"
              >
                Merk alle som lest
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-[var(--hiver-border)] bg-[var(--hiver-bg)]/30">
          <h2 className="text-sm font-semibold text-[var(--hiver-text)] mb-2">Mine varslingsinnstillinger</h2>
          {prefsLoading ? (
            <p className="text-xs text-[var(--hiver-text-muted)]">Laster innstillinger...</p>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--hiver-text)]">
                <span>Varsel ved tildelt sak (meg)</span>
                <input type="checkbox" checked={prefs.notify_owner_assignment} disabled={prefsSaving} onChange={(e) => savePref('notify_owner_assignment', e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--hiver-text)]">
                <span>Varsel på mine saker (eier/ansvarlig)</span>
                <input type="checkbox" checked={prefs.notify_owner_activity} disabled={prefsSaving} onChange={(e) => savePref('notify_owner_activity', e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--hiver-text)]">
                <span>Varsel på saker i mine team</span>
                <input type="checkbox" checked={prefs.notify_team_activity} disabled={prefsSaving} onChange={(e) => savePref('notify_team_activity', e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--hiver-text)]">
                <span>Varsel ved endringer i team-saker</span>
                <input type="checkbox" checked={prefs.notify_team_changes} disabled={prefsSaving} onChange={(e) => savePref('notify_team_changes', e.target.checked)} />
              </label>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setAllPrefs(false)}
                  disabled={prefsSaving}
                  className="text-xs font-medium text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)] underline"
                >
                  Skru av alle
                </button>
                <span className="mx-2 text-[var(--hiver-text-muted)]">|</span>
                <button
                  type="button"
                  onClick={() => setAllPrefs(true)}
                  disabled={prefsSaving}
                  className="text-xs font-medium text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)] underline"
                >
                  Skru pa alle
                </button>
              </div>
            </div>
          )}
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--hiver-text-muted)]">
            Laster varsler…
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-[var(--hiver-text-muted)]">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Ingen varsler</p>
            <p className="text-sm mt-1">Du får varsler når noen legger deg til i planlegging, tildeler deg saker, endrer status eller nevner deg i notater.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--hiver-border)]">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!n.read_at) markAsRead(n.id);
                    if (n.link) navigate(n.link);
                  }}
                  className={`w-full text-left px-4 py-4 hover:bg-[var(--hiver-bg)] transition-colors flex gap-3 ${
                    !n.read_at ? 'bg-[var(--hiver-accent-light)]/20' : ''
                  }`}
                >
                  <span className="relative shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--hiver-bg)] text-[var(--hiver-text-muted)]">
                    {(() => {
                      const Icon = getNotificationIcon(n);
                      return <Icon className="w-4 h-4" />;
                    })()}
                    {!n.read_at && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--hiver-accent)] border-2 border-[var(--hiver-panel-bg)]" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--hiver-text)]">{n.title}</p>
                    {n.body && (
                      <p className="text-sm text-[var(--hiver-text-muted)] mt-1 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="text-xs text-[var(--hiver-text-muted)] mt-2">
                      {formatNotificationTime(n.created_at)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
