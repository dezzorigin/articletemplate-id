-- ============================================================
-- ArticleTemplate.id — skema Supabase (Postgres + RLS)
-- Cara pakai: tempel seluruh file ini di Supabase Dashboard -> SQL Editor
-- -> New query -> Run. Jalankan SEKALI di project baru (backend kanonis:
-- Supabase self-hosted). Skema ini SUDAH berisi policy hasil hardening
-- (dulu di migrasi 20261113_harden_rls.sql) — jangan pakai policy lama.
-- Bucket Storage dibuat terpisah di dashboard (lihat catatan di bawah).
-- Sesuai PRD §9 (model data) + §11 (modul konsultasi).
-- ============================================================

-- ---------- profiles: 1 baris per user auth ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  nama text,
  role text not null default 'pembeli'
    check (role in ('pembeli', 'admin', 'mentor')),
  created_at timestamptz not null default now()
);

-- ---------- Helper: apakah user login adalah admin? ----------
-- Diletakkan SETELAH tabel profiles dibuat: fungsi language sql divalidasi
-- PostgreSQL saat dibuat, jadi referensi ke public.profiles harus sudah ada.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Otomatis buat baris profiles saat user daftar (email/Google).
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
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- products: template yang dijual ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  judul text not null,
  jenjang text not null
    check (jenjang in ('Q1', 'Q2', 'Q3', 'Q4', 'Sinta', 'Prosiding')),
  bidang text,
  deskripsi text,
  format text, -- 'docx' / 'latex' / 'docx+latex' (diisi tim)
  harga numeric, -- NULL = belum ditetapkan -> TIDAK BOLEH dibeli (PRD §7.2)
  file_path text, -- path di bucket Storage 'templates' (private)
  preview_path text, -- path di bucket Storage 'previews' (public)
  is_visible boolean not null default false, -- tampil di katalog?
  created_at timestamptz not null default now()
);

-- ---------- orders ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  total numeric not null,
  status text not null default 'menunggu_bayar'
    check (status in ('menunggu_bayar', 'lunas', 'gagal', 'kedaluwarsa')),
  created_at timestamptz not null default now()
);

-- ---------- order_items: harga di-snapshot, tidak ikut berubah ----------
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  harga_saat_beli numeric not null
);

-- ---------- payments: jejak BorderPay ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  borderpay_ref text,
  metode text check (metode in ('QRIS', 'VA')),
  status text not null default 'menunggu_bayar'
    check (status in ('menunggu_bayar', 'lunas', 'gagal', 'kedaluwarsa')),
  paid_at timestamptz
);

-- ---------- downloads: audit trail unduhan ----------
create table public.downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  product_id uuid not null references public.products (id),
  order_id uuid not null references public.orders (id),
  downloaded_at timestamptz not null default now()
);

-- ---------- services: layanan konsultasi (PLACEHOLDER) ----------
-- is_visible default false = pintu tertutup sampai data Nizam masuk (PRD §11).
create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  judul text not null,
  deskripsi text,
  harga numeric, -- NULL = TBD
  durasi_menit integer, -- NULL = TBD
  is_visible boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- bookings ----------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  service_id uuid not null references public.services (id),
  slot_at timestamptz not null,
  status text not null default 'menunggu'
    check (status in ('menunggu', 'terkonfirmasi', 'selesai', 'dibatalkan')),
  catatan text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS: AKTIF DI SEMUA TABEL. Tanpa ini, anon key bisa baca sembarangan.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.downloads enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;

-- profiles: baca/ubah milik sendiri; admin baca semua.
-- Pembeli hanya boleh mengubah kolom nama (bukan role): tanpa revoke/grant
-- di bawah, policy update ini membiarkan pembeli mengubah role sendiri jadi admin.
create policy "profiles_read_own" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (nama) on public.profiles to authenticated;

-- products: publik hanya yang visible; admin semua
create policy "products_read_public" on public.products
  for select using (is_visible = true);
create policy "products_admin_all" on public.products
  for all using (public.is_admin());

-- orders: pemilik hanya BACA. Buat/ubah status lewat server (service role) —
-- policy lama `for all` membiarkan pembeli UPDATE ordernya sendiri jadi `lunas`.
create policy "orders_read_own" on public.orders
  for select using (user_id = auth.uid());
create policy "orders_admin_all" on public.orders
  for all using (public.is_admin());

-- order_items: lewat kepemilikan order-nya
create policy "order_items_owner" on public.order_items
  for select using (
    exists (select 1 from public.orders
            where id = order_items.order_id
            and (user_id = auth.uid() or public.is_admin()))
  );
create policy "order_items_admin_all" on public.order_items
  for all using (public.is_admin());

-- payments: pemilik (baca) + admin (semua)
create policy "payments_owner_read" on public.payments
  for select using (
    exists (select 1 from public.orders
            where id = payments.order_id
            and (user_id = auth.uid() or public.is_admin()))
  );
create policy "payments_admin_all" on public.payments
  for all using (public.is_admin());

-- downloads: pemilik hanya BACA (audit trail). Pencatatan lewat server —
-- policy lama `for all` membiarkan pembeli menulis tabel audit unduhan.
create policy "downloads_read_own" on public.downloads
  for select using (user_id = auth.uid());
create policy "downloads_admin_all" on public.downloads
  for all using (public.is_admin());

-- services: publik hanya yang visible; admin semua
create policy "services_read_public" on public.services
  for select using (is_visible = true);
create policy "services_admin_all" on public.services
  for all using (public.is_admin());

-- bookings: baca milik sendiri; buat hanya status 'menunggu' untuk layanan visible.
create policy "bookings_read_own" on public.bookings
  for select using (user_id = auth.uid());
create policy "bookings_insert_own" on public.bookings
  for insert with check (
    user_id = auth.uid() and status = 'menunggu'
    and exists (select 1 from public.services s where s.id = service_id and s.is_visible = true));
create policy "bookings_admin_all" on public.bookings
  for all using (public.is_admin());

-- Index foreign key.
create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists downloads_user_id_idx on public.downloads (user_id);
create index if not exists downloads_order_id_idx on public.downloads (order_id);
create index if not exists downloads_product_id_idx on public.downloads (product_id);
create index if not exists bookings_user_id_idx on public.bookings (user_id);
create index if not exists bookings_service_id_idx on public.bookings (service_id);

-- ============================================================
-- SEED PLACEHOLDER: 6 jenjang, harga NULL, is_visible = false.
-- Artinya: ruang sudah ada, tapi TIDAK ADA yang tampil/bisa dibeli
-- sampai tim mengisi harga + file + is_visible = true di admin.
-- ============================================================
insert into public.products (slug, judul, jenjang, harga, is_visible) values
  ('template-q1', 'Template Scopus Q1', 'Q1', null, false),
  ('template-q2', 'Template Scopus Q2', 'Q2', null, false),
  ('template-q3', 'Template Scopus Q3', 'Q3', null, false),
  ('template-q4', 'Template Scopus Q4', 'Q4', null, false),
  ('template-sinta', 'Template Sinta', 'Sinta', null, false),
  ('template-prosiding', 'Template Prosiding', 'Prosiding', null, false);

insert into public.services (slug, judul, harga, is_visible) values
  ('konsultasi-1-1', 'Konsultasi private 1-1', null, false),
  ('jasa-editor', 'Jasa editor', null, false),
  ('bantu-publish', 'Bantu proses publish', null, false),
  ('pembimbing', 'Pembimbing', null, false);

-- ============================================================
-- CATATAN STORAGE (dibuat di dashboard, bukan SQL):
-- - Bucket 'templates': PRIVATE. File template asli. Diakses HANYA lewat
--   signed URL yang diterbitkan server setelah cek order lunas (PRD §7.7).
-- - Bucket 'previews': PUBLIC. Pratinjau parsial saja, bukan file penuh.
-- ============================================================
