/** Prefer dedicated calendar URI if set (must match Google Console + Supabase allowlist). Falls back to shared Gmail callback. */
export function getGoogleCalendarRedirectUri(): string {
  return (
    import.meta.env.VITE_GOOGLE_CALENDAR_REDIRECT_URI?.trim() ||
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ||
    `${window.location.origin}/oauth/callback`
  );
}

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
];

export function getGoogleCalendarAuthUrl(tenantId: string): string {
  return getGoogleCalendarAuthUrlWithClientId(tenantId, import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
}

export function getGoogleCalendarAuthUrlWithClientId(tenantId: string, clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCalendarRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: `calendar:${tenantId}`,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
