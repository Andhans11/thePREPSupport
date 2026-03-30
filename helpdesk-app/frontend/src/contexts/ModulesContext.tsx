import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useTenant } from './TenantContext';
import { type ModuleId, type ModuleRoleAccess, defaultRoleAccessAll, parseRoleAccessFromJson } from '../types/modules';

export interface ModuleSettings {
  planningEnabled: boolean;
  timeRegistrationEnabled: boolean;
  calendarEnabled: boolean;
  analyticsEnabled: boolean;
  roleAccess: Record<ModuleId, ModuleRoleAccess>;
}

interface ModulesContextValue extends ModuleSettings {
  loading: boolean;
  updateModules: (settings: ModuleSettings) => Promise<{ ok: boolean; error?: string }>;
  refetch: () => Promise<void>;
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

const DEFAULT_SETTINGS: ModuleSettings = {
  planningEnabled: true,
  timeRegistrationEnabled: true,
  calendarEnabled: true,
  analyticsEnabled: true,
  roleAccess: defaultRoleAccessAll(),
};

function parseSettings(value: unknown): ModuleSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const row = value as {
    planning?: unknown;
    time_registration?: unknown;
    calendar?: unknown;
    analytics?: unknown;
  };
  const roleAccess = parseRoleAccessFromJson(value);
  return {
    planningEnabled: typeof row.planning === 'boolean' ? row.planning : true,
    timeRegistrationEnabled: typeof row.time_registration === 'boolean' ? row.time_registration : true,
    calendarEnabled: typeof row.calendar === 'boolean' ? row.calendar : true,
    analyticsEnabled: typeof row.analytics === 'boolean' ? row.analytics : true,
    roleAccess,
  };
}

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const { currentTenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ModuleSettings>(DEFAULT_SETTINGS);

  const refetch = useCallback(async () => {
    if (!currentTenantId) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('company_settings')
      .select('value')
      .eq('tenant_id', currentTenantId)
      .eq('key', 'enabled_modules')
      .maybeSingle();
    const row = data as { value?: unknown } | null;
    setSettings(parseSettings(row?.value));
    setLoading(false);
  }, [currentTenantId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateModules = useCallback(
    async (next: ModuleSettings): Promise<{ ok: boolean; error?: string }> => {
      if (!currentTenantId) return { ok: false, error: 'Ingen organisasjon valgt.' };
      const value = {
        planning: next.planningEnabled,
        time_registration: next.timeRegistrationEnabled,
        calendar: next.calendarEnabled,
        analytics: next.analyticsEnabled,
        role_access: {
          planning: next.roleAccess.planning,
          time_registration: next.roleAccess.time_registration,
          calendar: next.roleAccess.calendar,
          analytics: next.roleAccess.analytics,
        },
      };
      const { error } = await supabase.from('company_settings').upsert(
        {
          tenant_id: currentTenantId,
          key: 'enabled_modules',
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,key' }
      );
      if (error) return { ok: false, error: error.message };
      setSettings(next);
      return { ok: true };
    },
    [currentTenantId]
  );

  const contextValue = useMemo<ModulesContextValue>(
    () => ({
      ...settings,
      loading,
      updateModules,
      refetch,
    }),
    [settings, loading, updateModules, refetch]
  );

  return <ModulesContext.Provider value={contextValue}>{children}</ModulesContext.Provider>;
}

export function useModules() {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error('useModules must be used within ModulesProvider');
  return ctx;
}
