import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../services/supabase';
import type { Role } from '../types/roles';
import type { AvailabilityStatus } from '../types/availability';

interface TeamMemberRow {
  id: string;
  role: Role;
  is_active: boolean;
  available_for_email?: boolean;
  availability_status?: string | null;
}

export function useCurrentUserRole(): {
  role: Role | null;
  isActive: boolean;
  loading: boolean;
  teamMemberId: string | null;
  availableForEmail: boolean;
  availabilityStatus: AvailabilityStatus;
  setAvailableForEmail: (v: boolean) => Promise<void>;
  setAvailabilityStatus: (s: AvailabilityStatus) => Promise<void>;
  refetch: () => Promise<void>;
} {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [role, setRole] = useState<Role | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);
  const [availableForEmail, setAvailableForEmailState] = useState(true);
  const [availabilityStatus, setAvailabilityStatusState] = useState<AvailabilityStatus>('active');

  const refetch = useCallback(async () => {
    if (!user?.id || !currentTenantId) {
      setRole(null);
      setIsActive(true);
      setTeamMemberId(null);
      setAvailableForEmailState(true);
      setAvailabilityStatusState('active');
      setLoading(false);
      return;
    }
    setLoading(true);
    let row: TeamMemberRow | null = null;
    const { data: fullData, error: fullError } = await supabase
      .from('team_members')
      .select('id, role, is_active, available_for_email, availability_status')
      .eq('user_id', user.id)
      .eq('tenant_id', currentTenantId)
      .maybeSingle();
    if (fullError) {
      const { data: minimalData } = await supabase
        .from('team_members')
        .select('id, role, is_active, available_for_email')
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
    const status = row?.availability_status as AvailabilityStatus | undefined;
    setAvailabilityStatusState(
      status && ['active', 'away', 'busy', 'offline'].includes(status) ? status : 'active'
    );
    setLoading(false);
  }, [user?.id, currentTenantId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
  useEffect(() => {
    if (!teamMemberId) return;
    const tick = () => {
      supabase
        .from('team_members')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', teamMemberId)
        .then(() => {});
    };
    tick();
    const id = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [teamMemberId]);

  const setAvailableForEmail = useCallback(
    async (v: boolean) => {
      if (!teamMemberId) return;
      const status: AvailabilityStatus = v ? 'active' : 'away';
      await supabase
        .from('team_members')
        .update({ available_for_email: v, availability_status: status })
        .eq('id', teamMemberId);
      setAvailableForEmailState(v);
      setAvailabilityStatusState(status);
    },
    [teamMemberId]
  );

  const setAvailabilityStatus = useCallback(
    async (s: AvailabilityStatus) => {
      if (!teamMemberId) return;
      await supabase.from('team_members').update({ availability_status: s }).eq('id', teamMemberId);
      setAvailabilityStatusState(s);
      setAvailableForEmailState(s === 'active');
    },
    [teamMemberId]
  );

  return {
    role,
    isActive,
    loading,
    teamMemberId,
    availableForEmail,
    availabilityStatus,
    setAvailableForEmail,
    setAvailabilityStatus,
    refetch,
  };
}
