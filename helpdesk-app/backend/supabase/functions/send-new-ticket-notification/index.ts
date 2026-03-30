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

/** Encode subject for RFC 2047 UTF-8 so non-ASCII displays correctly. */
function encodeSubjectUtf8(subject: string): string {
  const utf8Bytes = new TextEncoder().encode(subject);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) binary += String.fromCharCode(utf8Bytes[i]);
  const base64 = btoa(binary).replace(/\n/g, '');
  return `=?UTF-8?B?${base64}?=`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function applyTemplateVars(content: string, vars: Record<string, string>): string {
  let out = content;
  for (const [key, value] of Object.entries(vars)) {
    const safe = value ?? '';
    out = out.replace(new RegExp(`\\{\\{\\s*${key.replace('.', '\\.')}\\s*\\}\\}`, 'g'), safe);
  }
  return out;
}

/** Build multipart/alternative (plain + HTML) raw message for new ticket. */
function buildNewTicketEmail(params: {
  fromHeader: string;
  to: string;
  subjectEncoded: string;
  plainBody: string;
  htmlBody: string;
}): string {
  const { fromHeader, to, subjectEncoded, plainBody, htmlBody } = params;
  const boundary = 'np_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  const plain = plainBody;
  const html = htmlBody;
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    plain,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${boundary}--`,
  ].join('\r\n');
  return [fromHeader, `To: ${to}`, `Subject: ${subjectEncoded}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '', parts].join('\r\n');
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
    .select('id, tenant_id, ticket_number, subject, customer_id, team_id')
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
  const recipients = new Map<string, { id: string; email: string; name?: string | null }>();
  for (const row of list) {
    const email = row.email?.trim();
    if (!email) continue;
    recipients.set(email.toLowerCase(), { ...row, email });
  }

  const teamId = (ticket as { team_id?: string | null }).team_id;
  if (teamId) {
    const { data: team } = await serviceSupabase
      .from('teams')
      .select('id, email_on_new_ticket_to_members')
      .eq('id', teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if ((team as { email_on_new_ticket_to_members?: boolean } | null)?.email_on_new_ticket_to_members) {
      const { data: teamRows } = await serviceSupabase
        .from('team_member_teams')
        .select('team_member:team_members!inner(id, email, name, is_active)')
        .eq('team_id', teamId)
        .eq('team_members.tenant_id', tenantId)
        .eq('team_members.is_active', true);

      const members = (teamRows ?? []) as Array<{
        team_member?: { id: string; email?: string | null; name?: string | null; is_active?: boolean };
      }>;
      for (const row of members) {
        const member = row.team_member;
        const email = member?.email?.trim();
        if (!email) continue;
        recipients.set(email.toLowerCase(), { id: member.id, email, name: member.name ?? null });
      }
    }
  }

  const toSend = Array.from(recipients.values());
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
  const teamName = teamId
    ? ((await serviceSupabase.from('teams').select('name').eq('id', teamId).eq('tenant_id', tenantId).maybeSingle()).data as { name?: string } | null)?.name ?? ''
    : '';

  const appUrlEnv = (appUrl?.trim() || Deno.env.get('APP_URL') || '').trim();
  const baseUrl = (appUrlEnv && appUrlEnv !== 'APP_URL' && appUrlEnv.startsWith('http') ? appUrlEnv : 'https://the-prep-support.vercel.app').replace(/\/$/, '');
  const ticketLink = `${baseUrl}/tickets?view=all&select=${(ticket as { id: string }).id}`;
  const { data: companySettings } = await serviceSupabase
    .from('company_settings')
    .select('key, value')
    .eq('tenant_id', tenantId)
    .in('key', ['company_logo_url', 'company_info']);
  const companyMap = (companySettings ?? []).reduce(
    (acc: Record<string, unknown>, r: { key: string; value: unknown }) => {
      acc[r.key] = r.value;
      return acc;
    },
    {}
  );
  const companyLogoUrl = typeof companyMap.company_logo_url === 'string' ? companyMap.company_logo_url.trim() : '';
  const companyName =
    companyMap.company_info && typeof companyMap.company_info === 'object' && typeof (companyMap.company_info as Record<string, unknown>).name === 'string'
      ? String((companyMap.company_info as Record<string, unknown>).name).trim()
      : 'Support';

  const { data: tmplRow } = await serviceSupabase
    .from('templates')
    .select('subject, content')
    .eq('tenant_id', tenantId)
    .eq('category', 'new_ticket_notification')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const tmpl = (tmplRow as { subject?: string | null; content?: string | null } | null) ?? null;
  const vars = {
    ticket_number: ticketNumber || '—',
    'ticket.subject': subject,
    ticket_link: ticketLink,
    'team.name': teamName || '—',
    'company.name': companyName || 'Support',
    'company.logo_url': companyLogoUrl,
  };
  const defaultSubject = ticketNumber ? `Ny sak: ${ticketNumber} – ${subject}` : `Ny sak: ${subject}`;
  const subjectLine = applyTemplateVars((tmpl?.subject?.trim() || defaultSubject), vars);
  const subjectNormalized = subjectLine.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
  const defaultHtml = `<!DOCTYPE html>
<html lang="no">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;color:#1f2937;">
  <div style="margin-bottom:12px;">${companyLogoUrl ? `<img src="{{company.logo_url}}" alt="${escapeHtml(companyName || 'Support')}" style="max-height:42px;width:auto;">` : `<strong>{{company.name}}</strong>`}</div>
  <h2>En ny sak er opprettet i support-helpdesken.</h2>
  <p><strong>Saksnummer:</strong> ${escapeHtml(vars.ticket_number)}</p>
  <p><strong>Emne:</strong> ${escapeHtml(vars['ticket.subject'])}</p>
  <p><strong>Team:</strong> ${escapeHtml(vars['team.name'])}</p>
  <p><a href="${escapeHtml(ticketLink)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#ffffff!important;text-decoration:none;font-weight:600;">Åpne saken</a></p>
</body>
</html>`;
  const htmlBody = applyTemplateVars((tmpl?.content?.trim() || defaultHtml), vars);
  const plainBody = stripHtmlToPlain(htmlBody) || [
    'En ny sak er opprettet i support-helpdesken.',
    '',
    `Saksnummer: ${vars.ticket_number}`,
    `Emne: ${vars['ticket.subject']}`,
    `Team: ${vars['team.name']}`,
    '',
    `Åpne saken her: ${ticketLink}`,
  ].join('\n');
  const fromHeader = `From: ${fromDisplay} <${fromAddress}>`;
  let sent = 0;
  for (const rec of toSend) {
    const to = rec.email.trim();
    const raw = buildNewTicketEmail({
      fromHeader,
      to,
      subjectEncoded: encodeSubjectUtf8(subjectNormalized),
      plainBody,
      htmlBody,
    });
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
