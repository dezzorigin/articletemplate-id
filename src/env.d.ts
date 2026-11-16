/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Klien Supabase per-request yang membawa sesi dari cookie (anon key + RLS). */
    supabase: import('@supabase/supabase-js').SupabaseClient;
    /** User terverifikasi server (getUser), null bila belum login. */
    user: import('@supabase/supabase-js').User | null;
  }
}
