import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useTenant } from './TenantContext';
import { GMAIL_SYNC_COMPLETED_EVENT } from './GmailContext';
import { getGoogleCalendarAuthUrlWithClientId, getGoogleCalendarRedirectUri } from '../services/googleCalendar';
import { exchangeGoogleCalendarOAuthCodeForTokens, triggerGoogleCalendarSync } from '../services/api';

interface CalendarConnection {
  connected: boolean;
  provider: 'google';
  email: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

interface GoogleCalendarContextValue {
  loading: boolean;
  connection: CalendarConnection;
  isGoogleOAuthConfigured: boolean;
  connectGoogleCalendar: () => void;
  handleOAuthCallback: (code: string, tenantIdFromState?: string | null) => Promise<{ ok: boolean; error?: string }>;
  syncNow: () => Promise<{ ok: boolean; error?: string }>;
  /** True while calendar-only sync is running (header combined sync uses Gmail + this). */
  syncing: boolean;
  disconnect: () => Promise<{ ok: boolean; error?: string }>;
  refetch: () => Promise<void>;
}

const DEFAULT_CONNECTION: CalendarConnection = {
  connected: false,
  provider: 'google',
  email: null,
  connectedAt: null,
  lastSyncAt: null,
};

const GoogleCalendarContext = createContext<GoogleCalendarContextValue | null>(null);

function parseConnection(value: unknown): CalendarConnection {
  if (!value || typeof value !== 'object') return DEFAULT_CONNECTION;
  const row = value as { email_address?: unknown; created_at?: unknown; last_sync_at?: unknown };
  return {
    connected: true,
    provider: 'google',
    email: typeof row.email_address === 'string' ? row.email_address : null,
    connectedAt: typeof row.created_at === 'string' ? row.created_at : null,
    lastSyncAt: typeof row.last_sync_at === 'string' ? row.last_sync_at : null,
  };
}

export function GoogleCalendarProvider({ children }: { children: React.ReactNode }) {
  const { currentTenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connection, setConnection] = useState<CalendarConnection>(DEFAULT_CONNECTION);
  const [tenantOAuthClientId, setTenantOAuthClientId] = useState<string | null>(null);

  const fetchTenantOAuth = useCallback(() => {
    if (!currentTenantId) {
      setTenantOAuthClientId(null);
      return;
    }
    supabase
      .from('tenant_google_oauth')
      .select('client_id')
      .eq('tenant_id', currentTenantId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { client_id?: string } | null;
        setTenantOAuthClientId(row?.client_id?.trim() ?? null);
      });
  }, [currentTenantId]);

  const refetch = useCallback(async () => {
    if (!currentTenantId) {
      setConnection(DEFAULT_CONNECTION);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('google_calendar_sync')
      .select('email_address, created_at, last_sync_at')
      .eq('tenant_id', currentTenantId)
      .eq('is_active', true)
      .maybeSingle();
    const row = data as Record<string, unknown> | null;
    setConnection(parseConnection(row));
    setLoading(false);
  }, [currentTenantId]);

  useEffect(() => {
    fetchTenantOAuth();
  }, [fetchTenantOAuth]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // After manual Gmail sync from header, calendar rows update server-side — refresh last_sync_at here.
  useEffect(() => {
    const onGmailSyncDone = () => {
      void refetch();
    };
    window.addEventListener(GMAIL_SYNC_COMPLETED_EVENT, onGmailSyncDone);
    return () => window.removeEventListener(GMAIL_SYNC_COMPLETED_EVENT, onGmailSyncDone);
  }, [refetch]);

  // Same ~15 min cadence as Gmail polling so header "Sist synk" stays fresh for calendar cron runs.
  useEffect(() => {
    if (!connection.connected || !currentTenantId) return;
    const intervalMs = 15 * 60 * 1000;
    const id = setInterval(() => void refetch(), intervalMs);
    return () => clearInterval(id);
  }, [connection.connected, currentTenantId, refetch]);

  const connectGoogleCalendar = useCallback(() => {
    if (!currentTenantId) return;
    const clientId = tenantOAuthClientId?.trim() ?? null;
    if (!clientId) return;
    const url = getGoogleCalendarAuthUrlWithClientId(currentTenantId, clientId);
    window.location.href = url;
  }, [currentTenantId, tenantOAuthClientId]);

  const handleOAuthCallback = useCallback(
    async (code: string, tenantIdFromState?: string | null): Promise<{ ok: boolean; error?: string }> => {
      const tenantId = tenantIdFromState ?? currentTenantId;
      if (!tenantId) return { ok: false, error: 'Ingen organisasjon valgt.' };
      const result = await exchangeGoogleCalendarOAuthCodeForTokens(code, tenantId, getGoogleCalendarRedirectUri());
      if (!result.success) return { ok: false, error: result.error || 'Kunne ikke koble til kalender.' };
      await refetch();
      return { ok: true };
    },
    [currentTenantId, refetch]
  );

  const syncNow = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!currentTenantId) return { ok: false, error: 'Ingen organisasjon valgt.' };
    if (!connection.connected) return { ok: false, error: 'Ingen kalender er koblet til.' };
    setSyncing(true);
    try {
      const result = await triggerGoogleCalendarSync(currentTenantId);
      if (!result.success) return { ok: false, error: result.error || 'Kunne ikke synkronisere kalender.' };
      await refetch();
      return { ok: true };
    } finally {
      setSyncing(false);
    }
  }, [currentTenantId, connection.connected, refetch]);

  const disconnect = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!currentTenantId) return { ok: false, error: 'Ingen organisasjon valgt.' };
    const { error } = await supabase
      .from('google_calendar_sync')
      .delete()
      .eq('tenant_id', currentTenantId)
      .eq('is_active', true);
    if (error) return { ok: false, error: error.message };
    setConnection(DEFAULT_CONNECTION);
    return { ok: true };
  }, [currentTenantId]);

  const contextValue = useMemo<GoogleCalendarContextValue>(
    () => ({
      loading,
      connection,
      isGoogleOAuthConfigured: !!tenantOAuthClientId?.trim(),
      connectGoogleCalendar,
      handleOAuthCallback,
      syncNow,
      syncing,
      disconnect,
      refetch,
    }),
    [loading, connection, tenantOAuthClientId, connectGoogleCalendar, handleOAuthCallback, syncNow, syncing, disconnect, refetch]
  );

  return <GoogleCalendarContext.Provider value={contextValue}>{children}</GoogleCalendarContext.Provider>;
}

export function useGoogleCalendar() {
  const ctx = useContext(GoogleCalendarContext);
  if (!ctx) throw new Error('useGoogleCalendar must be used within GoogleCalendarProvider');
  return ctx;
}
