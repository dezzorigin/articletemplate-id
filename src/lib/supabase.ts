import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

let anonClient: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;

/** Klien publik (anon key + RLS). Dipakai untuk data yang boleh dibaca user. */
export function getSupabase(): SupabaseClient {
  anonClient ??= createClient(
    requireEnv('PUBLIC_SUPABASE_URL'),
    requireEnv('PUBLIC_SUPABASE_ANON_KEY'),
  );
  return anonClient;
}

/**
 * Klien service role. HANYA server (webhook, signed URL download).
 * Jangan diimpor dari komponen yang dikirim ke browser.
 */
export function getSupabaseAdmin(): SupabaseClient {
  adminClient ??= createClient(
    requireEnv('PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return adminClient;
}
