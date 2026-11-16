-- WES-17: simpan tautan bayar BorderPay di payments.
-- Kolom nullable, aman diterapkan kapan saja (tanpa downtime).
-- TERAPKAN KE DATABASE SELF-HOSTED SEBELUM merge/deploy PR BorderPay
-- (Studio Supabase -> SQL Editor, atau psql). Kode membaca kolom ini secara
-- defensif (select '*'), jadi aplikasi tetap jalan bila migrasi belum
-- diterapkan — hanya tautan bayar yang belum tersimpan.
alter table public.payments add column if not exists pay_url text;
alter table public.payments add column if not exists pay_expires_at timestamptz;
comment on column public.payments.pay_url is 'Halaman bayar BorderPay (pay_url) untuk order menunggu_bayar.';
comment on column public.payments.pay_expires_at is 'Kedalaarsa kode bayar BorderPay (QRIS 60 mnt, VA 24 jam).';
