import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}
if (supabaseAnonKey === 'REPLACE_WITH_ANON_KEY_FROM_DASHBOARD') {
  throw new Error(
    'Replace VITE_SUPABASE_ANON_KEY in .env with the anon (public) key from Supabase Dashboard > Project Settings > API'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
