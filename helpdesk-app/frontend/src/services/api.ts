import { supabase } from './supabase';

const getSupabaseUrl = () => import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
const getSupabaseAnonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Cache signed attachment URLs so reopening a ticket doesn't refetch. Signed URLs expire in 1h; we use 55 min TTL. */
const ATTACHMENT_URL_CACHE_TTL_MS = 55 * 60 * 1000;
const attachmentUrlCache = new Map<string, { url: string; expiresAt: number }>();

function normalizePathForCache(p: string): string {
  return String(p).trim().replace(/^\/+|\/+$/g, '');
}

export async function exchangeOAuthCodeForTokens(
  code: string,
  tenantId?: string,
  groupEmail?: string | null
): Promise<{ success: boolean; error?: string }> {
  await supabase.auth.refreshSession();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { success: false, error: 'Ikke innlogget' };
  }
  const url = `${getSupabaseUrl()}/functions/v1/oauth-gmail-callback`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify({
      code,
      tenant_id: tenantId ?? null,
      group_email: groupEmail ?? null,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json.message || json.error || res.statusText;
    let err = typeof message === 'string' ? message : res.statusText;
    if (json.details && typeof json.details === 'string') err += ` (${json.details})`;
    return { success: false, error: err };
  }
  return { success: true };
}

export async function triggerGmailSync(tenantId?: string): Promise<{ success: boolean; created?: number; error?: string }> {
  const { data, error: refreshError } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;
  if (refreshError || !token) {
    return { success: false, error: 'Ikke innlogget' };
  }
  const url = `${getSupabaseUrl()}/functions/v1/sync-gmail-emails`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify({ tenant_id: tenantId ?? null }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: json.error || json.message || res.statusText };
  }
  return { success: true, created: typeof json.created === 'number' ? json.created : 0 };
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
  const { data, error: refreshError } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;
  if (refreshError || !token) {
    return { success: false, error: 'Ikke innlogget' };
  }
  const url = `${getSupabaseUrl()}/functions/v1/send-gmail-reply`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify({ ticketId, message, to, isInternalNote, html, attachment, replyAll }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: json.error || json.message || res.statusText };
  }
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
  const { data, error: refreshError } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;
  if (refreshError || !token) {
    return { success: false, error: 'Ikke innlogget' };
  }
  const url = `${getSupabaseUrl()}/functions/v1/send-gmail-forward`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify({ to, subject, messagePlain, messageHtml, attachment, tenant_id: tenantId ?? null }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: json.error || json.message || res.statusText };
  }
  return { success: true };
}

export async function sendInvitationEmail(
  invitationCode: string,
  inviteLink: string
): Promise<{ sent: boolean; error?: string }> {
  const { data, error: refreshError } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;
  if (refreshError || !token) {
    return { sent: false, error: 'Ikke innlogget' };
  }
  const url = `${getSupabaseUrl()}/functions/v1/send-invitation-email`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify({ invitation_code: invitationCode, invite_link: inviteLink }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { sent: false, error: json.error || json.message || res.statusText };
  }
  return { sent: json.sent === true, error: json.error ?? json.message };
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
    const { data: sessionData } = await supabase.auth.getSession();
    let token = sessionData.session?.access_token;
    if (!token) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      token = refreshData.session?.access_token;
      if (refreshError || !token) {
        return { urls, error: 'Ikke innlogget' };
      }
    }
    const url = `${getSupabaseUrl()}/functions/v1/sign-ticket-attachment-urls`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({ paths: toFetch }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = res.status === 401
        ? (json.message || json.error || 'Sesjon utløpt. Logg inn på nytt.')
        : (json.error || json.message || res.statusText);
      return { urls, error: message };
    }
    const fresh = (json.urls ?? {}) as Record<string, string>;
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
  const { data, error: refreshError } = await supabase.auth.refreshSession();
  const token = data.session?.access_token;
  if (refreshError || !token) {
    return { success: false, error: 'Ikke innlogget' };
  }
  const url = `${getSupabaseUrl()}/functions/v1/send-new-ticket-notification`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify({ ticket_id: ticketId, app_url: appUrl ?? undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: json.error || json.message || res.statusText };
  }
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
