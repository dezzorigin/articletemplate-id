-- 15 Nov 2026. Perbaiki advisor auth_rls_initplan: bungkus auth.uid() dengan (select ...)
-- supaya dievaluasi sekali per query, bukan per baris. Perilaku akses TIDAK berubah.
-- Jalankan SETELAH 20261113_harden_rls.sql. Aman diulang (drop policy if exists).

drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles
  for select using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = (select auth.uid()));

drop policy if exists "orders_read_own" on public.orders;
create policy "orders_read_own" on public.orders
  for select using (user_id = (select auth.uid()));

drop policy if exists "order_items_owner" on public.order_items;
create policy "order_items_owner" on public.order_items
  for select using (
    exists (select 1 from public.orders
            where id = order_items.order_id
            and (user_id = (select auth.uid()) or public.is_admin()))
  );

drop policy if exists "payments_owner_read" on public.payments;
create policy "payments_owner_read" on public.payments
  for select using (
    exists (select 1 from public.orders
            where id = payments.order_id
            and (user_id = (select auth.uid()) or public.is_admin()))
  );

drop policy if exists "downloads_read_own" on public.downloads;
create policy "downloads_read_own" on public.downloads
  for select using (user_id = (select auth.uid()));

drop policy if exists "bookings_read_own" on public.bookings;
create policy "bookings_read_own" on public.bookings
  for select using (user_id = (select auth.uid()));

drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own" on public.bookings
  for insert with check (
    user_id = (select auth.uid()) and status = 'menunggu'
    and exists (select 1 from public.services s where s.id = service_id and s.is_visible = true));
