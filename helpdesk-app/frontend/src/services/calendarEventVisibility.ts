import { supabase } from './supabase';

export async function setCalendarEventHiddenFromApp(params: {
  tenantId: string;
  eventId: string;
  hidden: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('google_calendar_events')
    .update({ hidden_from_app: params.hidden, updated_at: new Date().toISOString() })
    .eq('id', params.eventId)
    .eq('tenant_id', params.tenantId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
