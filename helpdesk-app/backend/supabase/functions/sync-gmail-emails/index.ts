import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Max-Age': '86400',
};

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

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function base64UrlToUint8Array(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getPartFilename(part: { filename?: string; headers?: { name: string; value: string }[] }): string | null {
  if (part.filename && part.filename.trim()) return part.filename.trim();
  const disp = part.headers?.find((h) => h.name.toLowerCase() === 'content-disposition')?.value ?? '';
  const m = /filename\s*=\s*["']?([^"'\s;]+)/i.exec(disp);
  if (m) return m[1].trim();
  const ct = part.headers?.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '';
  const nameMatch = /name\s*=\s*["']?([^"'\s;]+)/i.exec(ct);
  if (nameMatch) return nameMatch[1].trim();
  return null;
}

/** Flatten MIME part tree so inline images inside multipart/related (or nested) are included. */
function flattenParts(
  payload: { parts?: unknown[]; body?: { data?: string; attachmentId?: string } } | null,
  acc: unknown[] = []
): unknown[] {
  if (!payload) return acc;
  const parts = payload.parts ?? (payload.body ? [payload] : []);
  for (const part of parts) {
    const p = part as { parts?: unknown[]; body?: { data?: string; attachmentId?: string }; mimeType?: string };
    if (p.parts && Array.isArray(p.parts) && p.parts.length > 0) {
      flattenParts({ parts: p.parts }, acc);
    } else {
      acc.push(part);
    }
  }
  return acc;
}

type AttachmentPart = { filename: string; mimeType: string; attachmentId?: string; inlineData?: string };

async function fetchAndUploadAttachments(
  accessToken: string,
  gmailMessageId: string,
  parts: AttachmentPart[],
  tenantId: string,
  ticketId: string,
  messageId: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ storage_path: string; filename: string; mime_type: string; size: number }[]> {
  const bucket = 'ticket-attachments';
  const results: { storage_path: string; filename: string; mime_type: string; size: number }[] = [];
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'attachment';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    let bytes: Uint8Array;
    if (part.attachmentId) {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}/attachments/${part.attachmentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      bytes = base64UrlToUint8Array(data.data ?? '');
    } else if (part.inlineData) {
      bytes = base64UrlToUint8Array(part.inlineData);
    } else {
      continue;
    }
    const ext = part.filename.includes('.') ? part.filename.slice(part.filename.lastIndexOf('.')) : '';
    const baseName = sanitize(part.filename.replace(/\.[^.]+$/, '') || 'file');
    const filename = baseName + ext;
    const storagePath = `${tenantId}/${ticketId}/${messageId}/${filename}`;
    const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
      contentType: part.mimeType || 'application/octet-stream',
      upsert: true,
    });
    if (!error) results.push({ storage_path: storagePath, filename: part.filename, mime_type: part.mimeType || 'application/octet-stream', size: bytes.length });
  }
  return results;
}

type GmailSyncRow = {
  user_id: string;
  tenant_id: string;
  refresh_token: string;
  group_email?: string | null;
  email_address?: string | null;
};

function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Replace placeholders in ticket-received template. Supports {{ticket_number}}, {{customer.name}}, {{customer.email}}, {{ticket.subject}}. */
function compileTicketReceivedTemplate(
  content: string,
  ctx: { ticket_number: string; customer_name: string; customer_email: string; ticket_subject: string }
): string {
  return content
    .replace(/\{\{ticket_number\}\}/g, ctx.ticket_number)
    .replace(/\{\{customer\.name\}\}/g, ctx.customer_name)
    .replace(/\{\{customer\.email\}\}/g, ctx.customer_email)
    .replace(/\{\{ticket\.subject\}\}/g, ctx.ticket_subject);
}

async function sendTicketReceivedReply(
  accessToken: string,
  threadId: string,
  toEmail: string,
  subjectLine: string,
  bodyPlain: string,
  fromAddress: string,
  fromDisplay: string
): Promise<boolean> {
  const fromHeader = `From: ${fromDisplay} <${fromAddress}>`;
  const plainNormalized = bodyPlain.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const raw = [
    fromHeader,
    `To: ${toEmail}`,
    `Subject: ${subjectLine.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim()}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    plainNormalized,
  ].join('\r\n');
  const encoded = encodeBase64Url(raw);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded, threadId }),
  });
  return res.ok;
}

async function runSyncForGmailRow(
  serviceSupabase: ReturnType<typeof createClient>,
  gmailRow: GmailSyncRow
): Promise<number> {
  const tenantIdForData = gmailRow.tenant_id;
  const accessToken = await getAccessToken(gmailRow.refresh_token);

  const { data: ticketReceivedSettings } = await serviceSupabase
    .from('company_settings')
    .select('key, value')
    .eq('tenant_id', tenantIdForData)
    .in('key', ['ticket_received_subject', 'ticket_received_content']);
  const settingsMap = (ticketReceivedSettings ?? []).reduce(
    (acc: Record<string, string>, r: { key: string; value: unknown }) => {
      const v = r.value != null ? (typeof r.value === 'string' ? r.value : String(r.value)) : '';
      acc[r.key] = v;
      return acc;
    },
    {}
  );
  const ticketReceivedSubject = (settingsMap['ticket_received_subject'] ?? '').trim();
  const ticketReceivedContent = (settingsMap['ticket_received_content'] ?? '').trim();
  const sendTicketReceivedReplyEnabled = ticketReceivedContent.length > 0;

  const groupEmail = gmailRow.group_email ?? null;
  const groupEmailTrimmed = groupEmail != null && String(groupEmail).trim() !== '' ? String(groupEmail).trim() : null;
  // Include unread and recent (last 30 days) so read emails still create tickets; we skip threads we already have
  const query = groupEmail
    ? `to:${groupEmail.replace(/"/g, '')} (is:unread OR newer_than:30d)`
    : '(is:unread OR newer_than:30d) in:inbox';
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    return new Response(JSON.stringify({ error: 'Gmail list failed', details: await listRes.text() }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const list = await listRes.json();
  const messages = (list.messages ?? []) as { id: string; threadId: string }[];
  let created = 0;

  for (const msg of messages) {
    const fullRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!fullRes.ok) continue;
    const full = await fullRes.json();
    const headers = (full.payload?.headers ?? []) as { name: string; value: string }[];
    const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
    const from = getHeader('From');
    const subject = getHeader('Subject');
    const fromEmail = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
    const fromName = from.replace(/<[^>]+>/, '').trim() || null;

    let body = '';
    const flatParts = flattenParts(full.payload);
    const attachmentParts: AttachmentPart[] = [];
    for (const part of flatParts) {
      const p = part as { mimeType?: string; body?: { data?: string; attachmentId?: string }; filename?: string; headers?: { name: string; value: string }[] };
      if (p.mimeType === 'text/plain' && p.body?.data) {
        body = decodeBase64Url(p.body.data);
      }
      const filename = getPartFilename(p) || `attachment_${attachmentParts.length + 1}`;
      const hasData = p.body?.attachmentId || p.body?.data;
      const isBodyPart = p.mimeType === 'text/plain' || p.mimeType === 'text/html';
      if (hasData && !isBodyPart) {
        attachmentParts.push({
          filename,
          mimeType: p.mimeType || 'application/octet-stream',
          attachmentId: p.body?.attachmentId,
          inlineData: p.body?.data ? (p.body.data as string) : undefined,
        });
      }
    }
    if (!body) {
      if (full.payload?.body?.data) body = decodeBase64Url(full.payload.body.data);
      else body = '(No body)';
    }

    const { data: existingTicket } = await serviceSupabase
      .from('tickets')
      .select('id')
      .eq('tenant_id', tenantIdForData)
      .eq('gmail_thread_id', msg.threadId)
      .maybeSingle();

    if (existingTicket) {
      const { data: existingMessage } = await serviceSupabase
        .from('messages')
        .select('id')
        .eq('ticket_id', existingTicket.id)
        .eq('gmail_message_id', msg.id)
        .maybeSingle();
      if (!existingMessage) {
        const { data: inserted } = await serviceSupabase.from('messages').insert({
          tenant_id: tenantIdForData,
          ticket_id: existingTicket.id,
          from_email: fromEmail,
          from_name: fromName,
          content: body,
          is_customer: true,
          gmail_message_id: msg.id,
        }).select('id').single();
        if (inserted?.id && attachmentParts.length > 0) {
          const uploaded = await fetchAndUploadAttachments(
            accessToken, msg.id, attachmentParts, tenantIdForData, existingTicket.id, inserted.id, serviceSupabase
          );
          if (uploaded.length > 0) {
            await serviceSupabase.from('messages').update({ attachments: uploaded }).eq('id', inserted.id);
          }
        }
        created++;
      }
      continue;
    }

    // No thread match: try to match by ticket ID in subject or body (e.g. [TKT-1111] or Re: [TKT-0015] ...)
    const ticketRefRegex = /\[?\s*TKT-(\d+)\s*\]?/gi;
    const extractTicketNumber = (text: string | null | undefined): string | null => {
      if (!text || !text.trim()) return null;
      ticketRefRegex.lastIndex = 0;
      const m = ticketRefRegex.exec(text);
      if (!m) return null;
      const num = parseInt(m[1], 10);
      if (Number.isNaN(num)) return null;
      return 'TKT-' + String(num).padStart(4, '0');
    };
    const ticketNumberNormalized =
      extractTicketNumber(subject) ?? extractTicketNumber(body);
    if (ticketNumberNormalized) {
      const { data: ticketByNumber } = await serviceSupabase
        .from('tickets')
        .select('id')
        .eq('tenant_id', tenantIdForData)
        .eq('ticket_number', ticketNumberNormalized)
        .maybeSingle();
      if (ticketByNumber) {
        const { data: existingMessage } = await serviceSupabase
          .from('messages')
          .select('id')
          .eq('ticket_id', ticketByNumber.id)
          .eq('gmail_message_id', msg.id)
          .maybeSingle();
        if (!existingMessage) {
          const { data: inserted } = await serviceSupabase.from('messages').insert({
            tenant_id: tenantIdForData,
            ticket_id: ticketByNumber.id,
            from_email: fromEmail,
            from_name: fromName,
            content: body,
            is_customer: true,
            gmail_message_id: msg.id,
          }).select('id').single();
          if (inserted?.id && attachmentParts.length > 0) {
            const uploaded = await fetchAndUploadAttachments(
              accessToken, msg.id, attachmentParts, tenantIdForData, ticketByNumber.id, inserted.id, serviceSupabase
            );
            if (uploaded.length > 0) {
              await serviceSupabase.from('messages').update({ attachments: uploaded }).eq('id', inserted.id);
            }
          }
          created++;
        }
        continue;
      }
    }

    let customerId: string | null = null;
    const { data: existingCustomer } = await serviceSupabase
      .from('customers')
      .select('id, name')
      .eq('tenant_id', tenantIdForData)
      .eq('email', fromEmail)
      .maybeSingle();
    if (existingCustomer) {
      customerId = existingCustomer.id;
      // When we receive another email from this customer, save name if we have it and they had no name yet
      const currentName = (existingCustomer as { name?: string | null }).name;
      if (fromName && fromName.trim() && (!currentName || !String(currentName).trim())) {
        await serviceSupabase
          .from('customers')
          .update({ name: fromName.trim() })
          .eq('id', existingCustomer.id);
      }
    } else {
      const { data: newCustomer } = await serviceSupabase
        .from('customers')
        .insert({ tenant_id: tenantIdForData, email: fromEmail, name: fromName })
        .select('id')
        .single();
      if (newCustomer) customerId = newCustomer.id;
    }

    const { data: newTicket, error: ticketErr } = await serviceSupabase
      .from('tickets')
      .insert({
        tenant_id: tenantIdForData,
        customer_id: customerId,
        subject: subject || '(No subject)',
        status: 'open',
        priority: 'medium',
        gmail_thread_id: msg.threadId,
        gmail_message_id: msg.id,
      })
      .select('id, ticket_number')
      .single();

    if (ticketErr || !newTicket) continue;

    const { data: inserted } = await serviceSupabase.from('messages').insert({
      tenant_id: tenantIdForData,
      ticket_id: newTicket.id,
      from_email: fromEmail,
      from_name: fromName,
      content: body,
      is_customer: true,
      gmail_message_id: msg.id,
    }).select('id').single();
    if (inserted?.id && attachmentParts.length > 0) {
      const uploaded = await fetchAndUploadAttachments(
        accessToken, msg.id, attachmentParts, tenantIdForData, newTicket.id, inserted.id, serviceSupabase
      );
      if (uploaded.length > 0) {
        await serviceSupabase.from('messages').update({ attachments: uploaded }).eq('id', inserted.id);
      }
    }

    if (sendTicketReceivedReplyEnabled) {
      const ticketNumber = (newTicket as { ticket_number?: string | null }).ticket_number?.trim() || '';
      const subjectLine = ticketNumber ? `[${ticketNumber}] ${subject || '(No subject)'}`.trim() : (subject || 'Re: Support');
      const replyBody = compileTicketReceivedTemplate(ticketReceivedContent, {
        ticket_number: ticketNumber,
        customer_name: fromName?.trim() || fromEmail,
        customer_email: fromEmail,
        ticket_subject: subject || '(No subject)',
      });
      const replySubject = ticketReceivedSubject || subjectLine;
      const fromAddress = groupEmailTrimmed ?? (gmailRow.email_address?.trim() || '');
      const fromDisplay = groupEmailTrimmed ? 'Support' : (gmailRow.email_address?.trim() || 'Support');
      if (fromAddress) {
        try {
          await sendTicketReceivedReply(
            accessToken,
            msg.threadId,
            fromEmail,
            replySubject,
            replyBody,
            fromAddress,
            fromDisplay
          );
        } catch (e) {
          console.error('Failed to send ticket-received reply', e);
        }
      }
    }

    created++;
  }

  await serviceSupabase
    .from('gmail_sync')
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', gmailRow.user_id)
    .eq('tenant_id', tenantIdForData);

  return created;
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
      .from('gmail_sync')
      .select('user_id, tenant_id, refresh_token, group_email, email_address')
      .eq('is_active', true);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let totalCreated = 0;
    for (const row of rows ?? []) {
      if (!row.refresh_token) continue;
      try {
        totalCreated += await runSyncForGmailRow(serviceSupabase, row as GmailSyncRow);
      } catch (e) {
        console.error('Sync failed for', row.tenant_id, e);
      }
    }
    return new Response(
      JSON.stringify({ success: true, synced: (rows ?? []).length, created: totalCreated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

  let body: { tenant_id?: string | null } = {};
  try {
    if (req.body) body = await req.json();
  } catch {
    // optional body
  }
  const tenantId = body.tenant_id ?? null;
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'Missing tenant_id for sync' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: gmailRow, error: gmailError } = await serviceSupabase
    .from('gmail_sync')
    .select('user_id, tenant_id, refresh_token, group_email, email_address')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();

  if (gmailError || !gmailRow?.refresh_token) {
    return new Response(JSON.stringify({ error: 'Gmail not connected for this organization' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const created = await runSyncForGmailRow(serviceSupabase, gmailRow as GmailSyncRow);
  return new Response(JSON.stringify({ success: true, created }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
