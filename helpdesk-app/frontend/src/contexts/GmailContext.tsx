import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { getGmailAuthUrl } from '../services/gmail';
import { exchangeOAuthCodeForTokens, triggerGmailSync, disconnectGmail } from '../services/api';
import { useTenant } from './TenantContext';
import { useToast } from './ToastContext';

interface GmailSyncRow {
  id: string;
  user_id: string | null;
  email_address: string;
  group_email: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GmailContextValue {
  isConnected: boolean;
  gmailEmail: string | null;
  groupEmail: string | null;
  lastSyncAt: string | null;
  loading: boolean;
  syncing: boolean;
  savingGroupEmail: boolean;
  error: string | null;
  connectGmail: (teamEmail?: string | null) => void;
  isGmailOAuthConfigured: boolean;
  handleOAuthCallback: (code: string, tenantIdFromState?: string | null, groupEmail?: string | null) => Promise<{ ok: boolean; error?: string }>;
  syncNow: () => Promise<{ success: boolean; created?: number }>;
  disconnect: () => Promise<void>;
  updateGroupEmail: (email: string | null) => Promise<void>;
  clearError: () => void;
  refetchTenantOAuth: () => void;
}

const GmailContext = createContext<GmailContextValue | null>(null);

export function GmailProvider({ children }: { children: React.ReactNode }) {
  const { currentTenantId } = useTenant();
  const toast = useToast();
  const [gmailSync, setGmailSync] = useState<GmailSyncRow | null>(null);
  const [cronLastRunAt, setCronLastRunAt] = useState<string | null>(null);
  const [tenantOAuthClientId, setTenantOAuthClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingGroupEmail, setSavingGroupEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchTenantOAuth();
  }, [fetchTenantOAuth]);

  const fetchGmailSync = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !currentTenantId) {
      setGmailSync(null);
      setCronLastRunAt(null);
      setLoading(false);
      return;
    }
    const [gmailRes, cronRes] = await Promise.all([
      supabase
        .from('gmail_sync')
        .select('id, user_id, email_address, group_email, is_active, last_sync_at, created_at, updated_at')
        .eq('user_id', user.id)
        .eq('tenant_id', currentTenantId)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('gmail_sync_cron_last_run')
        .select('last_run_at')
        .eq('id', 1)
        .maybeSingle(),
    ]);
    const gmailData = gmailRes.data as GmailSyncRow | null;
    const cronRow = cronRes.data as { last_run_at?: string } | null;
    const cronLastRunAt = cronRow?.last_run_at ?? null;
    setGmailSync(gmailData ?? null);
    setCronLastRunAt(cronLastRunAt);
    setLoading(false);
  }, [currentTenantId]);

  useEffect(() => {
    fetchGmailSync();
  }, [fetchGmailSync]);

  // Refresh Gmail connection state (e.g. last_sync_at) periodically; do not auto-invoke sync
  // to avoid extra Edge Function invocations. Sync is done by cron (~15 min) and manual "Sync now".
  useEffect(() => {
    if (!gmailSync || !currentTenantId) return;
    const intervalMs = 15 * 60 * 1000;
    const id = setInterval(() => fetchGmailSync(), intervalMs);
    return () => clearInterval(id);
  }, [gmailSync, currentTenantId, fetchGmailSync]);

  const GMAIL_CONNECT_GROUP_EMAIL_KEY = 'helpdesk_gmail_connect_group_email';

  const connectGmail = (teamEmail?: string | null) => {
    setError(null);
    if (!currentTenantId) {
      setError('Velg en organisasjon først (øverst på siden), deretter prøv å koble til Gmail igjen.');
      return;
    }
    const clientId = tenantOAuthClientId?.trim() ?? null;
    const url = clientId ? getGmailAuthUrl(currentTenantId, clientId) : null;
    if (!url) {
      setError('Google OAuth er ikke konfigurert for denne organisasjonen. Be en administrator om å legge til Client ID og Secret under E-post innbokser.');
      return;
    }
    if (typeof window !== 'undefined' && teamEmail?.trim()) {
      window.sessionStorage.setItem(GMAIL_CONNECT_GROUP_EMAIL_KEY, teamEmail.trim());
    }
    window.location.href = url;
  };

  const handleOAuthCallback = useCallback(
    async (code: string, tenantIdFromState?: string | null, groupEmail?: string | null): Promise<{ ok: boolean; error?: string }> => {
      setError(null);
      const tenantIdToUse = tenantIdFromState ?? currentTenantId ?? undefined;
      if (!tenantIdToUse) {
        const err = 'Kunne ikke bestemme organisasjon. Prøv å velge organisasjon øverst på siden og koble til Gmail på nytt.';
        setError(err);
        return { ok: false, error: err };
      }
      const result = await exchangeOAuthCodeForTokens(code, tenantIdToUse, groupEmail ?? undefined);
      if (result.success) {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem('helpdesk_gmail_connect_group_email');
        }
        fetchGmailSync().catch(() => {});
        return { ok: true };
      }
      const err = result.error || 'Kunne ikke koble til Gmail.';
      setError(err);
      return { ok: false, error: err };
    },
    [fetchGmailSync, currentTenantId]
  );

  const syncNow = async (): Promise<{ success: boolean; created?: number }> => {
    setSyncing(true);
    setError(null);
    const result = await triggerGmailSync(currentTenantId ?? undefined);
    if (!result.success) setError(result.error || 'Sync failed');
    else await fetchGmailSync();
    setSyncing(false);
    return { success: result.success, created: result.created };
  };

  const disconnect = async () => {
    setError(null);
    const result = await disconnectGmail(currentTenantId ?? undefined);
    if (!result.success) setError(result.error || 'Disconnect failed');
    else setGmailSync(null);
  };

  const updateGroupEmail = async (email: string | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !gmailSync || !currentTenantId) return;
    setSavingGroupEmail(true);
    setError(null);
    const value = email?.trim() || null;
    const { error: updateError } = await supabase
      .from('gmail_sync')
      .update({ group_email: value, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('tenant_id', currentTenantId);
    if (updateError) {
      setError(updateError.message);
      toast.error(updateError.message);
    } else {
      setGmailSync((prev) => (prev ? { ...prev, group_email: value } : null));
      toast.success(value ? 'Gruppe-e-post er lagret' : 'Gruppe-e-post er fjernet');
    }
    setSavingGroupEmail(false);
  };

  // Display last sync = latest of automatic (cron) or manual (this inbox). Manual overwrites.
  const inboxLastSync = gmailSync?.last_sync_at ?? null;
  const lastSyncAt =
    inboxLastSync && cronLastRunAt
      ? new Date(inboxLastSync) > new Date(cronLastRunAt)
        ? inboxLastSync
        : cronLastRunAt
      : inboxLastSync ?? cronLastRunAt;

  const value: GmailContextValue = {
    isConnected: !!gmailSync,
    gmailEmail: gmailSync?.email_address ?? null,
    groupEmail: gmailSync?.group_email ?? null,
    lastSyncAt,
    loading,
    syncing,
    savingGroupEmail,
    error,
    connectGmail,
    isGmailOAuthConfigured: !!tenantOAuthClientId?.trim(),
    handleOAuthCallback,
    syncNow,
    disconnect,
    updateGroupEmail,
    clearError: () => setError(null),
    refetchTenantOAuth: fetchTenantOAuth,
  };

  return <GmailContext.Provider value={value}>{children}</GmailContext.Provider>;
}

export function useGmail() {
  const ctx = useContext(GmailContext);
  if (!ctx) throw new Error('useGmail must be used within GmailProvider');
  return ctx;
}
