import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== ''
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ data: null, error: new Error('Supabase not configured') }),
        signUp: async () => ({ data: null, error: new Error('Supabase not configured') }),
        signOut: async () => ({ error: null }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
        resend: async () => ({ data: null, error: new Error('Supabase not configured') }),
      },
    };

export const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');
export const AUTH_BASE = (import.meta.env.VITE_AUTH_BASE || '/auth').replace(/\/+$/, '');
