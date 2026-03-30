import { supabase } from './supabase';

export async function setCalendarEventOwner(params: {
  tenantId: string;
  eventId: string;
  ownerTeamMemberId: string | null;
  eventSummary: string | null;
  previousOwnerId: string | null;
  /** When true, inserts an in-app notification for the newly assigned member (if any). */
  notifyNewOwner: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('google_calendar_events')
    .update({ owner_team_member_id: params.ownerTeamMemberId, updated_at: new Date().toISOString() })
    .eq('id', params.eventId)
    .eq('tenant_id', params.tenantId);

  if (error) return { ok: false, error: error.message };

  if (
    params.notifyNewOwner &&
    params.ownerTeamMemberId &&
    params.ownerTeamMemberId !== params.previousOwnerId
  ) {
    const { data: tm } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('id', params.ownerTeamMemberId)
      .eq('tenant_id', params.tenantId)
      .maybeSingle();

    if (tm?.user_id) {
      const summary = params.eventSummary?.trim() || '(Uten tittel)';
      await supabase.from('notifications').insert({
        user_id: tm.user_id,
        tenant_id: params.tenantId,
        title: 'Du er satt som eier av en kalenderhendelse',
        body: `${summary} – du er markert som ansvarlig.`,
        link: '/kalender',
      });
    }
  }

  return { ok: true };
}
