-- Diterapkan ke proyek Supabase "articletemplate-id" (ref kckivepafrmyihoigcnb) 13 Nov 2026.
-- Menutup celah RLS di supabase/schema.sql awal. Jalankan SETELAH schema.sql.

-- 1) Pembeli tidak boleh mengubah role sendiri jadi admin: hanya kolom nama.
revoke update on public.profiles from anon, authenticated;
grant update (nama) on public.profiles to authenticated;

-- 2) orders: pembeli hanya baca. Buat/ubah status lewat server (service role).
drop policy if exists "orders_owner" on public.orders;
create policy "orders_read_own" on public.orders for select using (user_id = auth.uid());
create policy "orders_admin_all" on public.orders for all using (public.is_admin());

-- 3) downloads: pembeli hanya baca. Pencatatan lewat server.
drop policy if exists "downloads_owner" on public.downloads;
create policy "downloads_read_own" on public.downloads for select using (user_id = auth.uid());
create policy "downloads_admin_all" on public.downloads for all using (public.is_admin());

-- 4) bookings: baca milik sendiri; buat hanya status 'menunggu' untuk layanan visible.
drop policy if exists "bookings_owner" on public.bookings;
create policy "bookings_read_own" on public.bookings for select using (user_id = auth.uid());
create policy "bookings_insert_own" on public.bookings for insert with check (
  user_id = auth.uid() and status = 'menunggu'
  and exists (select 1 from public.services s where s.id = service_id and s.is_visible = true));
create policy "bookings_admin_all" on public.bookings for all using (public.is_admin());

-- 5) order_items: admin tulis.
create policy "order_items_admin_all" on public.order_items for all using (public.is_admin());

-- 6) Fungsi: kunci search_path. is_admin() sengaja tetap bisa dieksekusi anon/authenticated
--    (dipanggil kebijakan RLS; hanya menjawab "pemanggil admin atau bukan").
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, nama)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nama', null))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 7) Index foreign key.
create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists downloads_user_id_idx on public.downloads (user_id);
create index if not exists downloads_order_id_idx on public.downloads (order_id);
create index if not exists downloads_product_id_idx on public.downloads (product_id);
create index if not exists bookings_user_id_idx on public.bookings (user_id);
create index if not exists bookings_service_id_idx on public.bookings (service_id);

-- Bucket Storage (dibuat via SQL):
-- insert into storage.buckets (id, name, public, file_size_limit) values
--   ('templates','templates',false,52428800), ('previews','previews',true,10485760);
