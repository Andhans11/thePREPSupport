import { supabase } from './supabase';

const getSupabaseUrl = () => import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
const getSupabaseAnonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Cache signed attachment URLs so reopening a ticket doesn't refetch. Signed URLs expire in 1h; we use 55 min TTL. */
const ATTACHMENT_URL_CACHE_TTL_MS = 55 * 60 * 1000;
const attachmentUrlCache = new Map<string, { url: string; expiresAt: number }>();

function normalizePathForCache(p: string): string {
  return String(p).trim().replace(/^\/+|\/+$/g, '');
}

/** Get access token for Edge Function calls. Prefer existing session; fallback to refresh. */
async function getTokenAfterRefresh(): Promise<{ token: string } | { error: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const existingToken = sessionData.session?.access_token;
  if (existingToken) return { token: existingToken };

  const { data, error: refreshError } = await supabase.auth.refreshSession();
  const refreshedToken = data.session?.access_token;
  if (refreshError || !refreshedToken) {
    return { error: refreshError?.message || 'Ikke innlogget' };
  }
  return { token: refreshedToken };
}

/** Call a Supabase Edge Function with auth and timeout. */
async function callEdgeFunction<TBody = unknown, TJson = Record<string, unknown>>(
  name: string,
  body: TBody
): Promise<{ ok: true; json: TJson } | { ok: false; error: string }> {
  const auth = await getTokenAfterRefresh();
  if ('error' in auth) return { ok: false, error: auth.error };
  const url = `${getSupabaseUrl()}/functions/v1/${name}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'Forespørselen tok for lang tid. Prøv igjen.' };
    }
    return { ok: false, error: 'Nettverksfeil ved kall til server.' };
  }
  clearTimeout(timeout);
  const json = (await res.json().catch(() => ({}))) as TJson & { error?: string; message?: string };
  if (!res.ok) {
    const msg = json.error ?? json.message ?? res.statusText;
    return { ok: false, error: typeof msg === 'string' ? msg : res.statusText };
  }
  return { ok: true, json };
}

export async function exchangeOAuthCodeForTokens(
  code: string,
  tenantId?: string,
  groupEmail?: string | null
): Promise<{ success: boolean; error?: string }> {
  const result = await callEdgeFunction('oauth-gmail-callback', {
    code,
    tenant_id: tenantId ?? null,
    group_email: groupEmail ?? null,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true };
}

export async function exchangeGoogleCalendarOAuthCodeForTokens(
  code: string,
  tenantId?: string,
  /** Must match the redirect_uri used in the Google authorize URL (and be allow-listed on the Edge Function). */
  redirectUri?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await callEdgeFunction('oauth-google-calendar-callback', {
    code,
    tenant_id: tenantId ?? null,
    redirect_uri: redirectUri ?? null,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true };
}

export async function triggerGoogleCalendarSync(tenantId?: string): Promise<{ success: boolean; synced?: number; error?: string }> {
  const result = await callEdgeFunction<{ tenant_id: string | null }, { synced?: number }>(
    'sync-google-calendar-events',
    { tenant_id: tenantId ?? null }
  );
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, synced: typeof result.json.synced === 'number' ? result.json.synced : 0 };
}

export async function triggerGmailSync(tenantId?: string): Promise<{ success: boolean; created?: number; error?: string }> {
  const result = await callEdgeFunction<{ tenant_id: string | null }, { created?: number }>(
    'sync-gmail-emails',
    { tenant_id: tenantId ?? null }
  );
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, created: typeof result.json.created === 'number' ? result.json.created : 0 };
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export async function sendGmailReply(
  ticketId: string,
  message: string,
  to: string,
  isInternalNote = false,
  html?: string | null,
  attachment?: EmailAttachment | null,
  replyAll = false
): Promise<{ success: boolean; error?: string }> {
  const result = await callEdgeFunction('send-gmail-reply', {
    ticketId,
    message,
    to,
    isInternalNote,
    html: html ?? undefined,
    attachment: attachment ?? undefined,
    replyAll,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true };
}

export async function sendGmailForward(
  to: string,
  subject: string,
  messagePlain: string,
  messageHtml?: string | null,
  attachment?: EmailAttachment | null,
  tenantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const result = await callEdgeFunction('send-gmail-forward', {
    to,
    subject,
    messagePlain,
    messageHtml: messageHtml ?? undefined,
    attachment: attachment ?? undefined,
    tenant_id: tenantId ?? null,
  });
  if (!result.ok) return { success: false, error: result.error };
  return { success: true };
}

export async function sendInvitationEmail(
  invitationCode: string,
  inviteLink: string
): Promise<{ sent: boolean; error?: string }> {
  const result = await callEdgeFunction('send-invitation-email', {
    invitation_code: invitationCode,
    invite_link: inviteLink,
  });
  if (!result.ok) return { sent: false, error: result.error };
  const json = result.json as { sent?: boolean; error?: string };
  return { sent: json.sent === true, error: json.error };
}

/** Get signed URLs for ticket attachment paths. Uses in-memory cache so reopening a ticket doesn't refetch. */
export async function signTicketAttachmentUrls(paths: string[]): Promise<{ urls: Record<string, string>; error?: string }> {
  const now = Date.now();
  const normalizedPaths = paths.map((p) => normalizePathForCache(p)).filter(Boolean);
  const urls: Record<string, string> = {};
  const toFetch: string[] = [];

  for (const path of normalizedPaths) {
    const entry = attachmentUrlCache.get(path);
    if (entry && entry.expiresAt > now) {
      urls[path] = entry.url;
    } else {
      if (entry) attachmentUrlCache.delete(path);
      toFetch.push(path);
    }
  }

  if (toFetch.length > 0) {
    const result = await callEdgeFunction<{ paths: string[] }, { urls?: Record<string, string> }>(
      'sign-ticket-attachment-urls',
      { paths: toFetch }
    );
    if (!result.ok) {
      return { urls, error: result.error };
    }
    const fresh = (result.json.urls ?? {}) as Record<string, string>;
    const expiresAt = now + ATTACHMENT_URL_CACHE_TTL_MS;
    for (const [path, signedUrl] of Object.entries(fresh)) {
      if (signedUrl) {
        const norm = normalizePathForCache(path);
        urls[norm] = signedUrl;
        attachmentUrlCache.set(norm, { url: signedUrl, expiresAt });
      }
    }
  }

  return { urls };
}

/** Notify users who have "email on new ticket" enabled. Called after creating a ticket. */
export async function notifyNewTicket(ticketId: string, appUrl?: string | null): Promise<{ success: boolean; sent?: number; error?: string }> {
  const result = await callEdgeFunction(
    'send-new-ticket-notification',
    { ticket_id: ticketId, app_url: appUrl ?? undefined }
  );
  if (!result.ok) return { success: false, error: result.error };
  const json = result.json as { sent?: number };
  return { success: true, sent: typeof json.sent === 'number' ? json.sent : 0 };
}

export async function disconnectGmail(tenantId?: string): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Ikke innlogget' };
  let q = supabase.from('gmail_sync').delete().eq('user_id', user.id);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true };
}
