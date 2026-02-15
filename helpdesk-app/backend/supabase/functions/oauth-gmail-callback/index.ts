import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REDIRECT_URI = (Deno.env.get('REDIRECT_URI') || '').trim();

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // CORS preflight: must return 200 with body so browser accepts it
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
    console.error('oauth-gmail-callback: auth failed', userError?.message ?? 'no user');
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: userError?.message ?? 'Invalid or expired session. Please log in again.',
      }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  let body: { code?: string; tenant_id?: string | null; group_email?: string | null };
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
  const groupEmail = body.group_email?.trim() || null;
  if (!code) {
    return new Response(JSON.stringify({ error: 'Missing code' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'Missing tenant_id. Select an organization before connecting Gmail.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceSupabaseForOAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const { data: oauthRow, error: oauthError } = await serviceSupabaseForOAuth
    .from('tenant_google_oauth')
    .select('client_id, client_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (oauthError || !oauthRow?.client_id?.trim() || !oauthRow?.client_secret?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Google OAuth er ikke konfigurert for denne organisasjonen. Be en administrator om å legge til Client ID og Secret under E-post innbokser.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!REDIRECT_URI) {
    return new Response(
      JSON.stringify({ error: 'REDIRECT_URI er ikke satt i Edge Function-miljøet. Sett REDIRECT_URI til appens callback-URL (f.eks. https://dittdomene.no/oauth/callback).' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: oauthRow.client_id.trim(),
      client_secret: oauthRow.client_secret.trim(),
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    let details = errText;
    let message: string;
    try {
      const errJson = JSON.parse(errText) as { error?: string; error_description?: string };
      if (errJson.error || errJson.error_description) {
        details = [errJson.error, errJson.error_description].filter(Boolean).join(': ');
      }
      if (errJson.error === 'unauthorized_client') {
        message =
          'Google godtar ikke denne OAuth-klienten. Sjekk: (1) I Google Cloud Console → APIer og tjenester → legitimasjon: at denne klientens «Autoriserte omdirigerings-URI-er» inneholder nøyaktig samme URL som appen bruker (f.eks. ' +
          REDIRECT_URI +
          '). (2) At klienttypen er «Nettapplikasjon». (3) At Client ID og Secret i innstillingene er for samme prosjekt og uten mellomrom. Detaljer: ' +
          details;
      } else if (details.includes('redirect_uri')) {
        message =
          'Omdirigerings-URI stemmer ikke. REDIRECT_URI i Edge Function må være nøyaktig lik i Google Console og i frontend (VITE_GOOGLE_REDIRECT_URI). Detaljer: ' +
          details;
      } else {
        message = 'Token exchange failed: ' + details;
      }
    } catch {
      message = 'Token exchange failed: ' + details;
    }
    return new Response(JSON.stringify({ error: message, details: errText }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const tokens = await tokenRes.json();
  const refreshToken = tokens.refresh_token;
  const accessToken = tokens.access_token;
  const expiry = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;

  if (!refreshToken) {
    return new Response(JSON.stringify({ error: 'No refresh token in response' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let emailAddress = user.email ?? '';
  if (gmailRes.ok) {
    const profile = await gmailRes.json();
    if (profile.emailAddress) emailAddress = profile.emailAddress;
  }

  const { error: upsertError } = await serviceSupabaseForOAuth.from('gmail_sync').upsert(
    {
      tenant_id: tenantId,
      user_id: user.id,
      email_address: emailAddress,
      group_email: groupEmail,
      refresh_token: refreshToken,
      access_token: accessToken,
      token_expiry: expiry,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,user_id' }
  );

  if (upsertError) {
    console.error('oauth-gmail-callback: upsert failed', upsertError.message);
    return new Response(JSON.stringify({ error: upsertError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('oauth-gmail-callback: success', user.id, emailAddress);
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
