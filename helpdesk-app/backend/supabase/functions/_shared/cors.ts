/** Shared CORS headers for Edge Functions. Use for OPTIONS and all JSON responses. */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

export const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
} as const;
