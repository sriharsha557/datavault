import { createClient, SupabaseClient } from '@supabase/supabase-js';

// DO NOT use singleton in development - always create fresh client
// This ensures schema changes are picked up immediately
export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  
  // Always create a fresh client to avoid caching stale schema
  return createClient(url, key, { 
    auth: { persistSession: false },
    db: { 
      schema: 'public'
    },
    global: {
      headers: {
        'x-client-info': 'datavault-assistant'
      }
    }
  });
}

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase public env vars');
  return createClient(url, key);
}
