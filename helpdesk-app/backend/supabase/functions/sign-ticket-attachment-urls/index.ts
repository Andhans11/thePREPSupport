import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

const BUCKET = 'ticket-attachments';
const EXPIRES_IN = 3600;

function normalizePath(p: string): string {
  return String(p).trim().replace(/^\/+|\/+$/g, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) {
    const message = userError?.message?.toLowerCase().includes('jwt')
      ? 'Session expired or invalid. Please log in again.'
      : 'Unauthorized';
    return new Response(
      JSON.stringify({ error: 'Unauthorized', message }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: { paths?: string[] } = {};
  try {
    if (req.body) body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawPaths = Array.isArray(body.paths) ? body.paths : [];
  const paths = rawPaths.map(normalizePath).filter(Boolean);
  if (paths.length === 0) {
    return new Response(JSON.stringify({ urls: {} }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ticketKeys = new Set<string>();
  for (const p of paths) {
    const parts = p.split('/');
    if (parts.length < 2) {
      return new Response(JSON.stringify({ error: 'Invalid attachment path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    ticketKeys.add(`${parts[0]}/${parts[1]}`);
  }

  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  for (const key of ticketKeys) {
    const [tenantId, ticketId] = key.split('/');
    if (!tenantId || !ticketId) {
      return new Response(JSON.stringify({ error: 'Invalid attachment path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: ticket } = await userClient
      .from('tickets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', ticketId)
      .maybeSingle();
    if (!ticket) {
      return new Response(JSON.stringify({ error: 'Access denied to one or more attachments' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const urls: Record<string, string> = {};
  for (const path of paths) {
    const { data, error } = await serviceSupabase.storage.from(BUCKET).createSignedUrl(path, EXPIRES_IN);
    if (!error && data?.signedUrl) {
      urls[path] = data.signedUrl;
    }
  }

  return new Response(JSON.stringify({ urls }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
