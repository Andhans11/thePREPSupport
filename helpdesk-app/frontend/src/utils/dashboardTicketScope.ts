import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../types/roles';

/**
 * Team IDs the user belongs to or leads (same as ticket «Team» view).
 */
export async function fetchDashboardScopedTeamIds(
  supabase: Pick<SupabaseClient, 'from'>,
  tenantId: string,
  userId: string | null
): Promise<string[]> {
  if (!userId) return [];
  const { data: member } = await supabase
    .from('team_members')
    .select('id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!member?.id) return [];
  const [memberTeamsRes, managedRes] = await Promise.all([
    supabase.from('team_member_teams').select('team_id').eq('team_member_id', member.id),
    supabase.from('teams').select('id').eq('manager_team_member_id', member.id).eq('tenant_id', tenantId),
  ]);
  const fromMember = (memberTeamsRes.data ?? []).map((r: { team_id: string }) => r.team_id);
  const fromManaged = (managedRes.data ?? []).map((r: { id: string }) => r.id);
  return [...new Set([...fromMember, ...fromManaged])];
}

/**
 * PostgREST `or` filter: tickets assigned to user OR in one of their teams.
 * Returns null when the dashboard should show full-tenant metrics (admin, viewer).
 */
export function ticketsOrFilterForDashboardRole(
  role: Role | null,
  userId: string | null | undefined,
  teamIds: string[]
): string | null {
  if (!userId) return null;
  if (role === 'admin' || role === 'viewer') return null;
  if (role !== 'agent' && role !== 'manager') return null;
  const parts: string[] = [`assigned_to.eq.${userId}`];
  if (teamIds.length > 0) {
    parts.push(`team_id.in.(${teamIds.join(',')})`);
  }
  return parts.join(',');
}
