import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { getGmailAuthUrl } from '../services/gmail';
import { exchangeOAuthCodeForTokens, triggerGmailSync, disconnectGmail } from '../services/api';
import { useTenant } from './TenantContext';

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
  connectGmail: () => void;
  handleOAuthCallback: (code: string) => Promise<boolean>;
  syncNow: () => Promise<{ success: boolean; created?: number }>;
  disconnect: () => Promise<void>;
  updateGroupEmail: (email: string | null) => Promise<void>;
  clearError: () => void;
}

const GmailContext = createContext<GmailContextValue | null>(null);

export function GmailProvider({ children }: { children: React.ReactNode }) {
  const { currentTenantId } = useTenant();
  const [gmailSync, setGmailSync] = useState<GmailSyncRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingGroupEmail, setSavingGroupEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGmailSync = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !currentTenantId) {
      setGmailSync(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('gmail_sync')
      .select('id, user_id, email_address, group_email, is_active, last_sync_at, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('tenant_id', currentTenantId)
      .eq('is_active', true)
      .maybeSingle();
    setGmailSync((data as GmailSyncRow | null) ?? null);
    setLoading(false);
  }, [currentTenantId]);

  useEffect(() => {
    fetchGmailSync();
  }, [fetchGmailSync]);

  // Auto-sync Gmail every 5 minutes when connected
  useEffect(() => {
    if (!gmailSync || !currentTenantId) return;
    const intervalMs = 5 * 60 * 1000;
    const id = setInterval(async () => {
      const result = await triggerGmailSync(currentTenantId);
      if (result.success) await fetchGmailSync();
    }, intervalMs);
    return () => clearInterval(id);
  }, [gmailSync, currentTenantId, fetchGmailSync]);

  const connectGmail = () => {
    setError(null);
    window.location.href = getGmailAuthUrl();
  };

  const handleOAuthCallback = useCallback(
    async (code: string): Promise<boolean> => {
      setError(null);
      const result = await exchangeOAuthCodeForTokens(code, currentTenantId ?? undefined);
      if (result.success) {
        fetchGmailSync().catch(() => {});
        return true;
      }
      setError(result.error || 'Failed to connect Gmail');
      return false;
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
    } else {
      setGmailSync((prev) => (prev ? { ...prev, group_email: value } : null));
    }
    setSavingGroupEmail(false);
  };

  const value: GmailContextValue = {
    isConnected: !!gmailSync,
    gmailEmail: gmailSync?.email_address ?? null,
    groupEmail: gmailSync?.group_email ?? null,
    lastSyncAt: gmailSync?.last_sync_at ?? null,
    loading,
    syncing,
    savingGroupEmail,
    error,
    connectGmail,
    handleOAuthCallback,
    syncNow,
    disconnect,
    updateGroupEmail,
    clearError: () => setError(null),
  };

  return <GmailContext.Provider value={value}>{children}</GmailContext.Provider>;
}

export function useGmail() {
  const ctx = useContext(GmailContext);
  if (!ctx) throw new Error('useGmail must be used within GmailProvider');
  return ctx;
}
