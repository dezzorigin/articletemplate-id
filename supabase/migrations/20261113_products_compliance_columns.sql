-- Diterapkan ke proyek Supabase articletemplate-id 13 Nov 2026 (WES-12).
alter table public.products
  add column if not exists jurnal text,
  add column if not exists sumber_guideline_url text,
  add column if not exists checklist_kepatuhan text[] not null default '{}';
comment on column public.products.jurnal is 'Nama jurnal target untuk paket per jurnal (PRD 8.3); NULL untuk template per jenjang umum.';
comment on column public.products.sumber_guideline_url is 'Tautan guideline resmi jurnal. Wajib diisi untuk produk per jurnal.';
comment on column public.products.checklist_kepatuhan is 'Daftar periksa kepatuhan, diturunkan dari guideline resmi.';
