import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Max-Age': '86400',
};

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiry: string | null }> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenRes.ok) throw new Error(await tokenRes.text());
  const data = await tokenRes.json();
  const expiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
  return { accessToken: data.access_token, expiry };
}

/** Same calendar instant can be serialized differently (Z vs +00:00); compare by epoch ms. */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb;
  return a === b;
}

function sameSummary(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim();
}

/** When Calendar API is disabled in the GCP project that owns the OAuth client. */
function friendlyCalendarApiFetchError(body: string): string {
  const t = body.trim();
  if (
    /accessNotConfigured|SERVICE_DISABLED|Calendar API has not been used|calendar-json\.googleapis\.com/i.test(t)
  ) {
    return (
      'Google Calendar API er ikke aktivert for prosjektet som OAuth-klienten (Client ID) tilhører. ' +
      'I Google Cloud Console: velg det prosjektet → APIs & Services → Library → søk «Google Calendar API» → Enable. ' +
      'Vent et par minutter og prøv synk igjen.'
    );
  }
  return `Kunne ikke hente hendelser fra Google Calendar: ${t.slice(0, 800)}`;
}

async function runGoogleCalendarSyncForConnection(
  serviceSupabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<{ success: true; synced: number } | { success: false; error: string }> {
  const { data: calendarSync } = await serviceSupabase
    .from('google_calendar_sync')
    .select('id, refresh_token')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (!calendarSync?.refresh_token) {
    return { success: false, error: 'No active calendar connection found.' };
  }

  const { data: oauthRow } = await serviceSupabase
    .from('tenant_google_oauth')
    .select('client_id, client_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!oauthRow?.client_id?.trim() || !oauthRow?.client_secret?.trim()) {
    return { success: false, error: 'Google OAuth er ikke konfigurert for denne organisasjonen.' };
  }

  const { accessToken, expiry } = await refreshAccessToken(
    calendarSync.refresh_token,
    oauthRow.client_id.trim(),
    oauthRow.client_secret.trim()
  );

  const now = new Date();
  const min = new Date(now);
  min.setDate(min.getDate() - 30);
  const max = new Date(now);
  max.setDate(max.getDate() + 120);

  const eventsRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(min.toISOString())}&timeMax=${encodeURIComponent(max.toISOString())}&maxResults=2500`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!eventsRes.ok) {
    const err = await eventsRes.text();
    return { success: false, error: friendlyCalendarApiFetchError(err) };
  }

  const eventsJson = await eventsRes.json();
  const items = (eventsJson.items ?? []) as Array<Record<string, unknown>>;

  const upserts: Array<Record<string, unknown>> = [];
  for (const ev of items) {
    const id = typeof ev.id === 'string' ? ev.id : null;
    const start = (ev.start as Record<string, unknown> | undefined) ?? {};
    const end = (ev.end as Record<string, unknown> | undefined) ?? {};
    const startAt = typeof start.dateTime === 'string'
      ? start.dateTime
      : typeof start.date === 'string'
        ? `${start.date}T00:00:00.000Z`
        : null;
    const endAt = typeof end.dateTime === 'string'
      ? end.dateTime
      : typeof end.date === 'string'
        ? `${end.date}T23:59:59.999Z`
        : null;
    if (!id || !startAt || !endAt) continue;
    upserts.push({
      tenant_id: tenantId,
      calendar_sync_id: calendarSync.id,
      google_event_id: id,
      summary: typeof ev.summary === 'string' ? ev.summary : null,
      description: typeof ev.description === 'string' ? ev.description : null,
      start_at: startAt,
      end_at: endAt,
      is_all_day: typeof start.date === 'string',
      status: typeof ev.status === 'string' ? ev.status : null,
      raw_json: ev,
      updated_at: new Date().toISOString(),
    });
  }

  const incomingIds = upserts
    .map((u) => (typeof u.google_event_id === 'string' ? u.google_event_id : null))
    .filter((v): v is string => !!v);

  const existingByGoogleId = new Map<
    string,
    {
      id: string;
      google_event_id: string;
      summary: string | null;
      start_at: string;
      end_at: string;
      status: string | null;
      owner_team_member_id: string | null;
      hidden_from_app: boolean | null;
    }
  >();
  if (incomingIds.length > 0) {
    const { data: existingRows } = await serviceSupabase
      .from('google_calendar_events')
      .select('id, google_event_id, summary, start_at, end_at, status, owner_team_member_id, hidden_from_app')
      .eq('tenant_id', tenantId)
      .in('google_event_id', incomingIds);
    for (const row of (existingRows ?? []) as Array<{
      id: string;
      google_event_id: string;
      summary: string | null;
      start_at: string;
      end_at: string;
      status: string | null;
      owner_team_member_id: string | null;
      hidden_from_app: boolean | null;
    }>) {
      existingByGoogleId.set(row.google_event_id, row);
    }
  }

  for (const u of upserts) {
    const gid = typeof u.google_event_id === 'string' ? u.google_event_id : null;
    if (!gid) continue;
    const prev = existingByGoogleId.get(gid);
    if (prev?.owner_team_member_id) {
      u.owner_team_member_id = prev.owner_team_member_id;
    }
    if (prev?.hidden_from_app) {
      u.hidden_from_app = true;
    }
  }

  const newEventSummaries: string[] = [];
  const updatedEventSummaries: string[] = [];
  for (const up of upserts) {
    const gid = typeof up.google_event_id === 'string' ? up.google_event_id : null;
    if (!gid) continue;
    const prev = existingByGoogleId.get(gid);
    const nextSummary = typeof up.summary === 'string' ? up.summary : '(Uten tittel)';
    if (!prev) {
      newEventSummaries.push(nextSummary);
      continue;
    }
    const nextStart = typeof up.start_at === 'string' ? up.start_at : '';
    const nextEnd = typeof up.end_at === 'string' ? up.end_at : '';
    const nextStatus = typeof up.status === 'string' ? up.status : null;
    const changed =
      !sameSummary(prev.summary, typeof up.summary === 'string' ? up.summary : null) ||
      !sameInstant(prev.start_at, nextStart) ||
      !sameInstant(prev.end_at, nextEnd) ||
      (prev.status ?? null) !== (nextStatus ?? null);
    if (changed) updatedEventSummaries.push(nextSummary);
  }

  const changedEventSummaries = [...newEventSummaries, ...updatedEventSummaries];

  if (upserts.length > 0) {
    const { error: upsertError } = await serviceSupabase
      .from('google_calendar_events')
      .upsert(upserts, { onConflict: 'tenant_id,google_event_id' });
    if (upsertError) {
      return { success: false, error: upsertError.message };
    }
  }

  const syncTime = new Date().toISOString();
  await serviceSupabase
    .from('google_calendar_sync')
    .update({ access_token: accessToken, token_expiry: expiry, last_sync_at: syncTime, updated_at: syncTime })
    .eq('id', calendarSync.id);

  // Only notify (and thus trigger optional email webhook) when something actually new or meaningfully changed.
  const hasNewOrUpdatedEvents = newEventSummaries.length > 0 || updatedEventSummaries.length > 0;
  if (hasNewOrUpdatedEvents) {
    const { data: notifySettingRow } = await serviceSupabase
      .from('company_settings')
      .select('value')
      .eq('tenant_id', tenantId)
      .eq('key', 'calendar_notify_settings')
      .maybeSingle();

    const notifyValue = (notifySettingRow as { value?: unknown } | null)?.value as
      | { enabled?: unknown; team_ids?: unknown }
      | undefined;
    const notifyEnabled = !!notifyValue && typeof notifyValue.enabled === 'boolean' && notifyValue.enabled;
    const teamIds = Array.isArray(notifyValue?.team_ids)
      ? (notifyValue?.team_ids as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0)
      : [];

    if (notifyEnabled) {
      const recipientUserIds = new Set<string>();

      if (teamIds.length > 0) {
        const { data: teamMembersData } = await serviceSupabase
          .from('team_member_teams')
          .select('team_member:team_members!inner(user_id, tenant_id, is_active, notify_on_calendar_events)')
          .in('team_id', teamIds)
          .eq('team_members.tenant_id', tenantId)
          .eq('team_members.is_active', true)
          .eq('team_members.notify_on_calendar_events', true);

        for (const row of (teamMembersData ?? []) as Array<{ team_member?: { user_id?: string | null } }>) {
          const uid = row.team_member?.user_id ?? null;
          if (uid) recipientUserIds.add(uid);
        }
      } else {
        const { data: optedIn } = await serviceSupabase
          .from('team_members')
          .select('user_id')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .eq('notify_on_calendar_events', true);

        for (const row of (optedIn ?? []) as Array<{ user_id: string | null }>) {
          if (row.user_id) recipientUserIds.add(row.user_id);
        }
      }

      if (recipientUserIds.size > 0) {
        const parts: string[] = [];
        if (newEventSummaries.length > 0) {
          parts.push(
            newEventSummaries.length === 1
              ? `1 ny: ${newEventSummaries[0]}`
              : `${newEventSummaries.length} nye: ${newEventSummaries.slice(0, 2).join(', ')}${newEventSummaries.length > 2 ? ' …' : ''}`
          );
        }
        if (updatedEventSummaries.length > 0) {
          parts.push(
            updatedEventSummaries.length === 1
              ? `1 oppdatert: ${updatedEventSummaries[0]}`
              : `${updatedEventSummaries.length} oppdaterte`
          );
        }
        const body = parts.join(' · ');
        const title =
          newEventSummaries.length > 0 && updatedEventSummaries.length === 0
            ? newEventSummaries.length === 1
              ? 'Ny kalenderhendelse'
              : `Nye kalenderhendelser (${newEventSummaries.length})`
            : updatedEventSummaries.length > 0 && newEventSummaries.length === 0
              ? updatedEventSummaries.length === 1
                ? 'Kalenderhendelse oppdatert'
                : `Kalenderhendelser oppdatert (${updatedEventSummaries.length})`
              : `Nye og oppdaterte kalenderhendelser (${changedEventSummaries.length})`;

        const inserts = Array.from(recipientUserIds).map((uid) => ({
          user_id: uid,
          tenant_id: tenantId,
          title,
          body,
          link: '/kalender',
        }));
        await serviceSupabase.from('notifications').insert(inserts);
      }
    }
  }

  return { success: true, synced: upserts.length };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const CRON_SECRET = Deno.env.get('CRON_SECRET');
  if (cronSecret && CRON_SECRET && cronSecret === CRON_SECRET) {
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: rows, error } = await serviceSupabase
      .from('google_calendar_sync')
      .select('tenant_id, user_id, refresh_token')
      .eq('is_active', true);
    if (error) {
      console.error('sync-google-calendar-events: failed to list connections', error.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch calendar sync rows' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let totalSynced = 0;
    let okCount = 0;
    for (const row of rows ?? []) {
      if (!row.tenant_id || !row.user_id || !row.refresh_token) continue;
      const result = await runGoogleCalendarSyncForConnection(serviceSupabase, row.tenant_id, row.user_id);
      if (result.success) {
        okCount++;
        totalSynced += result.synced;
      } else {
        console.error('Calendar sync failed for tenant', row.tenant_id, result.error);
      }
    }
    return new Response(
      JSON.stringify({
        success: true,
        connections: (rows ?? []).length,
        completed: okCount,
        synced_events: totalSynced,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { tenant_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const tenantId = body.tenant_id ?? null;
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'Missing tenant_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: membership } = await supabase
    .from('team_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (!membership) {
    return new Response(JSON.stringify({ error: 'Du har ikke tilgang til organisasjonen.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const result = await runGoogleCalendarSyncForConnection(serviceSupabase, tenantId, user.id);
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ success: true, synced: result.synced }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
