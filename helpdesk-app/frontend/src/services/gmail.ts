const REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/oauth/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

/**
 * Returns the Gmail OAuth URL for the given tenant using that tenant's client_id.
 * Pass tenantId in state so the callback attaches the connection to the correct tenant.
 */
export function getGmailAuthUrl(tenantId: string, clientId: string): string | null {
  if (!clientId?.trim()) return null;
  const params = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: tenantId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getRedirectUri(): string {
  return REDIRECT_URI;
}
