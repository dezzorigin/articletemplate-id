import { createClient } from '@supabase/supabase-js';

// Klien publik (anon key + RLS). Dipakai halaman yang butuh data Supabase.
// Selama env belum diisi (tahap scaffold), URL/key placeholder dipakai supaya
// build tidak gagal — query database akan gagal sampai env diisi (lihat README).
const url = import.meta.env.PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

export const supabase = createClient(url, anonKey);
