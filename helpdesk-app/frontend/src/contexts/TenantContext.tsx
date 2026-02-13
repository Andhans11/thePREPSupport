import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

export interface Tenant {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

const STORAGE_KEY = 'helpdesk_current_tenant_id';

interface TenantContextValue {
  tenants: Tenant[];
  currentTenantId: string | null;
  setCurrentTenantId: (id: string | null) => void;
  loading: boolean;
  refetchTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenantId, setCurrentTenantIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });
  const [loading, setLoading] = useState(true);

  const refetchTenants = useCallback(async () => {
    if (!user?.id) {
      setTenants([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: members } = await supabase
      .from('team_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('is_active', true);
    const tenantIds = [...new Set((members ?? []).map((m) => m.tenant_id))];
    if (tenantIds.length === 0) {
      setTenants([]);
      setCurrentTenantIdState(null);
      setLoading(false);
      return;
    }
    const { data: tenantRows } = await supabase.from('tenants').select('id, name, created_at, updated_at').in('id', tenantIds);
    const list = (tenantRows ?? []) as Tenant[];
    setTenants(list);
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const current = list.some((t) => t.id === stored) ? stored : list[0]?.id ?? null;
    setCurrentTenantIdState(current);
    if (current) window.localStorage.setItem(STORAGE_KEY, current);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    refetchTenants();
  }, [refetchTenants]);

  const setCurrentTenantId = useCallback((id: string | null) => {
    setCurrentTenantIdState(id);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value: TenantContextValue = {
    tenants,
    currentTenantId,
    setCurrentTenantId,
    loading,
    refetchTenants,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
