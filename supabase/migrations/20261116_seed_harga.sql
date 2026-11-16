-- Harga final template — ditetapkan Nabil 16 Nov 2026 (PETA.md §6.1).
-- Sumber harga tunggal tetap kolom products.harga (PRD §7.10).
--
-- CARA PAKAI: jalankan di Supabase self-hosted (backend kanonis) SETELAH
-- schema.sql + migrasi 20261113_*.sql. File ini HANYA mengubah harga;
-- is_visible tetap false untuk semua produk — produk TIDAK BOLEH dijual
-- sampai file template + pratinjau diunggah lewat admin (lihat guard
-- di src/lib/orders.ts dan src/pages/admin/produk/[id].astro).
-- Idempotent: aman dijalankan ulang (ON CONFLICT hanya memperbarui harga).
--
-- Paket Lengkap butuh nilai jenjang di luar Q1–Q4/Sinta/Prosiding, jadi
-- check constraint diperluas dengan 'Paket'. Model file bundle (satu zip
-- atau multi-file) BELUM diputuskan tim — baris ini tetap is_visible=false
-- dan file_path NULL sampai keputusan itu ada.

-- 1) Perluas domain jenjang agar Paket Lengkap bisa disimpan.
alter table public.products drop constraint if exists products_jenjang_check;
alter table public.products add constraint products_jenjang_check
  check (jenjang in ('Q1', 'Q2', 'Q3', 'Q4', 'Sinta', 'Prosiding', 'Paket'));

-- 2) Harga final 6 template jenjang (Rp).
insert into public.products (slug, judul, jenjang, harga, is_visible) values
  ('template-q1', 'Template Scopus Q1', 'Q1', 249000, false),
  ('template-q2', 'Template Scopus Q2', 'Q2', 199000, false),
  ('template-q3', 'Template Scopus Q3', 'Q3', 149000, false),
  ('template-q4', 'Template Scopus Q4', 'Q4', 99000, false),
  ('template-sinta', 'Template Sinta', 'Sinta', 79000, false),
  ('template-prosiding', 'Template Prosiding', 'Prosiding', 59000, false)
on conflict (slug) do update set harga = excluded.harga;

-- 3) Paket Lengkap: keenam template (total satuan Rp834.000 — hemat ~34%).
insert into public.products (slug, judul, jenjang, harga, is_visible) values
  ('paket-lengkap', 'Paket Lengkap', 'Paket', 549000, false)
on conflict (slug) do update set harga = excluded.harga;
