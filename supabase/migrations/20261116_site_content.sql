-- Kelola konten (PRD §7.10): teks halaman yang bisa diubah admin tanpa edit kode.
-- TERAPKAN KE DATABASE SELF-HOSTED SEBELUM merge/deploy PR ini
-- (Studio Supabase -> SQL Editor, atau psql).
-- Halaman publik membaca tabel ini dengan fallback ke teks bawaan bila baris
-- belum ada, jadi aplikasi tetap jalan bila migrasi belum diterapkan —
-- hanya pengubahan konten yang belum bisa disimpan.
-- Isi hanya teks polos (tanpa HTML): halaman merender sebagai teks.
create table if not exists public.site_content (
  key text primary key,
  body text not null,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
drop policy if exists "site_content_read_public" on public.site_content;
create policy "site_content_read_public" on public.site_content
  for select using (true);
drop policy if exists "site_content_admin_all" on public.site_content;
create policy "site_content_admin_all" on public.site_content
  for all using (public.is_admin());
comment on table public.site_content is 'Teks halaman yang bisa diubah admin (beranda.intro, tentang.intro, bantuan.kontak).';
