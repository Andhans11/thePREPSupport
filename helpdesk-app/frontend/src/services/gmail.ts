const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/oauth/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

/** True if Google OAuth is configured (client ID set at build time). */
export function isGmailOAuthConfigured(): boolean {
  return !!GOOGLE_CLIENT_ID?.trim();
}

/** Returns the Gmail OAuth URL, or null if VITE_GOOGLE_CLIENT_ID is not set. */
export function getGmailAuthUrl(): string | null {
  if (!GOOGLE_CLIENT_ID?.trim()) return null;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID.trim(),
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getRedirectUri(): string {
  return REDIRECT_URI;
}
