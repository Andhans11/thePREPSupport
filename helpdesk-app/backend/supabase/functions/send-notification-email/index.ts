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

/** Build multipart/alternative (plain + HTML) raw message. */
function buildNotificationEmail(params: {
  fromHeader: string;
  to: string;
  subjectEncoded: string;
  title: string;
  bodyText: string;
  ticketLink: string;
}): string {
  const { fromHeader, to, subjectEncoded, title, bodyText, ticketLink } = params;
  const boundary = 'np_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  const plain = [title, bodyText ? '\n' + bodyText : '', '', `Åpne i appen: ${ticketLink}`].join('\n').trim();
  const html = `<!DOCTYPE html>
<html lang="no">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;background-color:#f4f4f5;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:24px 28px;">
          <span style="font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;">thePREP Support</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;line-height:1.3;">${escapeHtml(title)}</h1>
          ${bodyText ? `<div style="font-size:15px;line-height:1.6;color:#4b5563;margin-bottom:24px;">${escapeHtml(bodyText)}</div>` : ''}
          <a href="${escapeHtml(ticketLink)}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff!important;text-decoration:none;font-size:15px;font-weight:500;border-radius:8px;">Åpne i appen</a>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
          Denne e-posten ble sendt fra thePREP Support. Du kan styre varsler under Innstillinger → Brukere.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

  let body: { record?: { id?: string; user_id?: string; tenant_id?: string; title?: string; body?: string | null; link?: string | null } } = {};
  try {
    if (req.body) body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const record = body.record ?? body;
  const notificationId = record.id ?? (body as { id?: string }).id;
  const userId = record.user_id ?? (body as { user_id?: string }).user_id;
  const tenantId = record.tenant_id ?? (body as { tenant_id?: string }).tenant_id;
  const title = record.title ?? (body as { title?: string }).title ?? '';
  const bodyText = record.body ?? (body as { body?: string }).body ?? '';
  const link = record.link ?? (body as { link?: string }).link;

  if (!userId || !tenantId) {
    return new Response(JSON.stringify({ error: 'Missing user_id or tenant_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: member, error: memberErr } = await serviceSupabase
    .from('team_members')
    .select('id, email, email_on_notifications')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (memberErr || !member) {
    return new Response(JSON.stringify({ success: true, sent: 0, reason: 'member_not_found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const wantEmail = (member as { email_on_notifications?: boolean }).email_on_notifications === true;
  const email = (member as { email?: string }).email?.trim();
  if (!wantEmail || !email) {
    return new Response(JSON.stringify({ success: true, sent: 0, reason: 'email_disabled_or_missing' }), {
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
      JSON.stringify({ error: 'Ingen e-postkonto er koblet til for denne organisasjonen.' }),
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

  const appUrlEnv = (Deno.env.get('APP_URL') || '').trim();
  const baseUrl = (appUrlEnv && appUrlEnv !== 'APP_URL' && appUrlEnv.startsWith('http') ? appUrlEnv : 'https://the-prep-support.vercel.app').replace(/\/$/, '');
  const ticketLink = link?.startsWith('/') ? `${baseUrl}${link}` : (link || baseUrl);
  const row = gmailRow as { email_address?: string; group_email?: string | null };
  const fromAddress = (row.group_email?.trim() || row.email_address?.trim() || '').trim() || row.email_address || '';
  const fromDisplay = row.group_email?.trim() ? 'thePREP support' : 'Support';

  const subjectLine = title.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim().slice(0, 200);
  const fromHeader = `From: ${fromDisplay} <${fromAddress}>`;
  const raw = buildNotificationEmail({
    fromHeader,
    to: email,
    subjectEncoded: encodeSubjectUtf8(subjectLine),
    title,
    bodyText,
    ticketLink,
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

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    console.error('send-notification-email: Gmail API send failed', errText);
    return new Response(
      JSON.stringify({ error: 'Failed to send email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, sent: 1, notification_id: notificationId }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
