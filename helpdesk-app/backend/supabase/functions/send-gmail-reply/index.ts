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

/** Remove duplicate <img> tags with the same src so images don't appear once in the email. */
function deduplicateImagesInHtml(html: string): string {
  const seen = new Set<string>();
  // Match <img ... src="..." ...> or <img src="..."> (flexible attribute order and spacing)
  return html.replace(/<img\s[^>]*?src\s*=\s*["']([^"']*)["'][^>]*>/gi, (match, src) => {
    const key = (typeof src === 'string' ? src : '').trim();
    if (!key || seen.has(key)) return '';
    seen.add(key);
    return match;
  });
}

/** True if HTML contains at least one img tag (after dedupe). */
function htmlHasImages(html: string): boolean {
  return /<img\s[^>]*?src\s*=\s*["']/i.test(html);
}

type InlinePart = { contentId: string; mimeType: string; base64: string };

/**
 * Replace data: URL images in HTML with cid: references and return inline parts.
 * This prevents email clients from showing the same image twice (inline + as attachment).
 */
function inlineDataUrlsAsCid(html: string): { html: string; parts: InlinePart[] } {
  const parts: InlinePart[] = [];
  let index = 0;
  const htmlOut = html.replace(
    /<img\s([^>]*?)src\s*=\s*["'](data:([^;]+);base64,([^"']+))["']([^>]*)>/gi,
    (_match, before, _dataUrl, mimeType, base64, after) => {
      const contentId = `img_${index}_${Date.now()}`;
      index += 1;
      parts.push({
        contentId,
        mimeType: mimeType?.trim() || 'image/png',
        base64: (base64 ?? '').replace(/\s/g, ''),
      });
      return `<img ${before}src="cid:${contentId}"${after}>`;
    }
  );
  return { html: htmlOut, parts };
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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { ticketId: string; message: string; to: string; isInternalNote?: boolean; html?: string; attachment?: { filename: string; mimeType: string; contentBase64: string }; replyAll?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { ticketId, message, to, isInternalNote, html, attachment, replyAll } = body;
  if (!ticketId || !message || !to) {
    return new Response(JSON.stringify({ error: 'Missing ticketId, message, or to' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (isInternalNote) {
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    await serviceSupabase.from('messages').insert({
      ticket_id: ticketId,
      from_email: user.email!,
      from_name: user.user_metadata?.full_name ?? null,
      content: message,
      is_customer: false,
      is_internal_note: true,
    });
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: ticket } = await serviceSupabase
    .from('tickets')
    .select('gmail_thread_id, tenant_id, subject, ticket_number')
    .eq('id', ticketId)
    .single();

  if (!ticket?.gmail_thread_id) {
    const { error: insertErr } = await serviceSupabase.from('messages').insert({
      ticket_id: ticketId,
      tenant_id: ticket.tenant_id,
      from_email: user.email!,
      from_name: user.user_metadata?.full_name ?? null,
      content: message,
      html_content: body.html && body.html.trim() ? body.html.trim() : null,
      is_customer: false,
    });
    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: gmailRow } = await serviceSupabase
    .from('gmail_sync')
    .select('refresh_token, email_address, group_email')
    .eq('user_id', user.id)
    .eq('tenant_id', ticket.tenant_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!gmailRow?.refresh_token) {
    return new Response(JSON.stringify({ error: 'Gmail not connected' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const accessToken = await getAccessToken(gmailRow.refresh_token);

  // Use group inbox (e.g. support@theprep.ai) when set in gmail_sync. Must be configured in Gmail as "Send mail as".
  const row = gmailRow as { refresh_token: string; email_address?: string; group_email?: string | null };
  const groupEmailTrimmed = row.group_email != null && String(row.group_email).trim() !== '' ? String(row.group_email).trim() : null;
  const fromAddress = groupEmailTrimmed
    ? groupEmailTrimmed
    : ((row.email_address?.trim() || user.email || '').trim() || user.email!);
  const fromDisplay = groupEmailTrimmed ? 'thePREP support' : (user.user_metadata?.full_name || fromAddress);
  const fromHeader = `From: ${fromDisplay} <${fromAddress}>`;

  const ticketNumber = (ticket as { ticket_number?: string | null })?.ticket_number?.trim() || '';
  const ticketSubject = (ticket as { subject?: string | null })?.subject?.trim() || '';
  const subjectLine = ticketNumber ? `[${ticketNumber}] ${ticketSubject}`.trim() : (ticketSubject || 'Re: Support');
  const subjectNormalized = subjectLine.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim() || 'Re: Support';

  const plainNormalized = message.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const subjectHeader = `Subject: ${subjectNormalized}`;
  const htmlForEmail = html?.trim() ? deduplicateImagesInHtml(html.trim()) : html;
  const htmlNormalized = htmlForEmail?.trim() ? htmlForEmail.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n') : '';
  const inlineResult = htmlNormalized ? inlineDataUrlsAsCid(htmlNormalized) : null;
  const hasInlineImageParts = (inlineResult?.parts.length ?? 0) > 0;

  function buildHtmlBodyPart(): string {
    if (!htmlNormalized) {
      return [
        'Content-Type: text/plain; charset=utf-8',
        '',
        plainNormalized,
      ].join('\r\n');
    }
    if (hasInlineImageParts && inlineResult) {
      const relatedBoundary = '----=_Related_' + Math.random().toString(36).slice(2) + '_' + Date.now();
      const htmlPart = [
        'Content-Type: text/html; charset=utf-8',
        '',
        inlineResult.html,
      ].join('\r\n');
      const imageParts = inlineResult.parts
        .map(
          (p) =>
            [
              `--${relatedBoundary}`,
              `Content-Type: ${p.mimeType}`,
              'Content-Transfer-Encoding: base64',
              `Content-Disposition: inline; filename="${p.contentId}"`,
              `Content-ID: <${p.contentId}>`,
              '',
              p.base64,
            ].join('\r\n')
        )
        .join('\r\n');
      return [
        `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
        '',
        `--${relatedBoundary}`,
        htmlPart,
        imageParts,
        `--${relatedBoundary}--`,
      ].join('\r\n');
    }
    if (htmlHasImages(htmlNormalized)) {
      return [
        'Content-Type: text/html; charset=utf-8',
        '',
        htmlNormalized,
      ].join('\r\n');
    }
    const altBoundary = '----=_Alt_' + Math.random().toString(36).slice(2) + '_' + Date.now();
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
  }

  let raw: string;
  if (attachment?.filename && attachment?.contentBase64) {
    const bodyPart = buildHtmlBodyPart();
    const mixedBoundary = '----=_Mixed_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    const mimeType = attachment.mimeType || 'application/octet-stream';
    const base64Content = attachment.contentBase64.replace(/\r?\n/g, '');
    raw = [
      fromHeader,
      `To: ${to}`,
      subjectHeader,
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
  } else if (htmlForEmail && htmlForEmail.trim()) {
    if (hasInlineImageParts) {
      raw = [
        fromHeader,
        `To: ${to}`,
        subjectHeader,
        'MIME-Version: 1.0',
        buildHtmlBodyPart(),
      ].join('\r\n');
    } else if (htmlHasImages(htmlNormalized)) {
      raw = [
        fromHeader,
        `To: ${to}`,
        subjectHeader,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        htmlNormalized,
      ].join('\r\n');
    } else {
      const boundary = '----=_Part_' + Math.random().toString(36).slice(2) + '_' + Date.now();
      raw = [
        fromHeader,
        `To: ${to}`,
        subjectHeader,
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
    }
  } else {
    raw = [
      fromHeader,
      `To: ${to}`,
      subjectHeader,
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
    body: JSON.stringify({
      raw: encoded,
      threadId: ticket.gmail_thread_id,
    }),
  });

  if (!sendRes.ok) {
    return new Response(JSON.stringify({ error: await sendRes.text() }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await serviceSupabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);

  // Message is inserted by the frontend after success so it appears in the conversation with correct html_content
  return new Response(JSON.stringify({ success: true, from_email: fromAddress }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
