import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
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
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { to: string; subject: string; messagePlain: string; messageHtml?: string; attachment?: { filename: string; mimeType: string; contentBase64: string } };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { to, subject, messagePlain, messageHtml, attachment } = body;
  if (!to || !subject || !messagePlain) {
    return new Response(JSON.stringify({ error: 'Missing to, subject, or messagePlain' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: gmailRow } = await supabase
    .from('gmail_sync')
    .select('refresh_token, email_address, group_email')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!gmailRow?.refresh_token) {
    return new Response(JSON.stringify({ error: 'Gmail not connected' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const accessToken = await getAccessToken(gmailRow.refresh_token);

  const row = gmailRow as { refresh_token: string; email_address?: string; group_email?: string | null };
  const fromAddress = (row.group_email?.trim() || row.email_address || user.email || '').trim() || user.email!;
  const fromHeader = `From: ${fromAddress}`;

  const plainNormalized = messagePlain.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const subjectLine = subject.replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  let raw: string;
  if (attachment?.filename && attachment?.contentBase64) {
    const altBoundary = '----=_Alt_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    const bodyPart = messageHtml && messageHtml.trim()
      ? (() => {
          const htmlNormalized = messageHtml.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
          return [
            `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
            '',
            `--${altBoundary}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            plainNormalized,
            `--${altBoundary}`,
            'Content-Type: text/html; charset=utf-8',
            '',
            htmlNormalized,
            `--${altBoundary}--`,
          ].join('\r\n');
        })()
      : [
          'Content-Type: text/plain; charset=utf-8',
          '',
          plainNormalized,
        ].join('\r\n');
    const mixedBoundary = '----=_Mixed_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    const mimeType = attachment.mimeType || 'application/octet-stream';
    const base64Content = attachment.contentBase64.replace(/\r?\n/g, '');
    raw = [
      fromHeader,
      `To: ${to}`,
      `Subject: ${subjectLine}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      '',
      `--${mixedBoundary}`,
      bodyPart,
      `--${mixedBoundary}`,
      `Content-Type: ${mimeType}; name="${attachment.filename.replace(/"/g, '\\"')}"`,
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment',
      '',
      base64Content,
      `--${mixedBoundary}--`,
    ].join('\r\n');
  } else if (messageHtml && messageHtml.trim()) {
    const boundary = '----=_Part_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    const htmlNormalized = messageHtml.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    raw = [
      fromHeader,
      `To: ${to}`,
      `Subject: ${subjectLine}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      plainNormalized,
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlNormalized,
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    raw = [
      fromHeader,
      `To: ${to}`,
      `Subject: ${subjectLine}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      plainNormalized,
    ].join('\r\n');
  }
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
    return new Response(JSON.stringify({ error: await sendRes.text() }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
