import { createClient } from '@supabase/supabase-js';
import { runtimeMode, supabaseAnonKey, supabaseConfigured, supabaseUrl } from './runtime';

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase() {
  if (runtimeMode !== 'production' || !supabase) {
    throw new Error('Supabase is not configured for production mode.');
  }
  return supabase;
}
