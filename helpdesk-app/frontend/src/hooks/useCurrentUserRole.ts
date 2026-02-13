import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../services/supabase';
import type { Role } from '../types/roles';

interface TeamMemberRow {
  id: string;
  role: Role;
  is_active: boolean;
  available_for_email?: boolean;
  available_for_chat?: boolean;
}

export function useCurrentUserRole(): {
  role: Role | null;
  isActive: boolean;
  loading: boolean;
  teamMemberId: string | null;
  availableForEmail: boolean;
  availableForChat: boolean;
  setAvailableForEmail: (v: boolean) => Promise<void>;
  setAvailableForChat: (v: boolean) => Promise<void>;
  refetch: () => Promise<void>;
} {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [role, setRole] = useState<Role | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);
  const [availableForEmail, setAvailableForEmailState] = useState(true);
  const [availableForChat, setAvailableForChatState] = useState(true);

  const refetch = useCallback(async () => {
    if (!user?.id || !currentTenantId) {
      setRole(null);
      setIsActive(true);
      setTeamMemberId(null);
      setAvailableForEmailState(true);
      setAvailableForChatState(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    let row: TeamMemberRow | null = null;
    const { data: fullData, error: fullError } = await supabase
      .from('team_members')
      .select('id, role, is_active, available_for_email, available_for_chat')
      .eq('user_id', user.id)
      .eq('tenant_id', currentTenantId)
      .maybeSingle();
    if (fullError) {
      const { data: minimalData } = await supabase
        .from('team_members')
        .select('id, role, is_active')
        .eq('user_id', user.id)
        .eq('tenant_id', currentTenantId)
        .maybeSingle();
      row = minimalData as TeamMemberRow | null;
    } else {
      row = fullData as TeamMemberRow | null;
    }
    setRole(row?.role ?? null);
    setIsActive(row?.is_active ?? true);
    setTeamMemberId(row?.id ?? null);
    setAvailableForEmailState(row?.available_for_email ?? true);
    setAvailableForChatState(row?.available_for_chat ?? true);
    setLoading(false);
  }, [user?.id, currentTenantId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const setAvailableForEmail = useCallback(
    async (v: boolean) => {
      if (!teamMemberId) return;
      await supabase.from('team_members').update({ available_for_email: v }).eq('id', teamMemberId);
      setAvailableForEmailState(v);
    },
    [teamMemberId]
  );

  const setAvailableForChat = useCallback(
    async (v: boolean) => {
      if (!teamMemberId) return;
      await supabase.from('team_members').update({ available_for_chat: v }).eq('id', teamMemberId);
      setAvailableForChatState(v);
    },
    [teamMemberId]
  );

  return {
    role,
    isActive,
    loading,
    teamMemberId,
    availableForEmail,
    availableForChat,
    setAvailableForEmail,
    setAvailableForChat,
    refetch,
  };
}
