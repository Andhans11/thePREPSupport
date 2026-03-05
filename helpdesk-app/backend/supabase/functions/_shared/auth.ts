import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Validate Bearer token and return Supabase user or null. Does not return Response. */
export async function getUserFromRequest(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ user: { id: string; email?: string }; supabase: ReturnType<typeof createClient> } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await supabase.auth.getUser(token);
  return user ? { user, supabase } : null;
}

/** Return 401 JSON response. Pass jsonHeaders from cors.ts. */
export function unauthorizedResponse(headers: Record<string, string>) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
