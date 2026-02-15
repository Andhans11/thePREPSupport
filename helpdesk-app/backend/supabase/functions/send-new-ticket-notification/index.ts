import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.access_token;
}

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

  let body: { ticket_id: string; tenant_id?: string | null; app_url?: string | null } = {};
  try {
    if (req.body) body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { ticket_id: ticketId, tenant_id: bodyTenantId, app_url: appUrl } = body;
  if (!ticketId?.trim()) {
    return new Response(JSON.stringify({ error: 'Missing ticket_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: ticket, error: ticketErr } = await serviceSupabase
    .from('tickets')
    .select('id, tenant_id, ticket_number, subject, customer_id')
    .eq('id', ticketId.trim())
    .single();

  if (ticketErr || !ticket) {
    return new Response(JSON.stringify({ error: 'Ticket not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const tenantId = bodyTenantId ?? (ticket as { tenant_id?: string }).tenant_id;
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'Could not determine tenant' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (serviceRoleKey && token === serviceRoleKey) {
      // Server-side call (e.g. from sync-gmail-emails cron): allow without user check
    } else {
      const userSupabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user } } = await userSupabase.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: member } = await serviceSupabase
        .from('team_members')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      if (!member) {
        return new Response(JSON.stringify({ error: 'Access denied to this tenant' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  }

  const { data: subscribers } = await serviceSupabase
    .from('team_members')
    .select('id, email, name')
    .eq('tenant_id', tenantId)
    .eq('email_on_new_ticket', true)
    .not('email', 'is', null)
    .not('user_id', 'is', null);

  const list = (subscribers ?? []) as { id: string; email: string; name?: string | null }[];
  const toSend = list.filter((r) => r.email?.trim());
  if (toSend.length === 0) {
    return new Response(JSON.stringify({ success: true, sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: gmailRow } = await serviceSupabase
    .from('gmail_sync')
    .select('refresh_token, email_address, group_email')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!gmailRow?.refresh_token) {
    return new Response(
      JSON.stringify({ error: 'Ingen e-postkonto er koblet til for denne organisasjonen. Konfigurer Gmail under E-post innbokser.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: oauthRow } = await serviceSupabase
    .from('tenant_google_oauth')
    .select('client_id, client_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!oauthRow?.client_id?.trim() || !oauthRow?.client_secret?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Google OAuth er ikke konfigurert for denne organisasjonen.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const accessToken = await getAccessToken(
    gmailRow.refresh_token,
    oauthRow.client_id.trim(),
    oauthRow.client_secret.trim()
  );

  const row = gmailRow as { email_address?: string; group_email?: string | null };
  const fromAddress = (row.group_email?.trim() || row.email_address?.trim() || '').trim() || row.email_address || '';
  const fromDisplay = row.group_email?.trim() ? 'thePREP support' : 'Support';

  const ticketNumber = (ticket as { ticket_number?: string | null })?.ticket_number?.trim() || '';
  const subject = (ticket as { subject?: string | null })?.subject?.trim() || '(Ingen emne)';
  const subjectLine = ticketNumber ? `Ny sak: ${ticketNumber} – ${subject}` : `Ny sak: ${subject}`;
  const subjectNormalized = subjectLine.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();

  const baseUrl = (appUrl?.trim() || Deno.env.get('APP_URL') || '').replace(/\/$/, '') || 'https://app.theprep.ai';
  const ticketLink = `${baseUrl}/tickets?view=all&select=${(ticket as { id: string }).id}`;
  const plainBody = [
    'En ny sak er opprettet i support-helpdesken.',
    '',
    `Saksnummer: ${ticketNumber || '–'}`,
    `Emne: ${subject}`,
    '',
    `Åpne saken her: ${ticketLink}`,
  ].join('\r\n');

  const fromHeader = `From: ${fromDisplay} <${fromAddress}>`;
  const contentType = 'Content-Type: text/plain; charset=utf-8';
  let sent = 0;
  for (const rec of toSend) {
    const to = rec.email.trim();
    const raw = [fromHeader, `To: ${to}`, `Subject: ${subjectNormalized}`, contentType, '', plainBody].join('\r\n');
    const encoded = encodeBase64Url(raw);
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });
    if (sendRes.ok) sent++;
  }

  return new Response(JSON.stringify({ success: true, sent }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
