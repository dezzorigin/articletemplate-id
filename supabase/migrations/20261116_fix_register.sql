-- ============================================================
-- 20261116_fix_register.sql — perbaikan pendaftaran (P0, 16 Nov 2026)
-- Cara pakai: tempel seluruh file ini di Supabase Dashboard -> SQL Editor
-- -> New query -> Run. Aman dijalankan ulang (idempotent).
--
-- DIAGNOSIS (lihat README bagian "Auth — bila pendaftaran gagal"):
-- 1) Walkthrough 16 Nov 2026 memakai email @example.com — domain yang
--    GoTrue (Supabase Auth) TOLAK dengan error `email_address_invalid`
--    ("Example and test domains are currently not supported", lihat
--    docs Supabase: Auth error codes). Itu menjelaskan ketiga kegagalan
--    walkthrough: signup ditolak SEBELUM user dibuat, sehingga login
--    sesudahnya menjawab 'salah' (bukan 'konfirmasi'). Kode aplikasi
--    sekarang memetakan error ini ke ?e=domain + menolak domain contoh
--    lebih awal (src/lib/auth.ts).
-- 2) Di luar itu, trigger on_auth_user_created adalah satu-satunya kode
--    database yang bisa me-rollback INSERT auth.users: SATU error di
--    handle_new_user() menggagalkan signup total. Migrasi ini membuat
--    fungsi itu TIDAK PERNAH menggagalkan signup (exception -> WARNING,
--    tetap RETURN NEW) dan memastikan trigger-nya ada.
-- 3) Bila pendaftaran domain ASLI masih gagal setelah migrasi ini, penyebabnya
--    konfigurasi GoTrue, bukan kode: lihat checklist SMTP/autoconfirm di README.
--    Log aplikasi ("[auth] daftar gagal" di log Coolify) menunjukkan kode persisnya.
-- ============================================================

-- Fungsi trigger yang tahan-gagal: insert profil best-effort, error apa pun
-- dicatat sebagai WARNING tanpa me-rollback pembuatan user auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, nama)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nama', null))
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'handle_new_user gagal untuk %: %', new.id, sqlerrm;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Pastikan trigger-nya ada (buat ulang bila hilang / menunjuk fungsi lama).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- VERIFIKASI (jalankan di SQL Editor setelah apply):
--   select tgname from pg_trigger where tgname = 'on_auth_user_created';
--     -> harus 1 baris.
--   select proname, prosecdef from pg_proc where proname = 'handle_new_user';
--     -> harus 1 baris, prosecdef = true.
--   select count(*) from auth.users;
--     -> user lama tetap ada (migrasi ini tidak menyentuh data).
-- UJI END-TO-END (setelah deploy kode baru): daftar dengan email Gmail
-- nyata — JANGAN example.com (GoTrue menolaknya). Harus berhasil, user
-- muncul di Authentication -> Users, baris profiles terbuat, login jalan.
-- ============================================================
