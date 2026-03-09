import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Max-Age': '86400',
};

/** 1 full working day in hours (configurable; 24h default). */
const UNASSIGNED_HOURS_BEFORE_AUTO_ASSIGN = 24;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  const cronHeader = req.headers.get('x-cron-secret');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const allowedByCron = cronSecret && cronHeader === cronSecret;
  const allowedByServiceRole = serviceRoleKey && authHeader?.startsWith('Bearer ') && authHeader.slice(7) === serviceRoleKey;
  if (!allowedByCron && !allowedByServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - UNASSIGNED_HOURS_BEFORE_AUTO_ASSIGN);
  const cutoffIso = cutoff.toISOString();

  const { data: tickets, error: fetchErr } = await serviceSupabase
    .from('tickets')
    .select('id, team_id, tenant_id')
    .is('assigned_to', null)
    .not('team_id', 'is', null)
    .in('status', ['open', 'pending'])
    .lt('created_at', cutoffIso);

  if (fetchErr) {
    console.error('auto-assign: failed to fetch tickets', fetchErr.message);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch tickets' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const list = (tickets ?? []) as { id: string; team_id: string; tenant_id: string }[];
  let assigned = 0;

  for (const ticket of list) {
    const { data: team } = await serviceSupabase
      .from('teams')
      .select('manager_team_member_id')
      .eq('id', ticket.team_id)
      .eq('tenant_id', ticket.tenant_id)
      .single();

    const managerTmId = (team as { manager_team_member_id?: string | null } | null)?.manager_team_member_id;
    if (!managerTmId) continue;

    const { data: tm } = await serviceSupabase
      .from('team_members')
      .select('user_id')
      .eq('id', managerTmId)
      .not('user_id', 'is', null)
      .single();

    const userId = (tm as { user_id?: string } | null)?.user_id;
    if (!userId) continue;

    const { error: updateErr } = await serviceSupabase
      .from('tickets')
      .update({ assigned_to: userId, updated_at: new Date().toISOString() })
      .eq('id', ticket.id);

    if (!updateErr) assigned++;
  }

  return new Response(
    JSON.stringify({ success: true, processed: list.length, assigned }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
