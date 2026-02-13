import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

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
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser(token);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { invitation_code?: string; invite_link?: string } = {};
  try {
    if (req.body) body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const invitationCode = body.invitation_code?.trim();
  const inviteLink = body.invite_link?.trim();
  if (!invitationCode || !inviteLink) {
    return new Response(JSON.stringify({ error: 'invitation_code and invite_link are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAnon = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  const { data: invData, error: rpcError } = await supabaseAnon.rpc('get_invitation_by_code', {
    p_code: invitationCode,
  });

  if (rpcError || !invData?.ok) {
    return new Response(
      JSON.stringify({ error: (invData as { error?: string })?.error ?? rpcError?.message ?? 'Invitation not found' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const inv = invData as { tenant_id?: string; tenant_name?: string; email?: string; role?: string; name?: string };
  const toEmail = inv.email;
  const tenantName = inv.tenant_name ?? 'the team';
  const role = inv.role ?? 'agent';
  const tenantId = inv.tenant_id;
  if (!toEmail) {
    return new Response(JSON.stringify({ error: 'Invitation has no email' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const subject = `Du er invitert til ${tenantName}`;
  const plainText = `Hei${inv.name ? ` ${inv.name}` : ''},\n\nDu er invitert til å bli med i ${tenantName} som ${role}.\n\nKlikk lenken under for å godta invitasjonen og få tilgang:\n\n${inviteLink}\n\nLenken utløper om 7 dager.\n\nHvis du ikke ba om denne invitasjonen, kan du se bort fra denne e-posten.`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.5; color: #333;">
  <p>Hei${inv.name ? ` ${inv.name}` : ''},</p>
  <p>Du er invitert til å bli med i <strong>${tenantName}</strong> som <strong>${role}</strong>.</p>
  <p>Klikk lenken under for å godta invitasjonen og få tilgang:</p>
  <p><a href="${inviteLink}" style="color: #2563eb;">${inviteLink}</a></p>
  <p>Lenken utløper om 7 dager.</p>
  <p>Hvis du ikke ba om denne invitasjonen, kan du se bort fra denne e-posten.</p>
</body>
</html>`;

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  if (tenantId && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    const { data: gmailRow } = await serviceSupabase
      .from('gmail_sync')
      .select('refresh_token, email_address, group_email')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (gmailRow?.refresh_token) {
      try {
        const accessToken = await getAccessToken(gmailRow.refresh_token);
        const row = gmailRow as { refresh_token: string; email_address?: string; group_email?: string | null };
        const fromAddress = (row.group_email?.trim() || row.email_address || user.email || '').trim() || user.email!;
        const fromHeader = `From: ${fromAddress}`;
        const plainNormalized = plainText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
        const subjectLine = subject.replace(/\r\n/g, ' ').replace(/\n/g, ' ');
        const htmlNormalized = html.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
        const boundary = '----=_Part_' + Math.random().toString(36).slice(2) + '_' + Date.now();
        const raw = [
          fromHeader,
          `To: ${toEmail}`,
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
        const encoded = encodeBase64Url(raw);

        const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded }),
        });

        if (sendRes.ok) {
          return new Response(JSON.stringify({ sent: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch {
        // Fall through to error response
      }
    }
  }

  return new Response(
    JSON.stringify({
      sent: false,
      error: 'E-post kunne ikke sendes. Koble til Gmail for denne tenanten (Innstillinger → Gmail), så sendes invitasjonen derfra. Du kan også kopiere invitasjonslenken og sende den manuelt.',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
