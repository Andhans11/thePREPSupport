import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Allowed redirect URIs for Google token exchange (must match authorize request exactly). */
function getAllowedRedirectUris(): string[] {
  const out: string[] = [];
  const push = (s: string | undefined) => {
    const t = s?.trim();
    if (t) out.push(t);
  };
  push(Deno.env.get('REDIRECT_URI_CALENDAR'));
  push(Deno.env.get('REDIRECT_URI'));
  const extra = Deno.env.get('ALLOWED_REDIRECT_URIS')?.trim();
  if (extra) {
    for (const part of extra.split(',')) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return [...new Set(out)];
}

function resolveRedirectUriForExchange(requested: string | null | undefined): string | null {
  const allowed = getAllowedRedirectUris();
  const trimmed = requested?.trim() ?? '';
  if (trimmed) {
    if (allowed.includes(trimmed)) return trimmed;
    return null;
  }
  const fallback = (Deno.env.get('REDIRECT_URI_CALENDAR') || Deno.env.get('REDIRECT_URI') || '').trim();
  return fallback || null;
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization' }), {
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

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { code?: string; tenant_id?: string | null; redirect_uri?: string | null };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const code = body.code;
  const tenantId = body.tenant_id ?? null;
  if (!code || !tenantId) {
    return new Response(JSON.stringify({ error: 'Missing code or tenant_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: membership } = await supabase
    .from('team_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();
  if (!membership) {
    return new Response(JSON.stringify({ error: 'Du har ikke tilgang til organisasjonen.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { data: oauthRow } = await serviceSupabase
    .from('tenant_google_oauth')
    .select('client_id, client_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!oauthRow?.client_id?.trim() || !oauthRow?.client_secret?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Google OAuth er ikke konfigurert for denne organisasjonen.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const redirectForExchange = resolveRedirectUriForExchange(body.redirect_uri ?? undefined);
  if (!redirectForExchange) {
    const allowed = getAllowedRedirectUris();
    return new Response(
      JSON.stringify({
        error:
          allowed.length === 0
            ? 'REDIRECT_URI (eller ALLOWED_REDIRECT_URIS) mangler i funksjonsmiljøet.'
            : 'redirect_uri er ikke tillatt eller stemmer ikke med funksjonsmiljøet. Legg til nøyaktig samme URL som i Google Console og i ALLOWED_REDIRECT_URIS (f.eks. http://localhost:5173/oauth/callback for lokal utvikling).',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: oauthRow.client_id.trim(),
      client_secret: oauthRow.client_secret.trim(),
      redirect_uri: redirectForExchange,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return new Response(JSON.stringify({ error: `Token exchange failed: ${errText}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const tokens = await tokenRes.json();
  const refreshToken = tokens.refresh_token;
  const accessToken = tokens.access_token;
  const expiry = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;

  if (!refreshToken || !accessToken) {
    return new Response(JSON.stringify({ error: 'Missing tokens from Google response.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let emailAddress = user.email ?? '';
  if (profileRes.ok) {
    const profile = await profileRes.json();
    if (profile.email) emailAddress = profile.email;
  }

  const { error: upsertError } = await serviceSupabase.from('google_calendar_sync').upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      email_address: emailAddress,
      refresh_token: refreshToken,
      access_token: accessToken,
      token_expiry: expiry,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,user_id' }
  );

  if (upsertError) {
    return new Response(JSON.stringify({ error: 'Failed to save calendar credentials.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
