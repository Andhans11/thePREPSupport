import { useCallback, useMemo } from 'react';
import { useGmail } from '../contexts/GmailContext';
import { useGoogleCalendar } from '../contexts/GoogleCalendarContext';

/**
 * One manual sync flow for the app: Gmail sync (when connected) also triggers calendar sync on the server;
 * if only calendar is connected, runs calendar sync only. Same cadence as cron (~15 min) for both.
 */
export function useUnifiedSync(onAfterSuccessfulSync?: () => void) {
  const {
    isConnected: gmailConnected,
    lastSyncAt: gmailLastSync,
    lastSyncNewTicketsCount,
    syncNow: syncGmailNow,
    syncing: gmailSyncing,
  } = useGmail();
  const {
    connection,
    syncNow: syncCalendarNow,
    syncing: calendarSyncing,
  } = useGoogleCalendar();

  const combinedLastSyncAt = useMemo(() => {
    const g = gmailLastSync ? new Date(gmailLastSync).getTime() : 0;
    const c = connection.lastSyncAt ? new Date(connection.lastSyncAt).getTime() : 0;
    const t = Math.max(g, c);
    return t > 0 ? new Date(t).toISOString() : null;
  }, [gmailLastSync, connection.lastSyncAt]);

  const combinedSyncing = gmailSyncing || calendarSyncing;

  const syncAll = useCallback(async (): Promise<{ success: boolean; created?: number; error?: string }> => {
    if (gmailConnected) {
      const r = await syncGmailNow();
      if (r.success) onAfterSuccessfulSync?.();
      return { success: r.success, created: r.created };
    }
    if (connection.connected) {
      const r = await syncCalendarNow();
      if (r.ok) onAfterSuccessfulSync?.();
      return r.ok ? { success: true } : { success: false, error: r.error };
    }
    return { success: false, error: 'Koble til e-post eller kalender for å synkronisere.' };
  }, [gmailConnected, connection.connected, syncGmailNow, syncCalendarNow, onAfterSuccessfulSync]);

  return {
    combinedLastSyncAt,
    combinedSyncing,
    lastSyncNewTicketsCount,
    syncAll,
    gmailConnected,
    calendarConnected: connection.connected,
  };
}
