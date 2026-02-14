import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { getNotificationIcon } from '../utils/notificationIcons';
import { Bell, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

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
  const { items: notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications({ limit: 100 });

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
