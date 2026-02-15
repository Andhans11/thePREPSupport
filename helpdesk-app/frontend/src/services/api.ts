import { supabase } from './supabase';

const getSupabaseUrl = () => import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
const getSupabaseAnonKey = () => import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

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

export async function disconnectGmail(tenantId?: string): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Ikke innlogget' };
  let q = supabase.from('gmail_sync').delete().eq('user_id', user.id);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true };
}
